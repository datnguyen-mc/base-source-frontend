// Pure renderers for <head>, crawlable body, JSON-LD, robots.txt and sitemap.xml, shared by the
// SSR server, build:ssg, the Vite plugin and the client. Driven by src/seo.config.js and the
// route files in src/seo-routes/ — edit those, not this file.
export const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
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
const fullText = (value) => plainText(value).replace(/\s+/g, ' ').trim() || undefined;
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
const SCHEMA_TYPES = { article: 'Article', discussion: 'DiscussionForumPosting', product: 'Product', profile: 'ProfilePage' };
const OG_TYPES = { article: 'article', discussion: 'article', product: 'product', profile: 'profile' };
const person = (name, url) => (name ? { '@type': 'Person', name, url } : undefined);
const counter = (action, count) =>
  count == null ? undefined : { '@type': 'InteractionCounter', interactionType: `https://schema.org/${action}`, userInteractionCount: Number(count) };
export function buildJsonLd(page, site, siteUrl, path) {
  const url = siteUrl && path ? `${siteUrl}${page.canonical || path}` : undefined;
  const image = absolute(page.image, siteUrl) || undefined;
  const description = describe(page.description || page.content) || undefined;
  const out = [];
  if (path === '/') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: site.name,
      url,
      potentialAction: site.searchUrl
        ? { '@type': 'SearchAction', target: absolute(site.searchUrl, siteUrl), 'query-input': 'required name=search_term_string' }
        : undefined,
    });
  }
  const schema = SCHEMA_TYPES[page.type];
  if (schema === 'Article') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.title,
      description,
      image,
      url,
      datePublished: isoDate(page.publishedAt),
      dateModified: isoDate(page.updatedAt || page.publishedAt),
      author: person(page.author, absolute(page.authorUrl, siteUrl)),
    });
  } else if (schema === 'DiscussionForumPosting') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      '@id': url,
      url,
      headline: page.title,
      text: fullText(page.content || page.description),
      image,
      datePublished: isoDate(page.publishedAt),
      dateModified: isoDate(page.updatedAt || page.publishedAt),
      author: person(page.author, absolute(page.authorUrl, siteUrl)),
      interactionStatistic: [counter('LikeAction', page.likeCount), counter('CommentAction', page.commentCount)].filter(Boolean),
      comment: (page.comments || []).map((comment) => ({
        '@type': 'Comment',
        text: fullText(comment.text),
        datePublished: isoDate(comment.publishedAt),
        author: person(comment.author),
      })),
    });
  } else if (schema === 'Product') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: page.title,
      description,
      image,
      url,
      offers:
        page.price != null
          ? {
              '@type': 'Offer',
              price: page.price,
              priceCurrency: page.currency,
              availability: `https://schema.org/${page.availability || 'InStock'}`,
              url,
            }
          : undefined,
    });
  } else if (schema === 'ProfilePage') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name: page.title, image, description, url },
    });
  }
  if (page.items?.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: page.items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: absolute(item.url, siteUrl),
        name: item.title,
      })),
    });
  }
  if (page.breadcrumbs?.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: page.breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: absolute(crumb.url, siteUrl),
      })),
    });
  }
  return out.concat(page.jsonLd ? [].concat(page.jsonLd) : []);
}
/**
 * The tags between <!--seo-head--> and <!--/seo-head--> in index.html. `path` is the page the
 * head was rendered for (SSR / SSG); without it (index.html defaults) the client fills the head.
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
    ...(page.noindex ? [] : buildJsonLd(page, site, siteUrl, path)).map(
      (data) => `<script type="application/ld+json">${escapeJson(data)}</script>`,
    ),
  ];
  return `<!--seo-head-->\n    ${lines.filter(Boolean).join('\n    ')}\n    <!--/seo-head-->`;
}
/** Plain semantic HTML of the page, for crawlers (hidden from people until the SPA mounts). */
export function renderBody(page) {
  if (!page || page.noindex) return '';
  const parts = [];
  if (page.breadcrumbs?.length) {
    parts.push(
      `<nav aria-label="Breadcrumb"><ol>${page.breadcrumbs
        .map((crumb) => `<li><a href="${escapeHtml(crumb.url)}">${escapeHtml(crumb.name)}</a></li>`)
        .join('')}</ol></nav>`,
    );
  }
  if (page.title) parts.push(`<h1>${escapeHtml(page.title)}</h1>`);
  if (page.description) parts.push(`<p>${escapeHtml(page.description)}</p>`);
  if (page.image) parts.push(`<img src="${escapeHtml(page.image)}" alt="${escapeHtml(page.title || '')}">`);
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
