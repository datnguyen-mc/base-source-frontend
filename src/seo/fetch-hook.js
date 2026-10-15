// Imported first by src/main.jsx and src/entry-server.js, before the SDK keeps its own reference
// to fetch. Every request then goes through `hook.intercept` when one is set:
//   • server — src/seo/render-app.jsx tracks the GETs a page's effects make while it renders, and
//     holds back writes (see there);
//   • browser — the responses the server rendered with are answered once more, straight away, to
//     the same effects re-running after hydration: the page keeps its content instead of flashing
//     back to a loading state while it fetches what it already shows.
const KEY = Symbol.for('vibex.ssr.fetch');

export const fetchHook = (() => {
  if (globalThis[KEY]) return globalThis[KEY];
  const hook = { intercept: null, real: globalThis.fetch?.bind(globalThis) };
  globalThis[KEY] = hook;
  if (hook.real) {
    globalThis.fetch = (input, init) => (hook.intercept ? hook.intercept(input, init, hook.real) : hook.real(input, init));
  }
  return hook;
})();

export const requestMethod = (input, init) => String(init?.method || input?.method || 'GET').toUpperCase();
export const requestUrl = (input, base) => {
  const raw = typeof input === 'string' ? input : input?.url ?? String(input);
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
};

// ── Browser: replay of the server's responses ───────────────────────────────────────────────
// The server renders as a signed-out visitor, so only requests without credentials are answered
// from what it got — each recorded response once, during the first seconds after hydration.
// Anything else (a signed-in visitor's requests, writes, later requests) goes to the network; the
// GETs that do while the page settles are watched (networkSettled), so the page can keep showing
// what the server rendered until their answers land.
const REPLAY_WINDOW_MS = 10000;
const serverRendered = typeof window !== 'undefined' && Boolean(window.__staticRouterHydrationData);
let replay = null;
let watching = null;

const hasCredentials = (input, init) => {
  try {
    return new Headers(init?.headers ?? (typeof input === 'object' ? input?.headers : undefined)).has('authorization');
  } catch {
    return true;
  }
};
// A Response-like object whose body resolves in a microtask, so an effect's `setLoading(true)`
// and its `setData(…)` land in the same render.
const answer = (entry, url) => {
  const headers = new Headers(entry.type ? { 'content-type': entry.type } : {});
  return {
    ok: entry.status >= 200 && entry.status < 300,
    status: entry.status,
    statusText: '',
    headers,
    url,
    redirected: false,
    type: 'basic',
    bodyUsed: false,
    get body() {
      return new Response(entry.body).body;
    },
    text: () => Promise.resolve(entry.body),
    json: () => Promise.resolve().then(() => JSON.parse(entry.body)),
    arrayBuffer: () => new Response(entry.body).arrayBuffer(),
    blob: () => new Response(entry.body, { headers }).blob(),
    clone: () => answer(entry, url),
  };
};

if (serverRendered) {
  replay = new Map();
  for (const entry of Array.isArray(window.__SSR_FETCH__) ? window.__SSR_FETCH__ : []) {
    if (!replay.has(entry.url)) replay.set(entry.url, []);
    replay.get(entry.url).push(entry);
  }
  delete window.__SSR_FETCH__;
  watching = new Set();
  fetchHook.intercept = (input, init, real) => {
    const get = requestMethod(input, init) === 'GET';
    if (get && replay && !hasCredentials(input, init)) {
      const url = requestUrl(input, window.location.href);
      const entry = replay.get(url)?.shift();
      if (entry) return Promise.resolve(answer(entry, url));
    }
    const request = real(input, init);
    if (get && watching) {
      watching.add(request);
      const done = () => watching?.delete(request);
      request.then(done, done);
    }
    return request;
  };
}

/**
 * Resolves once the GETs that went to the network since the page loaded have answered, and what
 * they started has too — at most `ms` later. Watching stops then.
 */
export const networkSettled = (ms) =>
  new Promise((resolve) => {
    const deadline = Date.now() + ms;
    const check = () => {
      if (!watching?.size || Date.now() >= deadline) {
        watching = null;
        return resolve();
      }
      let timer;
      Promise.race([Promise.allSettled([...watching]), new Promise((done) => (timer = setTimeout(done, deadline - Date.now())))])
        .then(() => clearTimeout(timer))
        .then(() => setTimeout(check, 0)); // let what answered carry on (setState, the next request)
    };
    check();
  });

/** Called once the server-rendered page has hydrated: the replay closes a little later. */
export const endFetchReplay = () => {
  if (!replay) return;
  setTimeout(() => {
    replay = null;
    watching = null;
    fetchHook.intercept = null;
  }, REPLAY_WINDOW_MS);
};
