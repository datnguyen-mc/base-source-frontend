import path from 'node:path';

// Published SSR servers run without node_modules: `node server.prod.mjs --prod`, next to dist/ and
// public/. So the SSR build carries every package the render uses (ssr.noExternal), and once the
// one server.js loads (dist/server) is written, server.js itself — express, compression, sirv —
// becomes server.prod.mjs, one file. vite stays out (dev only); dist/ is loaded at run time.
// Packages that do not bundle as they are get fixed here. jsdom resolves its sync-XHR worker file
// when it loads, and a bundle has no such file next to it: jsdom already allows for bundlers
// without require.resolve, which only drops sync XHR — never used on the server.
export function serverBundlePlugin() {
  let root;
  let serverEntry = false;
  return {
    name: 'vibex-server-bundle',
    apply: 'build',
    config(_config, { isSsrBuild }) {
      if (isSsrBuild) return { ssr: { noExternal: true } };
    },
    configResolved(config) {
      root = config.root;
      // build:ssr's dist/server — not build:ssg's dist-ssr, which is only prerendered from.
      serverEntry = Boolean(config.build.ssr) && path.resolve(root, config.build.outDir) === path.resolve(root, 'dist/server');
    },
    transform(code, id) {
      if (!id.includes('/jsdom/lib/jsdom/living/xhr/')) return null;
      const out = code.replace(/require\.resolve\s*\?\s*require\.resolve\(["']\.\/xhr-sync-worker\.js["']\)\s*:\s*null/, 'null');
      return out === code ? null : { code: out, map: null };
    },
    async closeBundle() {
      if (!serverEntry) return;
      const { build } = await import('rolldown');
      await build({
        cwd: root,
        input: path.join(root, 'server.js'),
        platform: 'node',
        external: ['vite', /^\.\/dist\//],
        output: { file: path.join(root, 'server.prod.mjs'), format: 'esm', codeSplitting: false },
        logLevel: 'warn',
      });
    },
  };
}
