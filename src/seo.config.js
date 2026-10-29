/*
 * SEO CONFIG — site-wide settings. Per-page meta lives in src/seo.routes.js.
 * robots.txt and sitemap.xml are generated in every build mode, each only when public/ has no file
 * of that name — the base ships public/robots.txt, so crawling rules are edited there.
 *
 * site
 *   name         empty → index.html keeps its own tags; a value here replaces them in every build mode
 *   url          'https://myapp.com'. The SITE_URL env var overrides it
 *   lang         'vi-VN' style (or ko, ja, vi, th, id) also sets og:locale; a page's own `lang` wins
 *   langs        languages an app carries in its own routes (':lang/products/:id'), e.g. ['ko', 'en'],
 *                `lang` being the default. A URL without one 301s to it, an unknown first segment
 *                404s, and pages without a language (/login, /admin) stay as they are
 *   image        default social share image (1200×630)
 *   twitterSite  '@myapp'
 *   searchUrl    '/search?q={search_term_string}' — the search box in Google results
 * Any text can be given per language: description: { en: '…', kr: '…' }.
 *
 * languages: ['en', 'kr'] — the other way round: one URL prefix per language (/en/…, /kr/…), each
 *   with its own SEO, the first the default, '/' redirecting to it. Declare it at the top level
 *   instead of `site.langs` when the pages do NOT carry the language in their own routes.
 *
 * strict   true → a path matching no route answers 404 + noindex (SSR). Turn it on once every page
 *          in src/pages.config.js has a route in src/seo.routes.js
 * robots   also takes allow: ['/'] and extra: ['Crawl-delay: 10']
 * sitemap  changefreq: always|hourly|daily|weekly|monthly|yearly|never; also takes extra, exclude
 *
 * Only this header survives an edit from Project Settings: the platform rewrites the object from
 * the fields it parsed, so a comment inside the object is dropped.
 */
export default {
  site: {
    name: '',
    url: '',
    lang: 'en',
    langs: [],
    description: '',
    keywords: '',
    image: '',
    favicon: '',
    appleTouchIcon: '',
    themeColor: '',
    twitterSite: '',
    searchUrl: '',
  },
  strict: false,
  robots: { disallow: ['/admin'] },
  sitemap: { changefreq: 'weekly' },
};
