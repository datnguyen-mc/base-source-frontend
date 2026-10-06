import { config, listPaths, resolvePage, site, siteUrlOf, staticPaths } from '@/seo/engine';
import { renderBody, renderHead, renderRobots as robots, renderSitemap as sitemap } from '@/seo/head';
// SEO entry: loaded by server.js (SSR), scripts/prerender.js (SSG) and vite-plugins/seo-plugin.js
// (index.html, SPA robots/sitemap). Content comes from src/seo.config.js and src/seo-routes/.

// The crawlable markup stays in the document but hidden, behind the same spinner App.jsx shows
// while auth loads, so people never see it flash before the SPA's own UI. Self-contained CSS;
// <noscript> shows it when JavaScript is off.
const SSR_VIEW =
  '<style>.vx-ssr{visibility:hidden;height:0;overflow:hidden}' +
  '.vx-ssr-loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}' +
  '.vx-ssr-loading>div{width:2rem;height:2rem;border:4px solid #e2e8f0;border-top-color:#1e293b;border-radius:9999px;animation:vx-ssr-spin 1s linear infinite}' +
  '@keyframes vx-ssr-spin{to{transform:rotate(360deg)}}</style>' +
  '<noscript><style>.vx-ssr{visibility:visible;height:auto;overflow:visible}.vx-ssr-loading{display:none}</style></noscript>' +
  '<div class="vx-ssr-loading" aria-hidden="true"><div></div></div>';
// `fallbackUrl` is used only when neither SITE_URL nor site.url (src/seo.config.js) is set.
export async function render(url, { fallbackUrl } = {}) {
  const siteUrl = siteUrlOf(fallbackUrl);
  const { status, path, page } = await resolvePage(url, siteUrl || 'http://localhost');
  const body = renderBody(page);
  return {
    status,
    head: renderHead(page, site, siteUrl, path),
    html: body ? `${SSR_VIEW}<div class="vx-ssr">${body}</div>` : '',
  };
}
export { listPaths, siteUrlOf };
// `paths` defaults to every indexable URL; build:ssg passes the pages it actually wrote.
export const renderSitemap = async ({ fallbackUrl, paths } = {}) =>
  sitemap(config, paths || (await listPaths()), siteUrlOf(fallbackUrl));
export const renderRobots = ({ fallbackUrl } = {}) => robots(config, siteUrlOf(fallbackUrl));
// index.html in the SPA build: served for every route, so site-wide tags only (no canonical).
export const renderIndexHead = () => renderHead({}, site, siteUrlOf(''), undefined);
export const siteLang = () => site.lang || 'en';
export const renderStaticSitemap = ({ fallbackUrl } = {}) => sitemap(config, staticPaths(), siteUrlOf(fallbackUrl));
