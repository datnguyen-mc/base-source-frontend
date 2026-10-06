import { matchRoutes } from 'react-router-dom';
import config from '@/seo.config';
import { entities, SeoDataUnavailableError } from '@/seo/entities';
import { resolveSiteUrl } from '@/seo/head';
// Resolves a URL against the route files in src/seo-routes/ (one route — or an array of routes —
// per file, picked up automatically; files starting with "_" are helpers). Shared by the SSR
// server, build:ssg, the Vite plugin and the client. The most specific path wins.
export const site = config.site || {};
const files = import.meta.glob(['/src/seo-routes/**/*.{js,jsx}', '!**/_*'], { eager: true });
const routeMap = new Map();
for (const [file, mod] of Object.entries(files)) {
  for (const route of [].concat(mod.default || [])) {
    if (!route || typeof route.path !== 'string') {
      console.warn(`[seo] ${file}: default export needs a \`path\` — skipped`);
      continue;
    }
    if (routeMap.has(route.path)) console.warn(`[seo] ${file}: '${route.path}' is declared twice — this one wins`);
    routeMap.set(route.path, route);
  }
}
export const routes = [...routeMap.values()];
const routeList = routes.map(({ path }) => ({ path }));
export const normalizePath = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);
const NOT_FOUND = { title: 'Page not found', noindex: true };
const runRoute = async (route, ctx) => {
  const { path, load, paths, ...meta } = route;
  if (!load) return meta;
  const loaded = await load(ctx);
  return loaded ? { ...meta, ...loaded } : null;
};
/** → { status, path, page } where page is the route's meta (see src/seo-routes/README.md). */
export async function resolvePage(href, base = 'http://localhost') {
  const url = new URL(href, base);
  const path = normalizePath(url.pathname);
  const match = matchRoutes(routeList, path)?.[0];
  if (!match) return config.strict ? { status: 404, path, page: NOT_FOUND } : { status: 200, path, page: {} };
  const page = await runRoute(routeMap.get(match.route.path), { params: match.params, url, entities, site });
  return page ? { status: 200, path, page } : { status: 404, path, page: NOT_FOUND };
}
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
