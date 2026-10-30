/*
 * SEO ROUTES — meta of every page. Site-wide defaults live in src/seo.config.js.
 *
 * Entry: { path, ...meta, load?, paths? }
 *   path   react-router pattern ('/', '/products/:id', '/admin/*'); the most specific wins
 *   load   async ({ params, url, entities, site, lang }) => meta | null   (null → 404)
 *   paths  async ({ entities, site, lang }) => ['/products/1', …]   URLs of a dynamic route,
 *          for sitemap.xml and build:ssg; called once per language
 *
 * Meta, all optional: title, description, image, keywords, canonical, noindex, imageAlt, author,
 *   type ('website' | 'article' | 'product' | 'profile' → og:type),
 *   content (text/HTML shown to crawlers), items [{ title, url, description }],
 *   breadcrumbs [{ name, url }], comments [{ author, text }],
 *   alternates { vi: '/vi/about', 'x-default': '/about' }  (automatic with `languages`),
 *   lang ('ko' | 'en-US'), else the URL's: its first segment with `site.langs`, else a `:lang` param,
 *   meta [{ property, content }], links [{ rel, href }], jsonLd {…}, article: { publishedAt, updatedAt, section }
 * An empty title / description falls back to `site`; /admin is the one route kept out of search.
 * Every title gets the site name after it ('Contact' → 'Contact | myapp'), so leave it out.
 *
 * Relative image / breadcrumb / alternate URLs are made absolute with the site URL. With
 * `languages`, write every path WITHOUT the prefix — it is added per page, and any value can be
 * given per language: title: { en: 'Shop', kr: '쇼핑' }.
 *
 * Entities return plain rows and need no try/catch — a backend that cannot answer makes the
 * server reply 503 by itself:
 *   entities.Product.get(id)  ·  .list({ filter, sort, limit })  ·  .findOne({ slug })
 *
 * Only this header survives an edit from the dashboard SEO screen: it rewrites the array from the
 * entries it parsed, so a comment inside the array is dropped.
 */
export default [
  { path: '/', title: '', description: '', image: '', keywords: '' },
  { path: '/admin', noindex: true },
  { path: '/admin/*', noindex: true },
];
