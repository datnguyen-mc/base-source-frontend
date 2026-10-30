import { matchRoutes } from 'react-router-dom';
import config from '@/seo.config';
import routeFile from '@/seo.routes';
import { entities, SeoDataUnavailableError } from '@/seo/entities';
import { resolveSiteUrl } from '@/seo/head';
import {
  alternatesFor,
  asLanguage,
  defaultLanguage,
  fieldsIn,
  languages,
  localize,
  ownLanguage,
  routeDefault,
  routeLanguageOf,
  siteIn,
  splitLanguage,
} from '@/seo/i18n';
import indexHtmlSite from '@/seo/index-html';
// Resolves a URL against the routes in src/seo.routes.js. Shared by the SSR server, build:ssg,
// the Vite plugin and the client. Order does not matter: the most specific path wins. On a
// multi-language site (src/seo/i18n.js) the URL's language prefix is set aside first: /kr/shop is
// the route '/shop', in Korean.
export { config };
// In CSR, what index.html says (src/seo/index-html.js) wins over src/seo.config.js — but
// for a value the config gives per language ({ en: '…', kr: '…' }), which index.html cannot.
const fromIndexHtml = Object.entries(indexHtmlSite || {}).filter(([key]) => {
  const own = config.site?.[key];
  return !own;
});
export const site = { ...(config.site || {}), ...Object.fromEntries(fromIndexHtml) };
export const siteUrlOf = (fallback) => resolveSiteUrl(site, fallback);
const DEFAULT_BASE = 'http://localhost';
const NOT_FOUND = { title: 'Page not found', noindex: true };
const NOT_META = ['path', 'paths', 'load'];

const routeMap = new Map();
for (const route of [].concat(routeFile || []).flat()) {
  if (!route || typeof route.path !== 'string') {
    console.warn('[seo] src/seo.routes.js: every route needs a `path` — skipped', route);
    continue;
  }
  if (routeMap.has(route.path)) console.warn(`[seo] src/seo.routes.js: '${route.path}' is declared twice — the last one wins`);
  routeMap.set(route.path, route);
}
const routes = [...routeMap.values()];
const routeList = routes.map(({ path }) => ({ path }));

export const normalizePath = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);
/** → { route, params } of the route a (normalized) path matches, or undefined. */
const matchRoute = (path) => {
  const match = matchRoutes(routeList, path)?.[0];
  return match && { route: routeMap.get(match.route.path), params: match.params };
};
const runRoute = async (route, ctx) => {
  const meta = Object.fromEntries(Object.entries(route).filter(([key]) => !NOT_META.includes(key)));
  if (!route.load) return meta;
  const loaded = await route.load(ctx);
  return loaded ? { ...meta, ...loaded } : null;
};
// A page in its language: values given per language picked, and the paths of this site's pages it
// names (written without a language) put in the URL's. hreflang alternates come with it.
const pageIn = (page, lang, urlLang, path) => {
  if (!defaultLanguage && !routeDefault) return page;
  const out = fieldsIn(page, lang, ['alternates']);
  if (!urlLang) return out;
  const at = (href) => localize(href, urlLang);
  const linked = (list) => (Array.isArray(list) ? list.map((entry) => (entry?.url ? { ...entry, url: at(entry.url) } : entry)) : list);
  return {
    ...out,
    ...(out.canonical && { canonical: at(out.canonical) }),
    alternates: out.alternates ?? (out.noindex ? undefined : alternatesFor(out.canonical || path)),
    breadcrumbs: linked(out.breadcrumbs),
    items: linked(out.items),
  };
};
// A list of page paths in every language: '/shop' → '/en/shop', '/kr/shop'.
const inEveryLanguage = (paths) => (defaultLanguage ? paths.flatMap((path) => languages.map(({ code }) => localize(path, code))) : paths);

/**
 * → { status, path, page, site }: page is the route's meta (see src/seo.routes.js), site the
 * `site` of src/seo.config.js — both in the page's language on a multi-language site.
 */
export async function resolvePage(href, base = DEFAULT_BASE) {
  const url = new URL(href, base);
  const path = normalizePath(url.pathname);
  // A path without a language (the admin) reads in the default one.
  const { lang: urlLang, path: routePath } = splitLanguage(path);
  // The URL's language — its prefix, or the route language it starts with — else the default.
  const lang = urlLang || defaultLanguage || routeLanguageOf(path) || routeDefault;
  const pageSite = siteIn(site, lang);
  // The page's own language (its `lang`, or the URL's) wins: <html lang>, og:locale.
  const siteFor = (page, params) => {
    const own = ownLanguage(page, params, path);
    return own ? { ...pageSite, lang: own } : pageSite;
  };
  const match = matchRoute(routePath);
  if (!match) {
    const noRoute = siteFor(null, {});
    return config.strict ? { status: 404, path, page: NOT_FOUND, site: noRoute } : { status: 200, path, page: {}, site: noRoute };
  }
  const page = await runRoute(match.route, { params: match.params, url, entities, site: pageSite, lang });
  const ownSite = siteFor(page, match.params);
  return page
    ? { status: 200, path, page: pageIn(page, lang, urlLang, routePath), site: ownSite }
    : { status: 404, path, page: NOT_FOUND, site: ownSite };
}
/**
 * { pattern, params } of the route of src/seo.routes.js a path matches, or null — what decides
 * where a URL goes (src/seo/i18n.js routeLanguageTarget) when the app itself cannot be loaded.
 */
export const seoPattern = (pathname) => {
  const match = matchRoute(normalizePath(pathname));
  return match ? { pattern: match.route.path, params: match.params } : null;
};
/** The meta of a page that does not exist. */
export const notFoundPage = NOT_FOUND;
/** True when the URL matches a route declared `noindex: true` — decided without loading data. */
export const isNoindexPath = (href, base = DEFAULT_BASE) =>
  Boolean(matchRoute(splitLanguage(normalizePath(new URL(href, base).pathname)).path)?.route.noindex);

/** Indexable routes without parameters — what a build without data can list — in every language. */
export const staticPaths = () =>
  inEveryLanguage(routes.filter((route) => !route.noindex && !/[:*]/.test(route.path)).map((route) => normalizePath(route.path)));
/** Every indexable URL: static routes plus each dynamic route's `paths()`, in every language. */
export async function listPaths() {
  const dynamic = await Promise.all(
    routes.map(async (route) => {
      if (route.noindex || typeof route.paths !== 'function') return [];
      try {
        // Once per language, with `lang`: the paths it gives (without a language) are put in that one.
        const lists = await Promise.all(
          (defaultLanguage ? languages : [{}]).map(async ({ code }) => {
            const list = await asLanguage(code, () => route.paths({ entities, site: siteIn(site, code), lang: code }));
            return Array.isArray(list) ? list.map((path) => localize(path, code)) : [];
          }),
        );
        return lists.flat();
      } catch (err) {
        // No data → no honest URL list: let the caller (sitemap / build:ssg) fail loudly.
        if (err instanceof SeoDataUnavailableError) throw err;
        console.error(`[seo] paths() of '${route.path}' failed:`, err);
        return [];
      }
    }),
  );
  const all = [...staticPaths(), ...dynamic.flat()].filter((p) => typeof p === 'string' && p.startsWith('/'));
  return [...new Set(all.map(normalizePath))];
}
/**
 * The sitemap's hreflang alternates: for each path, its versions in the other languages among
 * `paths` (the pages listed) — null on a single-language site.
 */
export const sitemapAlternates = (paths) => {
  if (!defaultLanguage) return null;
  const listed = new Set(paths);
  return (path) => {
    const { lang, path: page } = splitLanguage(path);
    const alternates = lang ? alternatesFor(page).filter((alt) => listed.has(alt.href)) : [];
    return alternates.filter((alt) => alt.hreflang !== 'x-default').length > 1 ? alternates : [];
  };
};
// sitemap.exclude names pages without their language: each one is left out in every language.
export const sitemapConfig =
  defaultLanguage && config.sitemap?.exclude?.length
    ? { ...config, sitemap: { ...config.sitemap, exclude: [...config.sitemap.exclude, ...inEveryLanguage(config.sitemap.exclude)] } }
    : config;
