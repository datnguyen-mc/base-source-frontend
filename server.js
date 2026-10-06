import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

// SSR server. `npm run dev:ssr` runs it on top of Vite (HMR included);
// `npm run build:ssr && npm run start:ssr` runs the production build.
const isProduction = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
if (isProduction) process.env.NODE_ENV = 'production';
const port = Number(process.env.PORT) || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));
// index.html marks the default SEO tags and the root outlet; both are replaced per request.
const SEO_HEAD = /<!--seo-head-->[\s\S]*?<!--\/seo-head-->/;
const SSR_OUTLET = '<!--ssr-outlet-->';

const app = express();
app.disable('x-powered-by');
// Behind a proxy / load balancer, req.protocol and req.host come from X-Forwarded-*.
app.set('trust proxy', true);
const server = http.createServer(app);
// Canonical / sitemap origin: SITE_URL env, then site.url in src/seo.config.js, then the request.
const originOf = (req) => `${req.protocol}://${req.host}`;

let vite;
let prodTemplate;
let prodEntry;
const loadEntry = async () => (isProduction ? prodEntry : vite.ssrLoadModule('/src/entry-server.js'));
const loadTemplate = async (url) => {
  if (isProduction) return prodTemplate;
  return vite.transformIndexHtml(url, await fs.readFile(path.join(root, 'index.html'), 'utf-8'));
};

// Registered before the static/Vite middleware, which would otherwise serve a static copy.
app.get('/robots.txt', async (req, res) => {
  const { renderRobots } = await loadEntry();
  res.type('text/plain').send(renderRobots({ fallbackUrl: originOf(req) }));
});

const sitemapCache = new Map();
app.get('/sitemap.xml', async (req, res) => {
  try {
    const origin = originOf(req);
    let hit = sitemapCache.get(origin);
    if (!hit || hit.expires < Date.now()) {
      const { renderSitemap } = await loadEntry();
      hit = { xml: await renderSitemap({ fallbackUrl: origin }), expires: Date.now() + 10 * 60 * 1000 };
      if (sitemapCache.size > 20) sitemapCache.clear();
      sitemapCache.set(origin, hit);
    }
    res.type('application/xml').set('Cache-Control', 'public, max-age=600').send(hit.xml);
  } catch (err) {
    if (err?.name !== 'SeoDataUnavailableError') console.error('[ssr] sitemap failed', err);
    res.status(503).set('Retry-After', '120').end();
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
  app.use(
    sirv(path.join(root, 'dist/client'), {
      extensions: [],
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

app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const url = req.originalUrl;
  let template = '';
  try {
    template = await loadTemplate(url);
    const { render } = await loadEntry();
    const page = await render(url, { fallbackUrl: originOf(req) });
    // Function replacements: page content may contain `$&`, `$'`… which a string would expand.
    const html = template.replace(SEO_HEAD, () => page.head).replace(SSR_OUTLET, () => page.html);
    res
      .status(page.status)
      .set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate' })
      .send(html);
  } catch (err) {
    vite?.ssrFixStacktrace(err);
    if (!template) return next(err);
    // The SPA still works without SSR — people get the app either way. When the backend is
    // down, 503 tells crawlers to come back later instead of indexing an empty page.
    const unavailable = err?.name === 'SeoDataUnavailableError';
    if (!unavailable) console.error('[ssr] render failed, serving the SPA shell', err);
    res
      .status(unavailable ? 503 : 200)
      .set({ 'Content-Type': 'text/html; charset=utf-8', ...(unavailable ? { 'Retry-After': '120' } : {}) })
      .send(template);
  }
});

server.listen(port, () => {
  console.log(`[ssr] ${isProduction ? 'production' : 'dev'} server on http://localhost:${port}`);
});
