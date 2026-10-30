import purify from 'dompurify';

// Imported by src/entry-server.js before the app's own modules, which may call DOMPurify as they
// load (setConfig, addHook). DOMPurify needs a DOM to sanitize HTML, which Node has not: it gets
// jsdom's (the setup DOMPurify documents for Node) on the very instance the app imports, so
// components that sanitize while rendering work on the server unchanged. jsdom costs tens of MB of
// memory for as long as the server runs, and most apps never sanitize on the server (dompurify is
// often only there for another package): it is loaded the first time one of DOMPurify's methods
// is called — from the server bundle, which carries it (published servers have no node_modules).
// Until it is in, settings and hooks wait for it and whatever is sanitized comes out empty, never
// unsanitized; src/seo/render-app.jsx then renders the page once more. Without a DOM the instance
// has none of the methods, only isSupported = false — hence the list. (No dompurify installed:
// vite-plugins/seo-plugin.js gives null here.)
const PURIFY_METHODS = ['sanitize', 'setConfig', 'clearConfig', 'isValidAttribute', 'addHook', 'removeHook', 'removeHooks', 'removeAllHooks'];
let callsWithoutDom = 0;
let dom = null; // jsdom loading, since DOMPurify was first used

if (purify && !purify.isSupported) {
  const waiting = [];
  const loadDom = () =>
    (dom ??= import('jsdom').then(
      ({ JSDOM }) => {
        Object.assign(purify, purify(new JSDOM('').window)); // the real methods, over the ones below
        for (const [name, args] of waiting.splice(0)) purify[name](...args);
      },
      (err) => console.error('[ssr] jsdom could not load: DOMPurify gives empty results on the server', err),
    ));
  for (const name of PURIFY_METHODS) {
    purify[name] = (...args) => {
      loadDom();
      callsWithoutDom++;
      if (name === 'sanitize') return '';
      if (name === 'isValidAttribute') return false;
      waiting.push([name, args]);
    };
  }
  // An app that checks it before sanitizing still calls sanitize (and so gets jsdom loaded).
  purify.isSupported = true;
}

/** DOMPurify calls answered without jsdom so far: a render that made some is rendered again. */
export const purifyCallsWithoutDom = () => callsWithoutDom;
/** Resolves once jsdom is in (at once when nothing asked for it). */
export const serverDomLoaded = () => dom ?? Promise.resolve();
