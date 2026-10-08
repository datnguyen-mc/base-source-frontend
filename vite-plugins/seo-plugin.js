import path from 'node:path';
import { runnerImport } from 'vite';

// Applies src/seo.config.js + src/seo.routes.js to every build mode:
//   • index.html — its SEO tags are replaced by the site defaults, <html lang> gets site.lang
//     (dev:ssr is left alone: server.js puts each page's own head in per request)
//   • SPA build  — emits robots.txt and sitemap.xml (static routes; SSR/SSG add dynamic ones)
//   • `vite` dev — serves /robots.txt and /sitemap.xml, full-reloads when the config changes
// The SEO modules are loaded through Vite (aliases, imports all work): the dev server's SSR
// loader while serving, a one-off module runner during `vite build`.
const ENTRY = '/src/entry-server.js';

// Packages that touch window/document the moment they are imported. In the server build their
// imports in app code become an inert stand-in (components render nothing, calls do nothing),
// so one page with a map or an editor cannot stop every other page from rendering on the
// server. The browser always gets the real package. Wrap such widgets in <ClientOnly> to keep
// server and browser markup identical.
const BROWSER_ONLY = [
  'quill', 'react-quill', 'react-quill-new', '@toast-ui/editor', '@toast-ui/react-editor',
  'leaflet', 'react-leaflet', 'mapbox-gl', 'maplibre-gl', 'react-map-gl', '@react-google-maps/api',
  'html5-qrcode', 'html2canvas', 'jspdf', 'pdfjs-dist', 'react-pdf', '@ffmpeg/ffmpeg', '@ffmpeg/util',
  'lottie-web', 'lottie-react', 'apexcharts', 'react-apexcharts', 'wavesurfer.js', 'video.js', 'plyr',
  'fabric', 'konva', 'react-konva', 'xterm', '@xterm/xterm', 'grapesjs', 'tui-image-editor',
];
const packageOf = (source) => (source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0]);
const isBrowserOnly = (source) => BROWSER_ONLY.includes(packageOf(source)) && !/\.(css|scss|sass|less)$/.test(source);
const INERT = '__vibexSsrInert';
const INERT_PRELUDE =
  `const ${INERT} = new Proxy(function () { return null; }, { get: (_t, key) => key === 'prototype' ? {} : ` +
  `typeof key === 'symbol' || ['then', '$$typeof', 'isReactComponent', 'defaultProps', 'contextType', 'propTypes', ` +
  `'getDerivedStateFromProps', 'childContextTypes', 'displayName'].includes(key) ? undefined : ${INERT}, ` +
  `apply: () => null, construct: () => ${INERT} });\n`;
// `import A, { b, c as d } from 'pkg'` → `const A = inert, b = inert, d = inert;`
const declare = (clause) => {
  const names = [];
  const namespace = clause.match(/\*\s+as\s+([\w$]+)/);
  if (namespace) names.push(namespace[1]);
  const named = clause.match(/\{([^}]*)\}/);
  if (named) {
    named[1].split(',').map((part) => part.trim()).filter(Boolean)
      .forEach((part) => names.push(part.split(/\s+as\s+/).pop().trim()));
  }
  const defaultName = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, ' ').trim();
  if (defaultName) names.unshift(defaultName);
  return names.length ? `const ${names.map((name) => `${name} = ${INERT}`).join(', ')};` : '';
};
const IMPORT_FROM = /^[ \t]*import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"];?/gm;
const IMPORT_BARE = /^[ \t]*import\s+['"]([^'"]+)['"];?/gm;

export function seoPlugin() {
  let resolved;
  let devServer;
  let buildEntry;
  const loadEntry = () => {
    if (devServer) return devServer.ssrLoadModule(ENTRY);
    buildEntry ??= runnerImport(ENTRY, {
      root: resolved.root,
      resolve: { alias: resolved.resolve.alias },
      logLevel: 'error',
    }).then((result) => result.module);
    return buildEntry;
  };
  return {
    name: 'vibex-seo',
    configResolved(config) {
      resolved = config;
    },
    transform(code, id, options) {
      const server = this.environment ? this.environment.config.consumer === 'server' : options?.ssr;
      if (!server || id.includes('/node_modules/') || !/\.[cm]?[jt]sx?$/.test(id.split('?')[0])) return null;
      if (!BROWSER_ONLY.some((pkg) => code.includes(pkg))) return null;
      let changed = false;
      const out = code
        .replace(IMPORT_FROM, (statement, clause, source) =>
          isBrowserOnly(source) ? ((changed = true), declare(clause)) : statement)
        .replace(IMPORT_BARE, (statement, source) => (isBrowserOnly(source) ? ((changed = true), '') : statement));
      return changed ? { code: INERT_PRELUDE + out, map: null } : null;
    },
    async transformIndexHtml(html, ctx) {
      const entry = await loadEntry();
      html = html.replace(/<html([^>]*)\slang="[^"]*"/, (_match, attrs) => `<html${attrs} lang="${entry.siteLang()}"`);
      if (ctx.server?.config.server.middlewareMode) return html;
      return entry.injectPage(html, { head: entry.renderIndexHead() });
    },
    configureServer(server) {
      devServer = server;
      const configFile = path.resolve(resolved.root, 'src/seo.config.js');
      server.watcher.on('change', (file) => {
        if (path.resolve(file) === configFile) server.ws.send({ type: 'full-reload' });
      });
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/robots.txt' && req.url !== '/sitemap.xml') return next();
        const entry = await loadEntry();
        const fallbackUrl = `http://${req.headers.host}`;
        const isRobots = req.url === '/robots.txt';
        res.setHeader('Content-Type', isRobots ? 'text/plain' : 'application/xml');
        res.end(isRobots ? entry.renderRobots({ fallbackUrl }) : entry.renderStaticSitemap({ fallbackUrl }));
      });
    },
    async generateBundle() {
      if (resolved.build.ssr) return;
      const entry = await loadEntry();
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: entry.renderRobots() });
      if (entry.siteUrlOf('')) {
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: entry.renderStaticSitemap() });
      } else {
        this.warn('site.url / SITE_URL is not set — sitemap.xml skipped (sitemaps need absolute URLs).');
      }
    },
  };
}
