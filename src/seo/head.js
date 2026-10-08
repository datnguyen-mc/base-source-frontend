// Pure renderers for <head>, crawlable body, robots.txt and sitemap.xml, shared by the
// SSR server, build:ssg, the Vite plugin and the client. Driven by src/seo.config.js and the
// routes in src/seo.routes.js — edit those, not this file.
export const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const plainText = (value) =>
  String(value == null ? '' : value)
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
export const pageTitle = (title, site) => {
  const name = site.name || '';
  if (!title || title === name) return name;
  return name ? `${title} | ${name}` : String(title);
};
export const resolveSiteUrl = (site, fallback = '') =>
  String((typeof process !== 'undefined' && process.env?.SITE_URL) || site.url || fallback).replace(/\/+$/, '');
const absolute = (value, siteUrl) =>
  value && siteUrl && value.startsWith('/') && !value.startsWith('//') ? `${siteUrl}${value}` : value;
const isoDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
};
// og:locale wants language_TERRITORY ('vi_VN'); a bare language ('en') is left out.
const ogLocale = (lang) => (/^[a-z]{2,3}[-_][a-z]{2}$/i.test(lang || '') ? lang.replace('-', '_') : '');
const tag = (name, attrs) =>
  `<${name} ${Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(' ')}>`;
const OG_TYPES = { article: 'article', product: 'product', profile: 'profile' };
/**
 * The page's <head> tags (see injectPage). `path` is the page the head was rendered for
 * (SSR / SSG); without it (the SPA's site defaults) the client fills the head.
 */
export function renderHead(page, site, siteUrl, path) {
  const title = pageTitle(page.title, site);
  const description = describe(page.description || page.content, site.description);
  const image = absolute(page.image || site.image, siteUrl);
  // `page.canonical` lets several URLs of one page (e.g. /p/54 and /p/my-title-54) share one.
  const canonical = siteUrl && path && !page.noindex ? `${siteUrl}${page.canonical || path}` : '';
  const twitterCard = image ? 'summary_large_image' : 'summary';
  const ogType = OG_TYPES[page.type] || 'website';
  const published = ogType === 'article' && isoDate(page.publishedAt);
  const modified = ogType === 'article' && isoDate(page.updatedAt);
  const lines = [
    `<title data-seo-path="${escapeHtml(path || '')}">${escapeHtml(title)}</title>`,
    description && tag('meta', { name: 'description', content: description }),
    (page.keywords || site.keywords) && tag('meta', { name: 'keywords', content: page.keywords || site.keywords }),
    tag('meta', { name: 'robots', content: page.noindex ? 'noindex' : 'index, follow, max-image-preview:large' }),
    canonical && tag('link', { rel: 'canonical', href: canonical }),
    site.favicon && tag('link', { rel: 'icon', href: site.favicon }),
    site.appleTouchIcon && tag('link', { rel: 'apple-touch-icon', href: site.appleTouchIcon }),
    site.themeColor && tag('meta', { name: 'theme-color', content: site.themeColor }),
    tag('meta', { property: 'og:site_name', content: site.name }),
    tag('meta', { property: 'og:type', content: ogType }),
    tag('meta', { property: 'og:title', content: title }),
    description && tag('meta', { property: 'og:description', content: description }),
    image && tag('meta', { property: 'og:image', content: image }),
    canonical && tag('meta', { property: 'og:url', content: canonical }),
    ogLocale(site.lang) && tag('meta', { property: 'og:locale', content: ogLocale(site.lang) }),
    published && tag('meta', { property: 'article:published_time', content: published }),
    modified && tag('meta', { property: 'article:modified_time', content: modified }),
    ogType === 'article' && page.author && tag('meta', { property: 'article:author', content: page.author }),
    ogType === 'article' && page.section && tag('meta', { property: 'article:section', content: page.section }),
    tag('meta', { name: 'twitter:card', content: twitterCard }),
    site.twitterSite && tag('meta', { name: 'twitter:site', content: site.twitterSite }),
    tag('meta', { name: 'twitter:title', content: title }),
    description && tag('meta', { name: 'twitter:description', content: description }),
    image && tag('meta', { name: 'twitter:image', content: image }),
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
  if (/^<link/i.test(tag)) return attrOf(tag, 'rel') ? `rel:${attrOf(tag, 'rel')}` : null;
  return null;
};
// Dropped from index.html even when the new head has no replacement: tags about one URL, and
// empty ones (an empty icon href even makes the browser fetch the page itself as the icon).
const isEmpty = (tag) => /\s(?:content|href)\s*=\s*["']\s*["']/i.test(tag);
const pageSpecific = (key) =>
  ['name:title', 'rel:canonical', 'property:og:url', 'name:robots'].includes(key) || key.startsWith('property:article:');
/** index.html with the page's head tags and crawlable HTML (`html`, inserted into #root). */
export function injectPage(template, { head = '', html = '' } = {}) {
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
export function renderSitemap(config, paths, siteUrl) {
  const sitemap = config.sitemap || {};
  const exclude = new Set(sitemap.exclude || []);
  const urls = [...new Set([...paths, ...(sitemap.extra || [])])].filter((path) => !exclude.has(path));
  const body = urls
    .map(
      (path) =>
        `  <url>\n    <loc>${escapeHtml(/^https?:\/\//.test(path) ? path : `${siteUrl}${path}`)}</loc>\n` +
        (sitemap.changefreq ? `    <changefreq>${sitemap.changefreq}</changefreq>\n` : '') +
        '  </url>',
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
