// ─────────────────────────────────────────────────────────────────────────────────────────
// SEO CONFIG — site-wide settings. Per-page meta lives in src/seo-routes/ (one file per route).
//   • site    → default <head> of index.html (title, description, icons, Open Graph, lang)
//   • robots  → robots.txt        • sitemap → sitemap.xml        (every build mode)
// ─────────────────────────────────────────────────────────────────────────────────────────
export default {
  site: {
    name: 'VibeX APP',
    // Public origin, e.g. 'https://myapp.com'. The SITE_URL env var overrides it.
    url: '',
    lang: 'en', // 'vi-VN' style also sets og:locale
    description: 'VibeX APP',
    keywords: '',
    image: '', // default social share image (1200×630)
    favicon: '',
    appleTouchIcon: '',
    themeColor: '',
    twitterSite: '', // e.g. '@myapp'
    searchUrl: '', // e.g. '/search?q={search_term_string}' → Google sitelinks search box
  },

  // true → a path matching no route file is answered with HTTP 404 + noindex (SSR). Turn on
  // once every page in src/pages.config.js has a file in src/seo-routes/.
  strict: false,

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
