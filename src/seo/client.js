import { normalizePath, resolvePage, site, siteUrlOf } from '@/seo/engine';
import { headTagKey, renderHead } from '@/seo/head';
// Keeps <head> in step with src/seo.config.js and src/seo.routes.js in the browser: on every
// navigation the page's head comes from the same renderHead() the server uses, so every tag a
// route declares — title, description, robots, canonical, Open Graph, Twitter, hreflang, extra
// meta / links, JSON-LD — follows the page shown, with no list of tags to keep up to date here.
// On the first load it only steps in when the head was not rendered for this page: the SPA
// build (index.html defaults) or a static host serving another page's prerendered HTML.

// The site URL the server rendered with — SITE_URL is a server setting the browser cannot read —
// is read off the first server-rendered canonical; else src/seo.config.js, else this origin.
let renderedSiteUrl;
const siteUrl = () => {
  if (renderedSiteUrl === undefined) {
    const path = document.querySelector('title')?.getAttribute('data-seo-path');
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
    renderedSiteUrl = path && canonical.endsWith(path) ? canonical.slice(0, -path.length).replace(/\/+$/, '') : '';
  }
  return renderedSiteUrl || siteUrlOf(window.location.origin);
};

// index.html's own tags (no data-seo) put aside while the page shown has a tag of the same kind —
// what the server does for each page (injectPage) — and put back once a page has none.
const setAside = new Set();
const keyOf = (el) => headTagKey(el.outerHTML);

/** Puts a page's renderHead() output into document.head — all but its <title> with `keepTitle`. */
function applyHead(html, { keepTitle = false } = {}) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const isKeptTitle = (el) => keepTitle && el.localName === 'title';
  const next = [...template.content.children].filter((el) => !isKeptTitle(el));
  const nextKeys = new Set(next.map(keyOf).filter(Boolean));
  for (const el of setAside) {
    if (nextKeys.has(keyOf(el)) || isKeptTitle(el)) continue;
    document.head.appendChild(el);
    setAside.delete(el);
  }
  for (const el of document.head.querySelectorAll('title:not([data-seo]), meta:not([data-seo]), link:not([data-seo])')) {
    if (!nextKeys.has(keyOf(el))) continue;
    el.remove();
    setAside.add(el);
  }
  // The previous page's tags give way to this page's; an identical one stays where it is (an
  // unchanged icon is not fetched again). Repeated tags (several og:image…) are matched one by one.
  const unplaced = new Map();
  for (const el of next) unplaced.set(el.outerHTML, [...(unplaced.get(el.outerHTML) || []), el]);
  for (const el of [...document.head.querySelectorAll('[data-seo]')]) {
    if (isKeptTitle(el) || unplaced.get(el.outerHTML)?.pop()) continue;
    el.remove();
  }
  for (const els of unplaced.values()) for (const el of els) document.head.appendChild(el);
}

let latest = 0;
/**
 * `titleBefore`: document.title as the page started rendering (src/App.jsx). A page that has set
 * its own since — document.title in an effect, before or after this resolves — keeps it; the rest
 * of the head follows the route. The next page's title replaces it as usual.
 */
export async function syncDocumentHead(href, { initial = false, titleBefore } = {}) {
  const ticket = ++latest;
  const url = new URL(href, window.location.origin);
  const path = normalizePath(url.pathname);
  const base = siteUrl();
  if (initial && document.querySelector('title')?.getAttribute('data-seo-path') === path) return;
  const { page, site: pageSite } = await resolvePage(url.href).catch(() => ({ page: {}, site }));
  if (ticket !== latest) return;
  const keepTitle = titleBefore !== undefined && document.title !== titleBefore;
  applyHead(renderHead(page, pageSite, base, path), { keepTitle });
  // The page's language (its `lang` / `:lang`, or src/seo.config.js `languages`): index.html has the default one.
  if (pageSite.lang) document.documentElement.lang = pageSite.lang;
}
