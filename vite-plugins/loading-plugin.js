import fs from 'node:fs/promises';
import path from 'node:path';

// A spinner instead of a white page on a first visit. A <link rel="stylesheet"> in <head> holds the
// first paint until it has arrived — on a slow connection, seconds after the HTML. So:
//   • src/loading.css goes into <head> as it is: the page held back, a spinner in its place;
//   • src/loaded.css, which lets the page go, is linked right after #root — in <body>, where a
//     stylesheet does not hold the first paint. The build bundles it into the app's stylesheet and
//     links that one there instead, with a preload in <head> so it still downloads from the start;
//     dev:ssr puts the app's stylesheets before it (server.js). Scripts still wait for them all
//     before they run, as they did.
// All of it comes from here, not from index.html: an index.html rewritten without it still works.
const minify = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
const ROOT_DIV = /([ \t]*)(<div\b[^>]*\sid=["']root["'][^>]*>\s*<\/div>)/i;
// Tags right after #root's <div></div> (before </body> when there is none).
const afterRoot = (html, tags) =>
  ROOT_DIV.test(html)
    ? html.replace(ROOT_DIV, (div, indent) => [div, ...tags.map((tag) => indent + tag)].join('\n'))
    : html.replace(/<\/body>/i, () => `${tags.join('\n')}\n</body>`);

export function loadingPlugin() {
  let root;
  return [
    {
      name: 'vibex-loading',
      configResolved(config) {
        root = config.root;
      },
      // 'pre': before Vite reads index.html, so the link is bundled (build) / served (dev) like one written there.
      transformIndexHtml: {
        order: 'pre',
        async handler(html) {
          const css = await fs.readFile(path.join(root, 'src/loading.css'), 'utf-8');
          return {
            html: afterRoot(html, ['<link rel="stylesheet" href="/src/loaded.css">']),
            tags: [{ tag: 'style', children: minify(css), injectTo: 'head' }],
          };
        },
      },
    },
    {
      name: 'vibex-loading:build',
      apply: 'build',
      // Runs after Vite has linked the build's stylesheets in <head>.
      transformIndexHtml(html, { chunk }) {
        const files = [...(chunk?.viteMetadata?.importedCss ?? [])];
        const links = (html.match(/<link\b[^>]*\brel="stylesheet"[^>]*>/g) || []).filter((tag) =>
          files.some((file) => tag.includes(`${file}"`)),
        );
        if (!links.length) return html;
        for (const tag of links) html = html.replace(tag, () => tag.replace('rel="stylesheet"', 'rel="preload" as="style"'));
        return afterRoot(html, links);
      },
    },
  ];
}
