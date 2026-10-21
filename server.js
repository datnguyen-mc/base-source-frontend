import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

// SSR server. `npm run dev:ssr` runs it on top of Vite (HMR included);
// `npm run build:ssr && npm run start:ssr` runs the production build.
const isProduction = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
if (isProduction) process.env.NODE_ENV = 'production';
const root = path.dirname(fileURLToPath(import.meta.url));
// 5173 is what `vite` serves the SPA on, so dev:ssr, the preview pod and
// anything else pointing at this app all keep using the one port.
const port = Number(process.env.PORT) || 5173;
const SITEMAP_TTL_S = 600;
// Sent with every 503: crawlers come back after this many seconds.
const RETRY_AFTER_S = '120';

// A promise some page code forgot to handle while rendering must not take the server down for
// every visitor (Node exits on an unhandled rejection by default).
// One from an effect the server render ran (src/seo/server-effects.js) is expected — an effect
// reaching for `window` after an `await` — and the browser runs that effect again: not logged.
const inServerEffect = () => Boolean(globalThis[Symbol.for('vibex.ssr.effects')]?.current());
process.on('unhandledRejection', (reason) => {
  if (!inServerEffect()) console.error('[ssr] unhandled promise rejection:', reason);
});
// The same for an exception escaping an effect's callback; any other one still ends the process,
// as it would without this handler.
process.on('uncaughtException', (err) => {
  if (inServerEffect()) return;
  console.error(err);
  process.exit(1);
});
// The backend could not answer (src/seo/entities.js): a 503, not a bug worth a stack trace.
const isDataUnavailable = (err) => err?.name === 'SeoDataUnavailableError';

const app = express();
app.disable('x-powered-by');
// Behind a proxy / load balancer, req.protocol and req.host come from X-Forwarded-*.
app.set('trust proxy', true);
const server = http.createServer(app);
// Canonical / sitemap origin: SITE_URL env, then site.url in src/seo.config.js, then the request.
const originOf = (req) => `${req.protocol}://${req.host}`;
// One line per page request: what was asked, how the page was produced and where the time went,
// e.g. `[ssr] GET /feed → 200 rendered 142ms (meta 21ms · data 96ms · render 18ms)`.
// SSR_LOG=off silences it (errors are always logged).
const logPages = process.env.SSR_LOG !== 'off';
const logPage = (req, status, mode, started, timings) => {
  if (!logPages) return;
  const steps = timings ? Object.entries(timings).map(([step, ms]) => `${step} ${ms}ms`).join(' · ') : '';
  const total = Math.round(performance.now() - started);
  console.log(`[ssr] ${req.method} ${req.originalUrl} → ${status} ${mode} ${total}ms${steps ? ` (${steps})` : ''}`);
};

let vite;
let prodTemplate;
let prodEntry;
const loadEntry = async () => (isProduction ? prodEntry : vite.ssrLoadModule('/src/entry-server.js'));
const loadTemplate = async (url) => {
  if (isProduction) return prodTemplate;
  return vite.transformIndexHtml(url, await fs.readFile(path.join(root, 'index.html'), 'utf-8'));
};
// dev:ssr — Vite adds CSS from JavaScript, so server-rendered markup would paint unstyled until
// main.jsx runs. Link every stylesheet the app imports instead, with the id Vite's client knows it
// by (data-vite-dev-id): the client then keeps that link — and hot-updates it — rather than adding
// the same CSS again as a <style> (applied twice, its fonts loading anew: the text flashes).
// They go right before the src/loaded.css link that vite-plugins/loading-plugin.js puts after #root
// — in <body>, so the loading spinner paints meanwhile — and the script between makes the parser
// wait for them: the page is let go (src/loaded.css) only once it is styled.
const LOADED_CSS_LINK = '<link rel="stylesheet" href="/src/loaded.css">';
const isStylesheet = (mod) => Boolean(mod?.url) && /\.(css|scss|sass|less|styl)$/.test(mod.file || '');
// The browser entry's own imports first (main.jsx: index.css, fonts… — the server never loads it),
// then those the server render imported.
const devStylesheets = async (template) => {
  const mods = [];
  const entry = template.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="(\/(?!@)[^"]+)"/)?.[1];
  if (entry) {
    await vite.environments.client.transformRequest(entry).catch(() => null); // fills in its imports
    const mod = await vite.environments.client.moduleGraph.getModuleByUrl(entry);
    mods.push(...[...(mod?.importedModules ?? [])].filter(isStylesheet));
  }
  mods.push(...[...vite.environments.ssr.moduleGraph.idToModuleMap.values()].filter(isStylesheet));
  const seen = new Set();
  return mods
    .filter((mod) => !seen.has(mod.url) && seen.add(mod.url))
    .map((mod) => `<link rel="stylesheet" href="${mod.url}?direct" data-vite-dev-id="${mod.id.replaceAll('"', '&quot;')}">`)
    .join('\n');
};
const withDevStylesheets = async (html, template) => {
  const links = await devStylesheets(template);
  return html.includes(LOADED_CSS_LINK)
    ? html.replace(LOADED_CSS_LINK, () => `${links}\n<script>/* after the stylesheets above */</script>\n${LOADED_CSS_LINK}`)
    : html.replace('</head>', () => `${links}\n</head>`);
};
// The SPA page with the site-wide head — what people get when a page cannot be rendered.
const spaShell = async (template) => {
  const entry = await loadEntry().catch(() => null);
  return entry ? entry.injectPage(template, { head: entry.renderIndexHead() }) : template;
};

// robots.txt / sitemap.xml the app ships in public/ (e.g. uploaded by its owner) are served as they
// are, byte for byte (a Buffer: a file that is not UTF-8 is not re-encoded); only a missing one is
// generated. null when there is none. Production reads them once at start, like the build's
// index.html — a new upload comes with a new build, and so a restart; dev:ssr on every request.
const readShipped = (name) => fs.readFile(path.join(root, 'public', name)).catch(() => null);
const shippedAtStart = isProduction
  ? { 'robots.txt': await readShipped('robots.txt'), 'sitemap.xml': await readShipped('sitemap.xml') }
  : null;
const shipped = async (name) => (shippedAtStart ? shippedAtStart[name] : readShipped(name));

// Registered before the static/Vite middleware, which would otherwise serve a static copy.
app.get('/robots.txt', async (req, res) => {
  const own = await shipped('robots.txt');
  if (own !== null) return res.type('text/plain').send(own);
  const { renderRobots } = await loadEntry();
  res.type('text/plain').send(renderRobots({ fallbackUrl: originOf(req) }));
});

const sitemapCache = new Map();
app.get('/sitemap.xml', async (req, res) => {
  const started = performance.now();
  const own = await shipped('sitemap.xml');
  if (own !== null) {
    res.type('application/xml').send(own);
    logPage(req, 200, 'sitemap (public/sitemap.xml)', started);
    return;
  }
  try {
    const origin = originOf(req);
    let hit = sitemapCache.get(origin);
    const cached = Boolean(hit && hit.expires >= Date.now());
    if (!cached) {
      const { renderSitemap } = await loadEntry();
      hit = { xml: await renderSitemap({ fallbackUrl: origin }), expires: Date.now() + SITEMAP_TTL_S * 1000 };
      if (sitemapCache.size > 20) sitemapCache.clear();
      sitemapCache.set(origin, hit);
    }
    res.type('application/xml').set('Cache-Control', `public, max-age=${SITEMAP_TTL_S}`).send(hit.xml);
    logPage(req, 200, cached ? 'sitemap (cached)' : 'sitemap (built)', started);
  } catch (err) {
    if (!isDataUnavailable(err)) console.error('[ssr] sitemap failed', err);
    res.status(503).set('Retry-After', RETRY_AFTER_S).end();
    logPage(req, 503, 'sitemap unavailable', started);
  }
});

if (isProduction) {
  const compression = (await import('compression')).default;
  const sirv = (await import('sirv')).default;
  prodTemplate = await fs.readFile(path.join(root, 'dist/client/index.html'), 'utf-8');
  prodEntry = await import('./dist/server/entry-server.js');
  if (!prodEntry.siteUrlOf('')) {
    console.warn('[ssr] site.url (src/seo.config.js) / SITE_URL is not set — canonical URLs use the request host.');
  }
  app.use(compression());
  // `extensions: []` keeps sirv from answering "/" with index.html — every page goes through SSR.
  // The build's files come compressed too (vite-plugins/precompress-plugin.js): x.js.br / x.js.gz
  // are sent as they are, and compression() leaves them be — no CPU or memory spent per request.
  app.use(
    sirv(path.join(root, 'dist/client'), {
      extensions: [],
      brotli: true,
      gzip: true,
      setHeaders: (res, pathname) => {
        res.setHeader(
          'Cache-Control',
          pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        );
      },
    }),
  );
} else {
  const { createServer } = await import('vite');
  // HMR rides on this server's own port, so several dev servers can run side by side.
  vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
  app.use(vite.middlewares);
}

// ── Page cache ───────────────────────────────────────────────────────────────────────────────
// The server always renders a page as a signed-out visitor sees it, so one URL gives everybody
// the same HTML: it is kept SSR_CACHE_TTL seconds (default 60 in production, off in dev). After
// that the old copy is still answered at once — for up to SSR_CACHE_STALE seconds (default 600) —
// while a fresh one renders in the background. Only good pages are kept, never an error or a 503.
const cacheTtl = Number(process.env.SSR_CACHE_TTL ?? (isProduction ? 60 : 0)) * 1000;
const cacheStale = Number(process.env.SSR_CACHE_STALE ?? 600) * 1000;
const CACHE_MAX = 500;
const pageCache = new Map();
const cacheable = (page) => ['rendered', 'client'].includes(page.mode) && [200, 404].includes(page.status);
const remember = (key, page) => {
  if (!cacheTtl || !cacheable(page)) return;
  pageCache.delete(key);
  if (pageCache.size >= CACHE_MAX) pageCache.delete(pageCache.keys().next().value);
  pageCache.set(key, { ...page, freshUntil: Date.now() + cacheTtl, staleUntil: Date.now() + cacheTtl + cacheStale });
};

// One page, start to finish: → { status, html, mode, timings } or { status, redirect }.
const renderPage = async (req) => {
  const url = req.originalUrl;
  const template = await loadTemplate(url);
  try {
    const entry = await loadEntry();
    const page = await entry.render(url, { fallbackUrl: originOf(req) });
    if (page.redirect) return page;
    let html = entry.injectPage(template, page);
    if (!isProduction && page.html) html = await withDevStylesheets(html, template);
    return { status: page.status, html, mode: page.mode, timings: page.timings };
  } catch (err) {
    vite?.ssrFixStacktrace(err);
    // The SPA still works without SSR — people get the app either way. When the backend is
    // down, 503 tells crawlers to come back later instead of indexing an empty page.
    const unavailable = isDataUnavailable(err);
    if (!unavailable) console.error('[ssr] render failed, serving the SPA shell', err);
    return { status: unavailable ? 503 : 200, html: await spaShell(template), mode: unavailable ? 'unavailable' : 'fallback' };
  }
};
// Requests for the same page while it renders share that one render.
const rendering = new Map();
const renderOnce = (key, req) => {
  if (!rendering.has(key)) rendering.set(key, renderPage(req).finally(() => rendering.delete(key)));
  return rendering.get(key);
};

// Browsers revalidate every time (ETag → 304); a CDN may keep the page as long as we do.
const cacheControl = (page) => {
  if (!cacheable(page)) return 'no-store';
  if (!cacheTtl) return 'public, max-age=0, must-revalidate';
  return `public, max-age=0, s-maxage=${cacheTtl / 1000}, stale-while-revalidate=${cacheStale / 1000}`;
};
const sendPage = (res, page, cacheState) =>
  res
    .status(page.status)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl(page),
      // How the page was produced: rendered | client | fallback | unavailable.
      'X-SSR': page.mode,
      ...(cacheTtl ? { 'X-SSR-Cache': cacheState } : {}),
      ...(page.mode === 'unavailable' ? { 'Retry-After': RETRY_AFTER_S } : {}),
    })
    .send(page.html);

app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const started = performance.now();
  const key = `${originOf(req)}${req.originalUrl}`;
  try {
    const hit = cacheTtl ? pageCache.get(key) : null;
    if (hit && hit.staleUntil > Date.now()) {
      const fresh = hit.freshUntil > Date.now();
      // Past its TTL: answered from the cache anyway, refreshed in the background.
      if (!fresh) renderOnce(key, req).then((page) => remember(key, page), () => {});
      sendPage(res, hit, fresh ? 'HIT' : 'STALE');
      return logPage(req, hit.status, `${hit.mode} (cache ${fresh ? 'hit' : 'stale'})`, started);
    }
    const page = await renderOnce(key, req);
    if (page.redirect) {
      logPage(req, page.status || 302, `redirect → ${page.redirect}`, started);
      return res.redirect(page.status || 302, page.redirect);
    }
    remember(key, page);
    sendPage(res, page, 'MISS');
    logPage(req, page.status, page.mode, started, page.timings);
  } catch (err) {
    next(err);
  }
});

server.listen(port, () => {
  console.log(`[ssr] ${isProduction ? 'production' : 'dev'} server on http://localhost:${port}`);
});
