// ─────────────────────────────────────────────────────────────────────────────────────────
// SEO ROUTES — meta of every page, in this one file. Site-wide defaults (name, image, robots,
// sitemap) live in src/seo.config.js.
//
// Each entry: { path, ...meta, load?, paths? }
//   path         react-router pattern ('/', '/about', '/products/:id', '/admin/*') — order
//                does not matter, the most specific path wins
//   load         async ({ params, url, entities, site, lang }) => meta | null   (null → 404)
//   paths        async ({ entities, site, lang }) => ['/products/1', …]   URLs of a dynamic route,
//                for sitemap.xml and build:ssg
//
// Meta fields (all optional): title, description, image, keywords,
//   type ('website' | 'article' | 'product' | 'profile' → og:type), noindex, canonical,
//   content (text/HTML shown to crawlers), items [{ title, url, description }],
//   breadcrumbs [{ name, url }]  (also a BreadcrumbList JSON-LD), comments [{ author, text }],
//   imageAlt (og:image:alt / twitter:image:alt), author (meta author; article:author too),
//   alternates { vi: '/vi/about', 'x-default': '/about' }  (hreflang links; automatic with `languages`),
//   lang ('ko' | 'en-US' …)  the page's language → <html lang>, og:locale (default: site.lang).
//                A route with a `:lang` param ('/:lang/products/:id') gets it from the URL by
//                itself — any language, no list to declare ('kr' → 'ko', 'jp' → 'ja'),
//   meta [{ property: 'product:price:amount', content: '799.00' }, …]  any extra <meta>,
//   links [{ rel: 'next', href: '/blog?page=2' }, …]  any extra <link>,
//   jsonLd { '@type': 'Product', name, offers: {…} } or an array  (schema.org; @context added),
//   article: publishedAt, updatedAt, section
// Relative URLs (image, breadcrumbs, alternates, links) are made absolute with the site URL;
// inside jsonLd use `url` from load() for absolute ones. The browser keeps all of it in step on
// navigation (src/seo/client.js) — nothing to add in page components.
//
// Multi-language (`languages` in src/seo.config.js): write every path without the language
// ('/products/:id', breadcrumbs url '/shop') — it is added per page. Any value can be given per
// language: title: { en: 'Shop', kr: '쇼핑' }. `lang` is the page's URL prefix ('kr'); paths() is
// called once per language. Canonical, hreflang and <html lang> come per language by themselves.
//
// Data — the app's own entities, returning plain rows (null / [] when there is no data; if the
// backend is down the SSR server answers 503 by itself, so no try/catch is needed):
//   await entities.Product.get(id)                                    → row | null
//   await entities.Product.list({ filter, sort: '-created_at', limit }) → rows[]
//   await entities.Product.findOne({ slug })                          → row | null
//
// Example:
//   {
//     path: '/products/:id',
//     type: 'product',
//     load: async ({ params, entities }) => {
//       const p = await entities.Product.get(params.id);
//       return p && { title: p.name, description: p.summary, image: p.image, content: p.description };
//     },
//     paths: async ({ entities }) => (await entities.Product.list({ limit: 1000 })).map((p) => `/products/${p.id}`),
//   },
// ─────────────────────────────────────────────────────────────────────────────────────────
export default [
  // Empty title / description fall back to `site` in src/seo.config.js.
  { path: '/', title: '', description: '', image: '', keywords: '' },

  // Never indexed.
  { path: '/admin', noindex: true },
  { path: '/admin/*', noindex: true },
];
