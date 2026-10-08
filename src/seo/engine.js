import { matchRoutes } from 'react-router-dom';
import config from '@/seo.config';
import routeFile from '@/seo.routes';
import { entities, SeoDataUnavailableError } from '@/seo/entities';
import { resolveSiteUrl } from '@/seo/head';
// Resolves a URL against the routes in src/seo.routes.js. Shared by the SSR server, build:ssg,
// the Vite plugin and the client. Order does not matter: the most specific path wins.
export const site = config.site || {};
const routeMap = new Map();
for (const route of [].concat(routeFile || []).flat()) {
  if (!route || typeof route.path !== 'string') {
    console.warn('[seo] src/seo.routes.js: every route needs a `path` — skipped', route);
    continue;
  }
  if (routeMap.has(route.path)) console.warn(`[seo] src/seo.routes.js: '${route.path}' is declared twice — the last one wins`);
  routeMap.set(route.path, route);
}
export const routes = [...routeMap.values()];
const routeList = routes.map(({ path }) => ({ path }));
export const normalizePath = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);
const NOT_FOUND = { title: 'Page not found', noindex: true };
const NOT_META = ['path', 'paths', 'load'];
const runRoute = async (route, ctx) => {
  const meta = Object.fromEntries(Object.entries(route).filter(([key]) => !NOT_META.includes(key)));
  if (!route.load) return meta;
  const loaded = await route.load(ctx);
  return loaded ? { ...meta, ...loaded } : null;
};
/** → { status, path, page } where page is the route's meta (see src/seo.routes.js). */
export async function resolvePage(href, base = 'http://localhost') {
  const url = new URL(href, base);
  const path = normalizePath(url.pathname);
  const match = matchRoutes(routeList, path)?.[0];
  if (!match) return config.strict ? { status: 404, path, page: NOT_FOUND } : { status: 200, path, page: {} };
  const page = await runRoute(routeMap.get(match.route.path), { params: match.params, url, entities, site });
  return page ? { status: 200, path, page } : { status: 404, path, page: NOT_FOUND };
}
/** True when the URL matches a route declared `noindex: true` — decided without loading data. */
export const isNoindexPath = (href, base = 'http://localhost') => {
  const match = matchRoutes(routeList, normalizePath(new URL(href, base).pathname))?.[0];
  return Boolean(match && routeMap.get(match.route.path)?.noindex);
};
/** Indexable routes without parameters — what a build without data can list. */
export const staticPaths = () =>
  routes.filter((route) => !route.noindex && !/[:*]/.test(route.path)).map((route) => normalizePath(route.path));
/** Every indexable URL: static routes plus each dynamic route's `paths()`. */
export async function listPaths() {
  const dynamic = await Promise.all(
    routes.map(async (route) => {
      if (route.noindex || typeof route.paths !== 'function') return [];
      try {
        const list = await route.paths({ entities, site });
        return Array.isArray(list) ? list : [];
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
export const siteUrlOf = (fallback) => resolveSiteUrl(site, fallback);
export { config };
