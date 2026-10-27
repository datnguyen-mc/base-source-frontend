// ─────────────────────────────────────────────────────────────────────────────────────────
// SEO CONFIG — site-wide settings. Per-page meta lives in src/seo.routes.js.
//   • site    → default <head> of index.html (title, description, icons, Open Graph, lang)
//   • robots  → robots.txt        • sitemap → sitemap.xml        (every build mode)
//     — each only when public/ has no file of that name: the base ships public/robots.txt, so
//     robots rules are edited there (served as it is).
// ─────────────────────────────────────────────────────────────────────────────────────────
export default {
  // Multi-language with a fixed list: one URL prefix per language (/en/…, /kr/…), each with its
  // own SEO — README "Multi-language". The first is the default: '/' and paths without a prefix
  // redirect to it. Any text can be given per language, e.g. description: { en: '…', kr: '…' }.
  // Leave it out for a single-language site, or for routes that carry the language themselves
  // ('/:lang/products/:id' — any language, see `lang` in src/seo.routes.js).
  // languages: ['en', 'kr'],

  site: {
    name: 'VibeX APP',
    // Public origin, e.g. 'https://myapp.com'. The SITE_URL env var overrides it.
    url: '',
    lang: 'en', // 'vi-VN' style (or ko, ja, vi, th, id) also sets og:locale; a page's own `lang` wins; with `languages`, unused
    description: 'VibeX APP',
    keywords: '',
    image: '', // default social share image (1200×630)
    favicon: '',
    appleTouchIcon: '',
    themeColor: '',
    twitterSite: '', // e.g. '@myapp'
    // Site search, for the search box in Google results (WebSite JSON-LD on the home page),
    // e.g. '/search?q={search_term_string}'. Leave empty when the app has no search page.
    searchUrl: '',
  },

  // true → a path matching no route is answered with HTTP 404 + noindex (SSR). Turn on once
  // every page in src/pages.config.js has a route in src/seo.routes.js.
  strict: false,

  // Generates robots.txt only when public/robots.txt is missing (the base ships one: edit that).
  robots: {
    disallow: ['/admin'],
    // allow: ['/'], extra: ['Crawl-delay: 10'],
  },

  sitemap: {
    changefreq: 'weekly', // always | hourly | daily | weekly | monthly | yearly | never
    // extra: ['/landing/summer'],   additional URLs
    // exclude: ['/thank-you'],      URLs to leave out
  },
};
