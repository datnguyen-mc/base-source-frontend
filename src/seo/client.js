import { normalizePath, resolvePage, site } from '@/seo/engine';
import { describe, pageTitle } from '@/seo/head';
// Keeps the tab title and meta description in step with src/seo.config.js in the browser.
// On the first load it only steps in when the head was not rendered for this page: the SPA
// build (index.html defaults) or a static host serving another page's prerendered HTML.
let latest = 0;
export async function syncDocumentHead(href, { initial = false } = {}) {
  const ticket = ++latest;
  const url = new URL(href, window.location.origin);
  if (initial) {
    const renderedFor = document.querySelector('title')?.getAttribute('data-seo-path') || '';
    if (renderedFor === normalizePath(url.pathname)) return;
    // Another page's canonical / og:url would point crawlers away from this URL.
    if (renderedFor) document.head.querySelectorAll('link[rel="canonical"], meta[property="og:url"]').forEach((el) => el.remove());
  }
  const { page } = await resolvePage(url.href).catch(() => ({ page: {} }));
  if (ticket !== latest) return;
  document.title = pageTitle(page.title, site);
  const description = describe(page.description || page.content, site.description);
  const meta = document.head.querySelector('meta[name="description"]');
  if (meta && description) meta.setAttribute('content', description);
}
