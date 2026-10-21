import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

// The browser build's text files also written compressed — x.js.br and x.js.gz next to x.js — at
// the best level, once. The production server (server.js, sirv) sends those as they are instead of
// compressing every response again (CPU and memory on each request, at a lower level: bigger
// files); static hosts that serve precompressed files (nginx gzip_static…) can use them too.
// Not HTML: build:ssg rewrites index.html after this (scripts/prerender.js), and a host would send
// the stale index.html.br — the empty SPA page — in its place. HTML is small and SSR renders it.
const TEXT = /\.(js|mjs|css|svg|json|xml|txt|map|wasm)$/;
const MIN_BYTES = 1024;
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export function precompressPlugin() {
  let outDir;
  return {
    name: 'vibex-precompress',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.ssr ? null : path.resolve(config.root, config.build.outDir);
    },
    async writeBundle(_options, bundle) {
      if (!outDir) return;
      await Promise.all(
        Object.keys(bundle)
          .filter((file) => TEXT.test(file))
          .map(async (file) => {
            const source = await fs.readFile(path.join(outDir, file));
            if (source.length < MIN_BYTES) return;
            const [br, gz] = await Promise.all([
              brotli(source, {
                params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length },
              }),
              gzip(source, { level: 9 }),
            ]);
            // Not worth a file (and a lookup) when it barely shrinks.
            if (br.length < source.length * 0.9) await fs.writeFile(path.join(outDir, `${file}.br`), br);
            if (gz.length < source.length * 0.9) await fs.writeFile(path.join(outDir, `${file}.gz`), gz);
          }),
      );
    },
  };
}
