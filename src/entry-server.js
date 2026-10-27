// First: the SDK keeps a reference to fetch when it is created (src/seo/fetch-hook.js).
import '@/seo/fetch-hook';
import { AsyncLocalStorage } from 'node:async_hooks';
// Before any of the app's modules, which may call DOMPurify as they load (src/seo/server-dom.js).
import '@/seo/server-dom';
import {
  config,
  isNoindexPath,
  listPaths,
  normalizePath,
  notFoundPage,
  resolvePage,
  seoPattern,
  site,
  siteUrlOf,
  sitemapAlternates,
  sitemapConfig,
  staticPaths,
} from '@/seo/engine';
import { injectPage, renderBody, renderHead, renderRobots as robotsTxt, renderSitemap as sitemapXml, withLang } from '@/seo/head';
import {
  asLanguage,
  defaultLanguage,
  languageRedirect,
  routeLanguageOf,
  routeLanguages,
  routeLanguageTarget,
  SERVER_LANGUAGE,
  siteIn,
  splitLanguage,
} from '@/seo/i18n';
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
// The language of each page being rendered, for pageLanguage() (src/seo/i18n.js): the SDK asks
// the API in it — the data of /kr comes in Korean, whatever else renders at the same time.
globalThis[SERVER_LANGUAGE] ??= new AsyncLocalStorage();
const crawlerView = (page, pageSite) => {
  const body = renderBody(page, pageSite);
  return body ? `${SSR_VIEW}<div class="vx-ssr">${body}</div>` : '';
};
/**
 * → { status, head, html, lang, mode, timings } — or { status, redirect, mode: 'redirect' }.
 * lang: the page's language, for <html lang> (injectPage).
 * mode: 'rendered' (the React app), 'client' (noindex page, rendered in the browser) or
 * 'fallback' (the app failed on the server). timings in ms: { meta, data, effects, render }.
 * A rendered page also has `script`, the data hydration starts from (already in `head`).
 * `fallbackUrl` is used only when neither SITE_URL nor site.url (src/seo.config.js) is set.
 * `onHead({ status, head })` is called as soon as the page's meta is known, while the app is
 * still rendering (its data loading) — server.js may send the start of the page then.
 */
export const render = (url, options) =>
  asLanguage(splitLanguage(new URL(url, 'http://localhost').pathname).lang, () => renderPage(url, options));
async function renderPage(url, { fallbackUrl, onHead } = {}) {
  const siteUrl = siteUrlOf(fallbackUrl);
  const base = siteUrl || 'http://localhost';
  // A page asked for without its language (src/seo.config.js `languages`): /shop → /en/shop.
  const { pathname, search } = new URL(url, base);
  const moved = languageRedirect(pathname, search);
  if (moved) return { status: 302, redirect: moved, mode: 'redirect' };
  // An app whose routes carry the language (`site.langs`): a URL without one moves to the default
  // language's for good — 301, so an old URL keeps its ranking — or, with a first segment that is
  // no language of the site (/xx/products), is no page. Decided on the app's own routes.
  if (routeLanguages.length && !routeLanguageOf(pathname)) {
    const patternOf = await import('@/seo/render-app').then(({ pagePattern }) => pagePattern, () => seoPattern);
    const target = routeLanguageTarget(normalizePath(pathname), patternOf);
    if (target) return { status: 301, redirect: target + search, mode: 'redirect' };
    if (target === null) {
      const head = renderHead(notFoundPage, site, siteUrl, normalizePath(pathname));
      return { status: 404, head, html: '', lang: site.lang, mode: 'client', timings: {} };
    }
  }
  const started = performance.now();
  const timings = {};
  const noindexPath = isNoindexPath(url, base);
  const meta = resolvePage(url, base).then((result) => {
    timings.meta = Math.round(performance.now() - started);
    if (onHead && !noindexPath && !result.page.noindex) {
      onHead({ status: result.status, head: renderHead(result.page, result.site, siteUrl, result.path), lang: result.site.lang });
    }
    return result;
  });
  const clientRendered = async () => {
    const { status, path, page, site: pageSite } = await meta;
    return { status, head: renderHead(page, pageSite, siteUrl, path), html: '', lang: pageSite.lang, mode: 'client', timings };
  };
  // Pages for signed-in people (noindex) stay client-rendered, exactly like the SPA.
  if (noindexPath) return clientRendered();
  // The page's meta and the app render load their data at the same time, not one after the other.
  const app = import('@/seo/render-app').then(
    // Imported on demand: the Vite plugin loads this module for meta only, never the whole app.
    ({ renderApp }) => renderApp(new URL(url, base).href).then((result) => ({ result }), (renderError) => ({ renderError })),
    (importError) => ({ importError }),
  );
  const [{ status, path, page, site: pageSite }, { result, renderError, importError }] = await Promise.all([meta, app]);
  const head = renderHead(page, pageSite, siteUrl, path);
  const lang = pageSite.lang;
  // A page the meta marks noindex only once its data is known (e.g. a private post).
  if (page.noindex && status === 200) return clientRendered();
  if (importError) {
    // A module touching window/document at import time: every page is sent client-rendered
    // (the app itself still works in the browser) until that module is fixed.
    reportOnce('[ssr] the app cannot be loaded on the server, so pages are client-rendered', importError);
    return { status, head, html: crawlerView(page, pageSite), lang, mode: 'fallback', timings };
  }
  if (renderError) {
    if (renderError?.name === 'SeoDataUnavailableError') throw renderError;
    reportOnce(`[ssr] ${path} cannot be rendered on the server, so it is client-rendered`, renderError);
    return { status, head, html: crawlerView(page, pageSite), lang, mode: 'fallback', timings };
  }
  if (result.redirect) return { status: result.status, redirect: result.redirect, mode: 'redirect' };
  return {
    status: result.status === 200 ? status : result.status,
    head: `${head}\n    ${result.script}`,
    html: result.html,
    script: result.script,
    lang,
    mode: 'rendered',
    timings: { ...timings, ...result.timings },
  };
}

export { injectPage, listPaths, siteUrlOf, withLang };
export const renderRobots = ({ fallbackUrl } = {}) => robotsTxt(config, siteUrlOf(fallbackUrl));
// `paths` defaults to every indexable URL; build:ssg passes the pages it actually wrote. On a
// multi-language site each URL lists its other languages (hreflang).
export const renderSitemap = async ({ fallbackUrl, paths } = {}) => {
  const list = paths || (await listPaths());
  return sitemapXml(sitemapConfig, list, siteUrlOf(fallbackUrl), sitemapAlternates(list));
};
// Static routes only: the SPA build and `vite` dev have no data to list the dynamic ones.
export const renderStaticSitemap = ({ fallbackUrl } = {}) => {
  const list = staticPaths();
  return sitemapXml(sitemapConfig, list, siteUrlOf(fallbackUrl), sitemapAlternates(list));
};
// index.html in the SPA build: served for every route, so site-wide tags only (no canonical) —
// in the default language on a multi-language site.
export const renderIndexHead = () => renderHead({}, siteIn(site, defaultLanguage), siteUrlOf(''), undefined);
export const siteLang = () => siteIn(site, defaultLanguage).lang || 'en';
