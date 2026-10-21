import fs from 'node:fs/promises';
import path from 'node:path';

// A spinner instead of a white page on a first visit. A <link rel="stylesheet"> in <head> holds the
// first paint until it has arrived — on a slow connection, seconds after the HTML. So:
//   • src/loading.css goes into <head> as it is: the page held back, a spinner in its place;
//   • src/loaded.css, which lets the page go, comes right after #root — in <body>, where a
//     stylesheet does not hold the first paint. The build bundles it into the app's stylesheet and
//     links that one there instead, with a preload in <head> so it still downloads from the start.
//     In dev it goes in as it is (<style data-app-loaded>, no download of its own), and dev:ssr
//     links the app's stylesheets before it (server.js). Scripts still wait for them all before
//     they run, as they did;
//   • stylesheets index.html links from other sites in <head> (Google Fonts…) would hold the first
//     paint just the same: they go after #root too, in their order and before the app's own (which
//     still win over them), preloaded in <head>. The page can show before they are in — a web font
//     then swaps in, as `display=swap` already does.
// All of it comes from here, not from index.html: an index.html rewritten without it still works.
const minify = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{};])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
const STYLESHEET = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
const FROM_ELSEWHERE = /\shref=["']?(?:https?:)?\/\//i;
// #root's <div></div> and the stylesheets already linked right after it.
const ROOT_DIV = /([ \t]*)(<div\b[^>]*\sid=["']root["'][^>]*>\s*<\/div>(?:\s*<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>)*)/i;
// Tags after #root and the stylesheets that follow it (before </body> when there is no #root).
const afterRoot = (html, tags) =>
  ROOT_DIV.test(html)
    ? html.replace(ROOT_DIV, (div, indent) => [div, ...tags.map((tag) => indent + tag)].join('\n'))
    : html.replace(/<\/body>/i, () => `${tags.join('\n')}\n</body>`);
const preloadOf = (tag) => tag.replace(/\brel=["']?stylesheet["']?/i, 'rel="preload" as="style"');

export function loadingPlugin() {
  let root;
  let dev;
  return [
    {
      name: 'vibex-loading',
      configResolved(config) {
        root = config.root;
        dev = config.command === 'serve';
      },
      // 'pre': before Vite reads index.html, so the link is bundled into the build like one written there.
      transformIndexHtml: {
        order: 'pre',
        async handler(html) {
          const css = await fs.readFile(path.join(root, 'src/loading.css'), 'utf-8');
          const loaded = dev
            ? `<style data-app-loaded>${minify(await fs.readFile(path.join(root, 'src/loaded.css'), 'utf-8'))}</style>`
            : '<link rel="stylesheet" href="/src/loaded.css">';
          const head = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i)?.[0] ?? '';
          const fromElsewhere = (head.match(STYLESHEET) ?? []).filter((tag) => FROM_ELSEWHERE.test(tag));
          for (const tag of fromElsewhere) html = html.replace(tag, () => preloadOf(tag));
          return {
            html: afterRoot(html, [...fromElsewhere, loaded]),
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
        for (const tag of links) html = html.replace(tag, () => preloadOf(tag));
        return afterRoot(html, links);
      },
    },
  ];
}
