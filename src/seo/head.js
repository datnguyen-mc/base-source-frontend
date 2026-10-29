// Pure renderers for <head>, crawlable body, robots.txt and sitemap.xml, shared by the
// SSR server, build:ssg, the Vite plugin and the client. Driven by src/seo.config.js and the
// routes in src/seo.routes.js — edit those, not this file.
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const plainText = (value) =>
  String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
export const describe = (value, fallback = '') => {
  const text = plainText(value).replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
};
// The page's title as it is — the site name is not added to it; a page without one shows the site name.
export const pageTitle = (title, site) => (title ? String(title) : site.name || '');
export const resolveSiteUrl = (site, fallback = '') =>
  String((typeof process !== 'undefined' && process.env?.SITE_URL) || site.url || fallback).replace(/\/+$/, '');
const absolute = (value, siteUrl) =>
  value && siteUrl && value.startsWith('/') && !value.startsWith('//') ? `${siteUrl}${value}` : value;
const isoDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
};
// og:locale wants language_TERRITORY ('vi_VN'). A bare language gets one only where there is a
// single obvious one ('ko' → 'ko_KR'); others ('en') are left out.
const TERRITORY = { ko: 'KR', ja: 'JP', vi: 'VN', th: 'TH', id: 'ID' };
const ogLocale = (lang) => {
  if (/^[a-z]{2,3}[-_][a-z]{2}$/i.test(lang || '')) return lang.replace('-', '_');
  return TERRITORY[lang] ? `${lang}_${TERRITORY[lang]}` : '';
};
const tag = (name, attrs) =>
  `<${name} ${Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(' ')}>`;
// Every tag renderHead() writes carries data-seo: on navigation the browser swaps exactly these
// for the next page's (src/seo/client.js) — whatever a page declares — and leaves the rest alone.
const seoTag = (name, attrs) => tag(name, { ...attrs, 'data-seo': '' });
// `<` escaped, so no text in the data can close the <script>.
const jsonLdTag = (data) =>
  `<script type="application/ld+json" data-seo="">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
const list = (value) => [].concat(value || []).filter(Boolean);
const SCHEMA = 'https://schema.org';
/** schema.org data of a page: WebSite on the home page, BreadcrumbList from `breadcrumbs`, `jsonLd`. */
const structuredData = (page, site, siteUrl, path) => {
  if (page.noindex) return [];
  const crumbs = list(page.breadcrumbs).filter((crumb) => crumb.name && crumb.url);
  // site.home: the home page of the page's language on a multi-language site ('/kr').
  const home = site.home || '/';
  return [
    // The site name (and search box, with site.searchUrl) Google shows for the site.
    path === home && siteUrl && site.name && {
      '@context': SCHEMA,
      '@type': 'WebSite',
      name: site.name,
      url: home === '/' ? `${siteUrl}/` : `${siteUrl}${home}`,
      ...(site.searchUrl && {
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: absolute(site.searchUrl, siteUrl) },
          'query-input': 'required name=search_term_string',
        },
      }),
    },
    crumbs.length > 0 && {
      '@context': SCHEMA,
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, name: crumb.name, item: absolute(crumb.url, siteUrl) })),
    },
    ...list(page.jsonLd).map((data) => ({ '@context': SCHEMA, ...data })),
  ].filter(Boolean);
};
// { vi: '/vi/about', en: '/about' } or [{ hreflang, href }]
const alternatesOf = (value) =>
  Array.isArray(value) ? value : Object.entries(value || {}).map(([hreflang, href]) => ({ hreflang, href }));
const OG_TYPES = { article: 'article', product: 'product', profile: 'profile' };
/**
 * The page's <head> tags (see injectPage). `path` is the page the head was rendered for
 * (SSR / SSG); without it (the SPA's site defaults) the client fills the head.
 */
export function renderHead(page, site, siteUrl, path) {
  const title = pageTitle(page.title, site);
  const description = describe(page.description || page.content, site.description);
  const image = absolute(page.image || site.image, siteUrl);
  const keywords = page.keywords || site.keywords;
  // `page.canonical` lets several URLs of one page (e.g. /p/54 and /p/my-title-54) share one.
  const canonical = siteUrl && path && !page.noindex ? `${siteUrl}${page.canonical || path}` : '';
  const ogType = OG_TYPES[page.type] || 'website';
  const locale = ogLocale(site.lang);
  // The page's other languages, from its hreflang alternates.
  const otherLocales = page.noindex
    ? []
    : [...new Set(alternatesOf(page.alternates).map((alt) => ogLocale(alt.hreflang)))].filter((other) => other && other !== locale);
  const article = ogType === 'article';
  const published = article && isoDate(page.publishedAt);
  const modified = article && isoDate(page.updatedAt);
  const imageAlt = image && page.imageAlt;
  const lines = [
    title && `<title data-seo="" data-seo-path="${escapeHtml(path || '')}">${escapeHtml(title)}</title>`,
    description && seoTag('meta', { name: 'description', content: description }),
    keywords && seoTag('meta', { name: 'keywords', content: keywords }),
    page.author && seoTag('meta', { name: 'author', content: page.author }),
    seoTag('meta', { name: 'robots', content: page.noindex ? 'noindex' : 'index, follow, max-image-preview:large' }),
    canonical && seoTag('link', { rel: 'canonical', href: canonical }),
    ...(page.noindex ? [] : alternatesOf(page.alternates))
      .filter((alt) => alt.hreflang && alt.href)
      .map((alt) => seoTag('link', { rel: 'alternate', hreflang: alt.hreflang, href: absolute(alt.href, siteUrl) })),
    site.favicon && seoTag('link', { rel: 'icon', href: site.favicon }),
    site.appleTouchIcon && seoTag('link', { rel: 'apple-touch-icon', href: site.appleTouchIcon }),
    site.themeColor && seoTag('meta', { name: 'theme-color', content: site.themeColor }),
    site.name && seoTag('meta', { property: 'og:site_name', content: site.name }),
    seoTag('meta', { property: 'og:type', content: ogType }),
    title && seoTag('meta', { property: 'og:title', content: title }),
    description && seoTag('meta', { property: 'og:description', content: description }),
    image && seoTag('meta', { property: 'og:image', content: image }),
    imageAlt && seoTag('meta', { property: 'og:image:alt', content: imageAlt }),
    canonical && seoTag('meta', { property: 'og:url', content: canonical }),
    locale && seoTag('meta', { property: 'og:locale', content: locale }),
    ...otherLocales.map((other) => seoTag('meta', { property: 'og:locale:alternate', content: other })),
    published && seoTag('meta', { property: 'article:published_time', content: published }),
    modified && seoTag('meta', { property: 'article:modified_time', content: modified }),
    article && page.author && seoTag('meta', { property: 'article:author', content: page.author }),
    article && page.section && seoTag('meta', { property: 'article:section', content: page.section }),
    seoTag('meta', { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' }),
    site.twitterSite && seoTag('meta', { name: 'twitter:site', content: site.twitterSite }),
    title && seoTag('meta', { name: 'twitter:title', content: title }),
    description && seoTag('meta', { name: 'twitter:description', content: description }),
    image && seoTag('meta', { name: 'twitter:image', content: image }),
    imageAlt && seoTag('meta', { name: 'twitter:image:alt', content: imageAlt }),
    // Anything else a page declares: product:price:amount, prev/next links…
    ...list(page.meta).map((attrs) => seoTag('meta', attrs)),
    ...list(page.links).map((attrs) => seoTag('link', attrs.href ? { ...attrs, href: absolute(attrs.href, siteUrl) } : attrs)),
    ...structuredData(page, site, siteUrl, path).map(jsonLdTag),
  ];
  return lines.filter(Boolean).join('\n    ');
}
// ── Putting a page into index.html ────────────────────────────────────────────────────────
// index.html stays a plain HTML file: its own SEO tags are found and replaced, the new ones are
// appended before </head>. Scripts, styles, comments and other tags in <head> are left alone.
const HEAD_TOKEN = /<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->|<title\b[^>]*>[\s\S]*?<\/title>|<(?:meta|link)\b[^>]*>/gi;
const attrOf = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1]?.toLowerCase();
const keyOf = (tag) => {
  if (/^<title/i.test(tag)) return 'title';
  if (/^<meta/i.test(tag)) {
    const name = attrOf(tag, 'name');
    const property = attrOf(tag, 'property');
    return name ? `name:${name}` : property ? `property:${property}` : null;
  }
  if (/^<link/i.test(tag)) {
    // One hreflang alternate per language — and none of them is an RSS <link rel="alternate">.
    const rel = attrOf(tag, 'rel');
    const lang = attrOf(tag, 'hreflang');
    return rel ? `rel:${rel}${lang ? `:${lang}` : ''}` : null;
  }
  return null;
};
// Dropped from index.html even when the new head has no replacement: tags about one URL, and
// empty ones (an empty icon href even makes the browser fetch the page itself as the icon).
const isEmpty = (tag) => /\s(?:content|href)\s*=\s*["']\s*["']/i.test(tag);
const pageSpecific = (key) =>
  ['name:title', 'rel:canonical', 'property:og:url', 'name:twitter:url', 'name:robots'].includes(key) ||
  key.startsWith('property:article:');
/** Key of one head tag's HTML ('title', 'name:description', 'property:og:image', 'rel:canonical'…), or null. */
export const headTagKey = keyOf;
/** <html lang="…"> — added, or the one index.html has replaced (SSR, and the build's index.html). */
export const withLang = (template, lang) =>
  lang
    ? template.replace(/<html\b[^>]*>/i, (open) =>
        /\slang\s*=\s*["'][^"']*["']/i.test(open)
          ? open.replace(/\slang\s*=\s*["'][^"']*["']/i, ` lang="${escapeHtml(lang)}"`)
          : open.replace(/^<html/i, `<html lang="${escapeHtml(lang)}"`),
      )
    : template;
/**
 * index.html with the page's head tags, crawlable HTML (`html`, inserted into #root) and
 * language (`lang`, on <html>).
 */
export function injectPage(template, { head = '', html = '', lang = '' } = {}) {
  template = withLang(template, lang);
  const end = template.search(/<\/head>/i);
  if (end < 0) return template;
  const replaced = new Set((head.match(HEAD_TOKEN) || []).map(keyOf).filter(Boolean));
  const kept = template.slice(0, end).replace(new RegExp(`[ \\t]*(?:${HEAD_TOKEN.source})[ \\t]*\\n?`, 'gi'), (token) => {
    const key = keyOf(token.trim());
    return key && (replaced.has(key) || pageSpecific(key) || isEmpty(token)) ? '' : token;
  });
  const page = `${kept.replace(/\s*$/, '\n')}    ${head}\n${template.slice(end)}`;
  return html ? page.replace(/<div\b[^>]*\sid=["']root["'][^>]*>/i, (open) => open + html) : page;
}
/**
 * Plain semantic HTML of the page, for crawlers (hidden from people until the SPA mounts). A page
 * without its own title / description shows the site's, so #root is never empty for a crawler.
 */
export function renderBody(page, site = {}) {
  if (!page || page.noindex) return '';
  const title = page.title || site.name;
  const description = page.description || (page.content ? '' : site.description);
  const parts = [];
  if (page.breadcrumbs?.length) {
    parts.push(
      `<nav aria-label="Breadcrumb"><ol>${page.breadcrumbs
        .map((crumb) => `<li><a href="${escapeHtml(crumb.url)}">${escapeHtml(crumb.name)}</a></li>`)
        .join('')}</ol></nav>`,
    );
  }
  if (title) parts.push(`<h1>${escapeHtml(title)}</h1>`);
  if (description) parts.push(`<p>${escapeHtml(describe(description))}</p>`);
  if (page.image) parts.push(`<img src="${escapeHtml(page.image)}" alt="${escapeHtml(title || '')}">`);
  if (page.content) {
    parts.push(
      plainText(page.content)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join(''),
    );
  }
  if (page.comments?.length) {
    parts.push(
      `<section><h2>Comments</h2><ol>${page.comments
        .map(
          (comment) =>
            `<li>${comment.author ? `<p>${escapeHtml(comment.author)}</p>` : ''}<p>${escapeHtml(describe(comment.text))}</p></li>`,
        )
        .join('')}</ol></section>`,
    );
  }
  if (page.items?.length) {
    parts.push(
      `<ul>${page.items
        .map(
          (item) =>
            `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>` +
            (item.description ? `<p>${escapeHtml(describe(item.description))}</p>` : '') +
            '</li>',
        )
        .join('')}</ul>`,
    );
  }
  return parts.length ? `<main><article>${parts.join('')}</article></main>` : '';
}
export function renderRobots(config, siteUrl) {
  const robots = config.robots || {};
  return [
    'User-agent: *',
    ...(robots.allow?.length ? robots.allow : ['/']).map((path) => `Allow: ${path}`),
    ...(robots.disallow || []).map((path) => `Disallow: ${path}`),
    ...(robots.extra || []),
    ...(siteUrl ? ['', `Sitemap: ${siteUrl}/sitemap.xml`] : []),
    '',
  ].join('\n');
}
/** `alternatesOf(path)` → the page's hreflang alternates, [{ hreflang, href }] (multi-language sites). */
export function renderSitemap(config, paths, siteUrl, alternatesOf) {
  const sitemap = config.sitemap || {};
  const exclude = new Set(sitemap.exclude || []);
  const urls = [...new Set([...paths, ...(sitemap.extra || [])])].filter((path) => !exclude.has(path));
  const full = (path) => escapeHtml(/^https?:\/\//.test(path) ? path : `${siteUrl}${path}`);
  const body = urls
    .map(
      (path) =>
        `  <url>\n    <loc>${full(path)}</loc>\n` +
        (alternatesOf?.(path) || [])
          .map((alt) => `    <xhtml:link rel="alternate" hreflang="${escapeHtml(alt.hreflang)}" href="${full(alt.href)}"/>\n`)
          .join('') +
        (sitemap.changefreq ? `    <changefreq>${sitemap.changefreq}</changefreq>\n` : '') +
        '  </url>',
    )
    .join('\n');
  const xhtml = body.includes('<xhtml:link') ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtml}>\n${body}\n</urlset>\n`;
}
