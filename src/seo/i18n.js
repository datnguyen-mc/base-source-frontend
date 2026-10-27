import config from '@/seo.config';
// Multi-language sites (`languages` in src/seo.config.js): each language has its own URL prefix —
// /en/shop, /kr/shop — and its own SEO. Every other path (src/seo.routes.js, the app's routes and
// links) is written without it: the router serves the app under the URL's prefix (its basename)
// and the SEO engine resolves the rest. Without `languages` nothing here changes anything.
//
//   languages: ['en', 'kr'],                                   // the first is the default
//   languages: { en: {}, kr: { hreflang: 'ko-KR', label: '한국어' } },

// URL prefixes that are countries, not languages. hreflang and <html lang> need the language:
// 'kr' would be Kanuri, 'tw' Twi. Any other prefix is its own language tag unless `hreflang` says.
const LANGUAGE_OF = { kr: 'ko', jp: 'ja', cn: 'zh-CN', tw: 'zh-TW', vn: 'vi', cz: 'cs', dk: 'da', gr: 'el', ua: 'uk' };
// One URL segment that cannot be mistaken for a page: 'en', 'kr', 'pt-br'.
const CODE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i;
/** The language tag of a URL prefix: 'kr' → 'ko', 'en' → 'en'. */
export const languageTag = (code) => LANGUAGE_OF[code.toLowerCase()] || code;

const declared = config.languages;
const entries = Array.isArray(declared)
  ? declared.map((code) => [code, {}])
  : declared && typeof declared === 'object'
    ? Object.entries(declared)
    : [];
/** [{ code: 'kr', hreflang: 'ko', label: 'KR' }] — empty for a single-language site. */
export const languages = entries
  .filter(([code]) => {
    if (typeof code === 'string' && CODE.test(code)) return true;
    console.warn(`[seo] src/seo.config.js: language '${code}' is not a URL prefix like 'en' or 'kr' — skipped`);
    return false;
  })
  .map(([code, options]) => ({
    code,
    hreflang: options?.hreflang || languageTag(code),
    label: options?.label || code.toUpperCase(),
  }));
const codes = new Set(languages.map((language) => language.code));
/** The prefix a URL without one is sent to; undefined for a single-language site. */
export const defaultLanguage = languages[0]?.code;
export const languageOf = (code) => languages.find((language) => language.code === code);

// The admin area (src/App.jsx) has one URL for every language.
const UNLOCALIZED = /^\/admin(?:[/?#]|$)/;

/** '/kr/shop' → { lang: 'kr', path: '/shop' }; a path without a language → { lang: undefined, path }. */
export const splitLanguage = (pathname) => {
  const code = pathname.split('/')[1];
  if (!codes.has(code)) return { lang: undefined, path: pathname };
  return { lang: code, path: pathname.slice(code.length + 1) || '/' };
};
/** The router basename of a URL path: its language prefix ('/kr'), or undefined. */
export const basenameOf = (pathname) => {
  const { lang } = splitLanguage(pathname);
  return lang ? `/${lang}` : undefined;
};

/**
 * '/shop' → '/kr/shop': a page of this site in that language. Anything else is left as it is —
 * other sites, paths that already have a language, the admin.
 */
export const localize = (href, lang) => {
  if (!lang || typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//') || UNLOCALIZED.test(href)) return href;
  if (codes.has(href.split(/[/?#]/)[1])) return href;
  return /^\/(?:[?#]|$)/.test(href) ? `/${lang}${href.slice(1)}` : `/${lang}${href}`;
};

/** Where a URL without its language goes — '/shop' → '/en/shop' — or null when it needs nothing. */
export const languageRedirect = (pathname, search = '') => {
  if (!defaultLanguage || splitLanguage(pathname).lang || UNLOCALIZED.test(pathname)) return null;
  // A file (/favicon.ico, /ads.txt) is not a page in any language.
  if (/\.[a-z0-9]+$/i.test(pathname)) return null;
  return localize(pathname, defaultLanguage) + search;
};

/**
 * The browser router's basename: this URL's language prefix. A URL without one is moved to the
 * default language first (/shop → /en/shop, no reload) — the SPA build has no server to redirect.
 */
export const browserBasename = () => {
  if (!defaultLanguage) return undefined;
  const { pathname, search, hash } = window.location;
  const target = languageRedirect(pathname, search);
  if (target) window.history.replaceState(window.history.state, '', target + hash);
  return basenameOf(window.location.pathname);
};

// ── Values given per language ────────────────────────────────────────────────────────────────
const isPlain = (value) => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const isPerLanguage = (value) => isPlain(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => codes.has(key));
/**
 * { en: 'Shop', kr: '쇼핑' } in one language — the default's where that one is missing — wherever
 * it sits (a breadcrumb's name, a field of jsonLd). Any other value as is.
 */
export const inLanguage = (value, lang) => {
  if (!defaultLanguage) return value;
  if (isPerLanguage(value)) return value[lang] ?? value[defaultLanguage] ?? Object.values(value)[0];
  if (Array.isArray(value)) return value.map((entry) => inLanguage(entry, lang));
  return isPlain(value) ? fieldsIn(value, lang) : value;
};
/** Each field of an object in one language (see inLanguage), but those named in `skip`. */
export const fieldsIn = (fields, lang, skip = []) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, skip.includes(key) ? value : inLanguage(value, lang)]));

/** src/seo.config.js `site` in one language: its fields picked, `lang` that language's tag, `home` its home page. */
export const siteIn = (site, lang) => {
  const language = languageOf(lang);
  if (!language) return site;
  const out = fieldsIn(site, lang);
  return { ...out, lang: language.hreflang, home: `/${lang}`, searchUrl: localize(out.searchUrl, lang) };
};

/**
 * A page's own language, whatever languages the app has (no `languages` list needed): `lang` in
 * its meta ('en-US'), else its route's `:lang` ('/:lang/products/:id' — /kr/products/3 is 'ko').
 * Undefined when it has neither: the site's applies.
 */
export const ownLanguage = (page, params) => {
  const lang = typeof page?.lang === 'string' && page.lang ? page.lang : CODE.test(params?.lang || '') ? params.lang : '';
  return lang ? languageTag(lang) : undefined;
};

/** hreflang alternates of a page (path without its language) in every language; x-default is the default's. */
export const alternatesFor = (path) => [
  ...languages.map(({ code, hreflang }) => ({ hreflang, href: localize(path, code) })),
  { hreflang: 'x-default', href: localize(path, defaultLanguage) },
];

// ── The page's language for the API ──────────────────────────────────────────────────────────
// The SDK asks the API in the language of the page (Accept-Language), so its data matches the page.
// On the server pages render side by side: src/entry-server.js keeps each one's language in an
// AsyncLocalStorage, put on globalThis — this module runs in the browser too.
export const SERVER_LANGUAGE = Symbol.for('vibex.ssr.language');
/** Runs `fn` for a page in that language (on the server: the API is asked in it). */
export const asLanguage = (lang, fn) => {
  const store = typeof window === 'undefined' ? globalThis[SERVER_LANGUAGE] : null;
  return store ? store.run(lang, fn) : fn();
};
/**
 * The language tag of the page shown — on the server, of the page being rendered: 'ko' for /kr/….
 * Undefined on a single-language site and on a page without a language (the admin).
 */
export const pageLanguage = () => {
  if (!defaultLanguage) return undefined;
  const lang = typeof window === 'undefined' ? globalThis[SERVER_LANGUAGE]?.getStore() : splitLanguage(window.location.pathname).lang;
  return languageOf(lang)?.hreflang;
};
