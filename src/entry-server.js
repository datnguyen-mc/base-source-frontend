import { config, isNoindexPath, listPaths, resolvePage, site, siteUrlOf, staticPaths } from '@/seo/engine';
import { injectPage, renderBody, renderHead, renderRobots as robots, renderSitemap as sitemap } from '@/seo/head';
// SSR entry: loaded by server.js (SSR), scripts/prerender.js (SSG) and vite-plugins/seo-plugin.js
// (index.html, SPA robots/sitemap). Meta comes from src/seo.config.js and src/seo.routes.js; the
// page body is the real React app (src/seo/render-app.jsx), hydrated in the browser.

// Used only when the app itself cannot be rendered on the server: plain crawlable markup, hidden
// behind the spinner App.jsx shows while auth loads, so people never see it flash.
const SSR_VIEW =
  '<style>.vx-ssr{visibility:hidden;height:0;overflow:hidden}' +
  '.vx-ssr-loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}' +
  '.vx-ssr-loading>div{width:2rem;height:2rem;border:4px solid #e2e8f0;border-top-color:#1e293b;border-radius:9999px;animation:vx-ssr-spin 1s linear infinite}' +
  '@keyframes vx-ssr-spin{to{transform:rotate(360deg)}}</style>' +
  '<noscript><style>.vx-ssr{visibility:visible;height:auto;overflow:visible}.vx-ssr-loading{display:none}</style></noscript>' +
  '<div class="vx-ssr-loading" aria-hidden="true"><div></div></div>';
// The first frame in the app's own code — where to look when the server cannot render it.
const culprit = (err) => (String(err?.stack || '').match(/\/src\/[^\s):]+(?::\d+)?/) || [''])[0];
const reported = new Set();
const reportOnce = (message, err) => {
  const key = `${message} ${err?.message}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.error(`${message} — ${err?.message}${culprit(err) ? ` (at ${culprit(err)})` : ''}`);
};
const crawlerView = (page) => {
  const body = renderBody(page, site);
  return body ? `${SSR_VIEW}<div class="vx-ssr">${body}</div>` : '';
};
/**
 * → { status, head, html, mode, timings } — or { status, redirect, mode: 'redirect' }.
 * mode: 'rendered' (the React app), 'client' (noindex page, rendered in the browser) or
 * 'fallback' (the app failed on the server). timings in ms: { meta, data, render }.
 * `fallbackUrl` is used only when neither SITE_URL nor site.url (src/seo.config.js) is set.
 */
export async function render(url, { fallbackUrl } = {}) {
  const siteUrl = siteUrlOf(fallbackUrl);
  const base = siteUrl || 'http://localhost';
  const started = performance.now();
  const timings = {};
  const meta = resolvePage(url, base).then((result) => {
    timings.meta = Math.round(performance.now() - started);
    return result;
  });
  const clientRendered = async () => {
    const { status, path, page } = await meta;
    return { status, head: renderHead(page, site, siteUrl, path), html: '', mode: 'client', timings };
  };
  // Pages for signed-in people (noindex) stay client-rendered, exactly like the SPA.
  if (isNoindexPath(url, base)) return clientRendered();
  // The page's meta and the app render load their data at the same time, not one after the other.
  const app = import('@/seo/render-app').then(
    // Imported on demand: the Vite plugin loads this module for meta only, never the whole app.
    ({ renderApp }) => renderApp(new URL(url, base).href).then((result) => ({ result }), (renderError) => ({ renderError })),
    (importError) => ({ importError }),
  );
  const [{ status, path, page }, { result, renderError, importError }] = await Promise.all([meta, app]);
  const head = renderHead(page, site, siteUrl, path);
  // A page the meta marks noindex only once its data is known (e.g. a private post).
  if (page.noindex && status === 200) return clientRendered();
  if (importError) {
    // A module touching window/document at import time: every page is sent client-rendered
    // (the app itself still works in the browser) until that module is fixed.
    reportOnce('[ssr] the app cannot be loaded on the server, so pages are client-rendered', importError);
    return { status, head, html: crawlerView(page), mode: 'fallback', timings };
  }
  if (renderError) {
    if (renderError?.name === 'SeoDataUnavailableError') throw renderError;
    reportOnce(`[ssr] ${path} cannot be rendered on the server, so it is client-rendered`, renderError);
    return { status, head, html: crawlerView(page), mode: 'fallback', timings };
  }
  if (result.redirect) return { status: result.status, redirect: result.redirect, mode: 'redirect' };
  return {
    status: result.status === 200 ? status : result.status,
    head: `${head}\n    ${result.script}`,
    html: result.html,
    mode: 'rendered',
    timings: { ...timings, ...result.timings },
  };
}
export { injectPage, listPaths, siteUrlOf };
// `paths` defaults to every indexable URL; build:ssg passes the pages it actually wrote.
export const renderSitemap = async ({ fallbackUrl, paths } = {}) =>
  sitemap(config, paths || (await listPaths()), siteUrlOf(fallbackUrl));
export const renderRobots = ({ fallbackUrl } = {}) => robots(config, siteUrlOf(fallbackUrl));
// index.html in the SPA build: served for every route, so site-wide tags only (no canonical).
export const renderIndexHead = () => renderHead({}, site, siteUrlOf(''), undefined);
export const siteLang = () => site.lang || 'en';
export const renderStaticSitemap = ({ fallbackUrl } = {}) => sitemap(config, staticPaths(), siteUrlOf(fallbackUrl));
