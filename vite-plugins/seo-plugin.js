import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseAst, runnerImport } from 'vite';

// Applies src/seo.config.js + src/seo.routes.js to every build mode:
//   • index.html — its SEO tags are replaced by the site defaults, <html lang> gets site.lang
//     (the default language's on a multi-language site; dev:ssr is left alone: server.js puts
//     each page's own head and lang in per request). In CSR (`vite`, the SPA build) the
//     site-wide tags index.html has itself win over `site` (src/seo/index-html.js)
//   • SPA build  — emits robots.txt and sitemap.xml (static routes; SSR/SSG add dynamic ones)
//   • `vite` dev — serves /robots.txt and /sitemap.xml, full-reloads when the config changes
// A robots.txt / sitemap.xml the app ships in public/ (e.g. uploaded) wins: it is served / copied
// as it is, and only a missing one is generated.
// The SEO modules are loaded through Vite (aliases, imports all work): the dev server's SSR
// loader while serving, a one-off module runner during `vite build`.
const ENTRY = '/src/entry-server.js';
const SCRIPT = /\.[cm]?[jt]sx?$/;

// ── Browser-only packages: an inert stand-in in the server build ─────────────────────────────
// Packages that touch window/document the moment they are imported. In the server build their
// imports in app code become an inert stand-in (components render nothing, calls do nothing),
// so one page with a map or an editor cannot stop every other page from rendering on the
// server. The browser always gets the real package. Wrap such widgets in <ClientOnly> to keep
// server and browser markup identical.
const BROWSER_ONLY = [
  'quill', 'react-quill', 'react-quill-new', '@toast-ui/editor', '@toast-ui/react-editor',
  'leaflet', 'react-leaflet', 'mapbox-gl', 'maplibre-gl', 'react-map-gl', '@react-google-maps/api',
  'html5-qrcode', 'html2canvas', 'jspdf', 'pdfjs-dist', 'react-pdf', '@react-pdf/renderer', '@ffmpeg/ffmpeg', '@ffmpeg/util',
  'lottie-web', 'lottie-react', 'apexcharts', 'react-apexcharts', 'wavesurfer.js', 'video.js', 'plyr',
  'fabric', 'konva', 'react-konva', 'xterm', '@xterm/xterm', 'grapesjs', 'tui-image-editor',
  // Native addons: no browser runs them, and the published server (one bundle, no node_modules)
  // cannot load them — imported by a page, they would keep every page from rendering on the server.
  'sharp', 'canvas', 'bcrypt', 'argon2', 'better-sqlite3', 'sqlite3',
];
const packageOf = (source) => (source.startsWith('@') ? source.split('/').slice(0, 2).join('/') : source.split('/')[0]);
const isBrowserOnly = (source) => BROWSER_ONLY.includes(packageOf(source)) && !/\.(css|scss|sass|less)$/.test(source);
const INERT = '__vibexSsrInert';
const INERT_PRELUDE =
  `const ${INERT} = new Proxy(function () { return null; }, { get: (_t, key) => key === 'prototype' ? {} : ` +
  `typeof key === 'symbol' || ['then', '$$typeof', 'isReactComponent', 'defaultProps', 'contextType', 'propTypes', ` +
  `'getDerivedStateFromProps', 'childContextTypes', 'displayName'].includes(key) ? undefined : ${INERT}, ` +
  // Rendered as a component (called with props) → nothing; called as the library's API
  // (`Quill.import('ui/icons').bold = …` at module level) → the stand-in again, so set-up code runs.
  `apply: (_t, _self, args) => (args[0] !== null && typeof args[0] === 'object' ? null : ${INERT}), ` +
  `construct: () => ${INERT}, set: () => true });\n`;
const IMPORT_FROM = /^[ \t]*import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"];?/gm;
const IMPORT_BARE = /^[ \t]*import\s+['"]([^'"]+)['"];?/gm;
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
/** `code` with its browser-only imports turned into the inert stand-in — as is when it has none. */
const stubBrowserOnly = (code) => {
  if (!BROWSER_ONLY.some((pkg) => code.includes(pkg))) return code;
  const out = code
    .replace(IMPORT_FROM, (statement, clause, source) => (isBrowserOnly(source) ? declare(clause) : statement))
    .replace(IMPORT_BARE, (statement, source) => (isBrowserOnly(source) ? '' : statement));
  return out === code ? code : INERT_PRELUDE + out;
};

// ── `react` / `framer-motion` in the app's own files ─────────────────────────────────────────
// So that the HTML a server render sends is the full page — as Postman or a crawler gets it, no
// script run — the app's own files see:
//   • `react` through src/seo/hooks.js, whose hooks let the server render a page with the data its
//     effects load (src/seo/server-effects.js) and the browser hydrate it;
//   • `framer-motion` through src/seo/motion.js, whose motion elements render visible on the
//     server (no `initial={{ opacity: 0 }}` in the HTML) and still animate after navigation.
// Shared infrastructure keeps the real packages: its effects (the auth check, the visual
// editor…) must never run on the server.
const SSR_IMPORTS = { react: '@/seo/hooks', 'framer-motion': '@/seo/motion' };
const REAL_REACT = [
  /\/src\/(seo|sdk|api|components\/ui)\//,
  /\/src\/(main|App|entry-server)\.[jt]sx?$/,
  /\/src\/lib\/(AuthContext|AuthProvider|IframeHeartbeat|NavigationTracker|PageNotFound|VisualEditAgent|app-params|coreUtils|google-translate-guard|iframe-messaging|ipBlock|query-client|useAuth)\.[jt]sx?$/,
  /\/src\/components\/(IpAccessRestricted|UserNotRegisteredError|PoweredByBadge)\.[jt]sx?$/,
];
// The wrappers themselves always import the real packages, whatever REAL_REACT says: rewritten,
// src/seo/hooks.js would import itself and the app would not start at all.
const isWrapper = (file, root) =>
  Object.values(SSR_IMPORTS).some((id) => file.replace(SCRIPT, '') === `${root}/${id.replace(/^@\//, 'src/')}`);
const usesAppHooks = (file, root) =>
  file.startsWith(`${root}/src/`) && !isWrapper(file, root) && !REAL_REACT.some((re) => re.test(file));
const SSR_IMPORT_HINT = /['"](?:react|framer-motion)['"]/;
// The source of every `import … from` / `export … from` naming one of SSR_IMPORTS, from the parsed
// module — never a string or a comment that happens to contain `from 'react'`. null: nothing to do.
const rewriteImports = (code, file) => {
  if (!SSR_IMPORT_HINT.test(code)) return null;
  let ast;
  try {
    ast = parseAst(code, { lang: /\.[cm]?tsx?$/.test(file) ? 'tsx' : 'jsx' });
  } catch {
    return null;
  }
  const sources = ast.body
    .filter((node) => /^(?:Import|ExportNamed|ExportAll)Declaration$/.test(node.type) && Object.hasOwn(SSR_IMPORTS, node.source?.value ?? ''))
    .map((node) => node.source)
    .sort((a, b) => b.start - a.start);
  if (!sources.length) return null;
  return sources.reduce((out, source) => `${out.slice(0, source.start)}'${SSR_IMPORTS[source.value]}'${out.slice(source.end)}`, code);
};

// ── src/seo/fetch-hook.js before the SDK ─────────────────────────────────────────────────────
// The SDK keeps the fetch it finds when a client is created, so src/seo/fetch-hook.js (which holds
// a server render's writes back and replays its reads in the browser) is imported first by every
// module of src/sdk and src/api — whatever order the entries list their imports in.
const FETCH_HOOK_IMPORT = "import '@/seo/fetch-hook';\n";
const needsFetchHook = (file, root) => file.startsWith(`${root}/src/sdk/`) || file.startsWith(`${root}/src/api/`);

// ── src/seo/server-dom.js without dompurify ──────────────────────────────────────────────────
// It sets DOMPurify up for the server: an app without dompurify installed gets null there, not a
// build that fails — in every build and in the runner that loads the SSR entry for index.html.
const NO_DOMPURIFY = '\0vibex-seo:no-dompurify';
const dompurifyFallback = {
  resolveId(source, importer) {
    if (source !== 'dompurify' || !importer?.split('?')[0].endsWith('/src/seo/server-dom.js')) return null;
    try {
      createRequire(importer).resolve('dompurify');
      return null; // installed: resolved as usual
    } catch {
      return NO_DOMPURIFY;
    }
  },
  load(id) {
    return id === NO_DOMPURIFY ? 'export default null;' : null;
  },
};

// ── CSR: index.html first ────────────────────────────────────────────────────────────────────
// When the app renders in the browser alone — `vite` and the SPA build (`npm run build`) —
// src/seo/index-html.js is the site-wide values of index.html's own <head>, named as `site` in
// src/seo.config.js names them (the first tag listed that has one; `url` the origin of its
// canonical), and src/seo/engine.js lays them over `site`. Read anew when index.html changes.
// Server-rendered modes keep src/seo.config.js alone (null): dev:ssr (Vite in middleware mode
// under server.js), build:ssr and build:ssg — their client build too, so on navigation the browser
// renders each page's head as the server did.
const INDEX_HTML_MODULE = 'src/seo/index-html.js';
const SERVER_RENDERED_SCRIPT = /:(?:ssr|ssg)$/;
const INDEX_HTML_FIELDS = {
  name: ['title', 'property:og:site_name', 'name:apple-mobile-web-app-title'],
  description: ['name:description', 'property:og:description', 'name:twitter:description'],
  keywords: ['name:keywords'],
  image: ['property:og:image', 'name:twitter:image'],
  favicon: ['rel:icon', 'rel:shortcut icon'],
  appleTouchIcon: ['rel:apple-touch-icon'],
  themeColor: ['name:theme-color'],
  twitterSite: ['name:twitter:site'],
};
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeHtml = (text) =>
  text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, ref) => {
    if (ref[0] !== '#') return ENTITIES[ref.toLowerCase()] ?? entity;
    const code = /^#x/i.test(ref) ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
const attrOf = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3]).trim() : '';
};
/** index.html → { name, description, image, favicon, lang, … }: only what it has. */
const indexHtmlSite = (html) => {
  const head = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '').replace(/<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const found = {};
  for (const [tag, title] of head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>|<(?:meta|link)\b[^>]*>/gi)) {
    const isMeta = /^<meta/i.test(tag);
    const kind = title !== undefined ? 'title' : isMeta ? (attrOf(tag, 'name') ? 'name' : 'property') : 'rel';
    const key = kind === 'title' ? 'title' : attrOf(tag, kind) && `${kind}:${attrOf(tag, kind).toLowerCase()}`;
    const value = title !== undefined ? decodeHtml(title).replace(/\s+/g, ' ').trim() : attrOf(tag, isMeta ? 'content' : 'href');
    if (key && value && !(key in found)) found[key] = value;
  }
  const site = {};
  for (const [field, keys] of Object.entries(INDEX_HTML_FIELDS)) {
    const value = keys.map((key) => found[key]).find(Boolean);
    if (value) site[field] = value;
  }
  const url = ['rel:canonical', 'property:og:url'].map((key) => found[key]).find((value) => /^https?:\/\/[^/]/i.test(value ?? ''));
  if (url) site.url = new URL(url).origin;
  const lang = attrOf(html.match(/<html\b[^>]*>/i)?.[0] ?? '', 'lang');
  return lang ? { ...site, lang } : site;
};

export function seoPlugin() {
  let resolved;
  let devServer;
  let buildEntry;
  const indexHtmlFile = () => path.join(resolved.root, 'index.html');
  const indexHtmlModule = () => `${resolved.root}/${INDEX_HTML_MODULE}`;
  const isCsr = () =>
    resolved.command === 'serve'
      ? !resolved.server.middlewareMode
      : !resolved.build.ssr && !SERVER_RENDERED_SCRIPT.test(process.env.npm_lifecycle_event || '');
  // In the browser and on the server alike (the dev server's SSR loader, the build's module runner).
  const indexHtmlLoader = {
    name: 'vibex-seo:index-html',
    async load(id) {
      if (id.split('?')[0] !== indexHtmlModule() || !isCsr()) return null;
      const html = await fs.readFile(indexHtmlFile(), 'utf-8').catch(() => '');
      return `export default ${JSON.stringify(indexHtmlSite(html))};\n`;
    },
  };
  const loadEntry = () => {
    if (devServer) return devServer.ssrLoadModule(ENTRY);
    buildEntry ??= runnerImport(ENTRY, {
      root: resolved.root,
      resolve: { alias: resolved.resolve.alias },
      plugins: [{ name: 'vibex-seo:dompurify', ...dompurifyFallback }, indexHtmlLoader],
      logLevel: 'error',
    }).then((result) => result.module);
    return buildEntry;
  };
  const shipped = async (name) =>
    Boolean(resolved.publicDir) && (await fs.stat(path.join(resolved.publicDir, name)).then((s) => s.isFile(), () => false));
  return {
    name: 'vibex-seo',
    configResolved(config) {
      resolved = config;
    },
    ...dompurifyFallback,
    async load(id) {
      return dompurifyFallback.load(id) ?? indexHtmlLoader.load(id);
    },
    transform(code, id, options) {
      const file = id.split('?')[0];
      if (id.includes('/node_modules/') || !SCRIPT.test(file)) return null;
      const { root } = resolved;
      const isServer = this.environment ? this.environment.config.consumer === 'server' : options?.ssr;
      // Both builds, so the browser hydrates with the same hooks the server rendered with.
      let out = (usesAppHooks(file, root) && rewriteImports(code, file)) || code;
      if (needsFetchHook(file, root)) out = FETCH_HOOK_IMPORT + out;
      if (isServer) out = stubBrowserOnly(out);
      return out === code ? null : { code: out, map: null };
    },
    async transformIndexHtml(html, ctx) {
      const entry = await loadEntry();
      // The same rewrite as each SSR page's (src/seo/head.js), so the two never differ.
      html = entry.withLang(html, entry.siteLang());
      if (ctx.server?.config.server.middlewareMode) return html;
      return entry.injectPage(html, { head: entry.renderIndexHead() });
    },
    configureServer(server) {
      devServer = server;
      const configFile = path.resolve(resolved.root, 'src/seo.config.js');
      server.watcher.on('change', (file) => {
        if (path.resolve(file) === configFile) server.ws.send({ type: 'full-reload' });
        if (path.resolve(file) !== indexHtmlFile() || !isCsr()) return;
        // Vite reloads the page for index.html by itself; what was built from it is built anew,
        // in the browser and on the server (both re-run an invalidated module and its importers).
        for (const environment of Object.values(server.environments)) {
          const mod = environment.moduleGraph.getModuleById(indexHtmlModule());
          if (mod) environment.moduleGraph.invalidateModule(mod);
        }
      });
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/robots.txt' && req.url !== '/sitemap.xml') return next();
        // The app ships its own in public/: Vite serves it as it is.
        if (await shipped(req.url.slice(1))) return next();
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
      // One the app ships in public/ is copied into the build as it is: nothing to generate.
      if (!(await shipped('robots.txt'))) this.emitFile({ type: 'asset', fileName: 'robots.txt', source: entry.renderRobots() });
      if (await shipped('sitemap.xml')) return;
      if (entry.siteUrlOf('')) {
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: entry.renderStaticSitemap() });
      } else {
        this.warn('site.url / SITE_URL is not set — sitemap.xml skipped (sitemaps need absolute URLs).');
      }
    },
  };
}
