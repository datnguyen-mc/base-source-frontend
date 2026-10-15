import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';
import { fetchHook, requestMethod, requestUrl } from '@/seo/fetch-hook';
// Server side of src/seo/hooks.js: what lets a page that loads its data in useEffect be rendered
// with that data. One "run" per server render:
//   • the app's useState / useReducer / useRef / useMemo / useCallback live here between render
//     passes;
//   • its useEffect / useLayoutEffect run here, once and again when their dependencies change;
//   • the requests they make are awaited, then the page is rendered again — until nothing
//     changes, or the time budget (SSR_EFFECTS_TIMEOUT ms) is spent.
// While an effect runs on the server it can only READ: a POST / PUT / PATCH / DELETE never
// leaves — through fetch or Node's http / https (axios…) — so nothing is created, liked or counted
// by a crawler; nor does a WebSocket / EventSource / BroadcastChannel open. When the render ends
// its timers are cleared, its requests still in flight aborted and its cleanups called. An error it
// throws is ignored, wherever it comes from: the browser runs the same effect again for real.
const SHORT_TIMER_MS = 1000; // a setTimeout up to this long (a debounce…) is waited for
const MAX_EFFECT_RUNS = 3; // per effect, when its dependencies keep changing
const MAX_RESPONSES_BYTES = 512 * 1024; // responses handed to the browser for the replay
const MAX_INITIAL_STATE_BYTES = 8 * 1024; // per state no effect changed (see snapshot)
const MAX_STATE_BYTES = 1024 * 1024; // a state larger than this is rendered with its initial value

// Installed once per process (dev re-evaluates this module on every change).
const GLOBAL = Symbol.for('vibex.ssr.effects');
const runtime = (globalThis[GLOBAL] ??= (() => {
  const als = new AsyncLocalStorage();
  const current = () => {
    const run = als.getStore();
    return run && run.kind === 'ssr-effects' ? run : null;
  };

  // build:ssg renders with no server running (scripts/prerender.js sets the folder): a relative
  // URL is read from the built files instead — what the server would have answered.
  const STATIC_TYPES = { '.json': 'application/json', '.txt': 'text/plain', '.csv': 'text/csv', '.xml': 'application/xml', '.html': 'text/html' };
  const fromStaticDir = async (href) => {
    const dir = globalThis[Symbol.for('vibex.ssr.staticDir')];
    if (!dir) return null;
    try {
      const file = path.resolve(dir, `.${decodeURIComponent(new URL(href).pathname)}`);
      if (!file.startsWith(dir + path.sep)) return null;
      const type = STATIC_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(await readFile(file), { status: 200, headers: { 'content-type': type } });
    } catch {
      return null;
    }
  };

  // ── fetch: GETs are tracked (and recorded for the browser), everything else held back ─────
  fetchHook.intercept = (input, init, real) => {
    const run = current();
    if (!run) return real(input, init);
    const method = requestMethod(input, init);
    if (run.closed || (method !== 'GET' && method !== 'HEAD')) return new Promise(() => {});
    // `fetch('/data.json')` asks the page's own server, as it does in the browser.
    const relative = typeof input === 'string' && !/^[a-z][a-z\d+.-]*:/i.test(input);
    if (relative) input = new URL(input, run.href).href;
    const url = requestUrl(input);
    // Aborted when the render ends: a request nobody answers must not hold a socket for minutes.
    const controller = new AbortController();
    const signals = [controller.signal, init?.signal, input instanceof Request ? input.signal : null].filter(Boolean);
    run.controllers.add(controller);
    const request = (async () => {
      try {
        const res =
          (relative && (await fromStaticDir(input))) ||
          (await real(input, { ...init, signal: signals.length > 1 ? AbortSignal.any(signals) : controller.signal }));
        if (res.status < 200) return res;
        const empty = [101, 204, 205, 304].includes(res.status);
        const body = empty ? null : await res.text();
        const type = res.headers.get('content-type') || '';
        if (method === 'GET' && res.ok && body != null && /json|text/.test(type)) run.record(url, res.status, type, body);
        return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
      } finally {
        run.controllers.delete(controller);
      }
    })();
    run.track(request);
    return request;
  };

  // ── Node's http / https (axios, got… in an effect): the same rules as fetch ─────────────────
  for (const mod of [http, https]) {
    const realRequest = mod.request;
    mod.request = function request(...args) {
      const run = current();
      if (!run) return realRequest.apply(this, args);
      const options = args.find((arg) => arg && typeof arg === 'object' && !(arg instanceof URL)) || {};
      const method = String(options.method || 'GET').toUpperCase();
      const req = realRequest.apply(this, args);
      if (run.closed || (method !== 'GET' && method !== 'HEAD')) {
        req.destroy(new Error(`[ssr] ${method} held back while server-rendering`)); // nothing is sent
        return req;
      }
      run.sockets.add(req);
      run.track(new Promise((resolve) => req.once('close', () => resolve(run.sockets.delete(req)))));
      return req;
    };
    mod.get = function get(...args) {
      const req = mod.request(...args);
      req.end();
      return req;
    };
  }
  syncBuiltinESMExports();

  // An exception thrown from a queued microtask would end the process: caught like the rest.
  const realQueueMicrotask = globalThis.queueMicrotask;
  globalThis.queueMicrotask = function queueMicrotask(callback) {
    const run = current();
    if (!run || typeof callback !== 'function') return realQueueMicrotask(callback);
    return realQueueMicrotask(() => {
      try {
        callback();
      } catch {
        run.fail();
      }
    });
  };

  // ── timers: the app's own are tracked, cleared at the end; none can throw out of a render ──
  const real = {
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    clearTimeout: globalThis.clearTimeout,
    clearInterval: globalThis.clearInterval,
  };
  const owners = new WeakMap();
  const ownersById = new Map(); // clearTimeout(Number(handle)) works in Node too
  // Timers set by a library (undici's own clock…) are left alone, only their errors are caught.
  const fromApp = (wrapper) => {
    const holder = {};
    Error.captureStackTrace(holder, wrapper);
    const caller = String(holder.stack).split('\n')[1] || '';
    return !/node:|\/node_modules\//.test(caller);
  };
  const release = (entry) => {
    if (!entry || entry.released) return;
    entry.released = true;
    entry.run.timers.delete(entry);
    owners.delete(entry.handle);
    ownersById.delete(entry.id);
    entry.done?.();
  };
  const schedule = (kind, wrapper, callback, delay, args) => {
    const run = current();
    if (!run || typeof callback !== 'function') return real[kind](callback, delay, ...args);
    const app = fromApp(wrapper);
    let entry = null;
    const handle = real[kind](() => {
      try {
        if (!(app && run.closed)) callback(...args);
      } catch (err) {
        run.fail(err);
      } finally {
        if (kind === 'setTimeout') release(entry);
      }
    }, delay);
    if (app) {
      entry = { run, handle, id: Number(handle), kind, released: false };
      owners.set(handle, entry);
      ownersById.set(entry.id, entry);
      run.timers.add(entry);
      if (kind === 'setTimeout' && !(Number(delay) > SHORT_TIMER_MS)) {
        run.track(new Promise((resolve) => (entry.done = resolve)));
      }
    }
    return handle;
  };
  function setTimeout(callback, delay, ...args) {
    return schedule('setTimeout', setTimeout, callback, delay, args);
  }
  function setInterval(callback, delay, ...args) {
    return schedule('setInterval', setInterval, callback, delay, args);
  }
  function clearTimeout(handle) {
    if (handle != null) release(typeof handle === 'object' ? owners.get(handle) : ownersById.get(Number(handle)));
    return real.clearTimeout(handle);
  }
  if (real.setTimeout[promisify.custom]) setTimeout[promisify.custom] = real.setTimeout[promisify.custom];
  if (real.setInterval[promisify.custom]) setInterval[promisify.custom] = real.setInterval[promisify.custom];
  Object.assign(globalThis, { setTimeout, setInterval, clearTimeout, clearInterval: clearTimeout });

  // ── storage: an effect sees an empty localStorage / sessionStorage of its own ──────────────
  // A signed-out visitor's browser: `localStorage.getItem('access_token')` is null instead of
  // a ReferenceError that would stop the effect before its request. Outside an effect nothing
  // changes (`typeof localStorage` is still 'undefined'); `window` is left undefined on purpose,
  // so `typeof window` guards (module caches…) keep meaning "in the browser".
  const memoryStorage = () => {
    const items = new Map();
    return {
      get length() {
        return items.size;
      },
      key: (index) => [...items.keys()][index] ?? null,
      getItem: (key) => (items.has(String(key)) ? items.get(String(key)) : null),
      setItem: (key, value) => void items.set(String(key), String(value)),
      removeItem: (key) => void items.delete(String(key)),
      clear: () => items.clear(),
    };
  };
  for (const name of ['localStorage', 'sessionStorage']) {
    let outside = Object.getOwnPropertyDescriptor(globalThis, name);
    if (outside && !outside.configurable) continue;
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        const run = current();
        if (run) return (run.storage[name] ??= memoryStorage());
        return outside?.get ? outside.get.call(globalThis) : outside?.value;
      },
      set(value) {
        outside = { value, writable: true, configurable: true };
      },
    });
  }

  // ── no sockets opened by a server render ───────────────────────────────────────────────────
  for (const name of ['WebSocket', 'EventSource', 'BroadcastChannel']) {
    const Real = globalThis[name];
    if (typeof Real !== 'function') continue;
    globalThis[name] = new Proxy(Real, {
      construct(target, args, newTarget) {
        if (current()) throw new Error(`[ssr] ${name} is not opened while server-rendering`);
        return Reflect.construct(target, args, newTarget);
      },
    });
  }

  return { als, current, release, clear: (entry) => real.clearTimeout(entry.handle) };
})());

const sameDeps = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
// Dependencies that are not an array (a mistake React only warns about) count as none.
const depsOf = (deps) => (Array.isArray(deps) ? deps : undefined);

// useId() is a position in the tree: `{loading ? <Spinner /> : <Post />}` gives Post the ids
// Spinner had. The line that called the hook tells the two apart (component → hooks.js → here).
const callSite = () => {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 3;
  const holder = {};
  Error.captureStackTrace(holder, callSite);
  Error.stackTraceLimit = limit;
  return String(holder.stack).split('\n')[3]?.trim() || '';
};

// Values the browser can be handed as they are: JSON without loss (no Date, Map, class…), and not
// huge. A Proxy or a getter that throws is simply not one of them.
const isJson = (value, path = []) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || path.includes(value) || path.length > 60) return false;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return false;
  const inner = [...path, value];
  return Array.isArray(value)
    ? value.every((item) => item !== undefined && isJson(item, inner))
    : Object.values(value).every((item) => item === undefined || isJson(item, inner));
};
const sizes = new WeakMap();
const jsonSize = (value) => {
  if (!value || typeof value !== 'object') return JSON.stringify(value).length;
  if (!sizes.has(value)) sizes.set(value, JSON.stringify(value).length);
  return sizes.get(value);
};
const shippable = (value, maxBytes = MAX_STATE_BYTES) => {
  try {
    return isJson(value) && jsonSize(value) <= maxBytes;
  } catch {
    return false;
  }
};

/**
 * A run of one server render. `context` goes into SsrEffectsContext (src/seo/hooks.js); between
 * render passes, `settle()` waits for what the effects started, `changed()` tells whether the page
 * must be rendered again. `close()` always ends it.
 */
export function createEffectsRun({ timeout, href }) {
  const deadline = Date.now() + timeout;
  const slots = new Map();
  const refs = new Map();
  const memos = new Map();
  const effects = new Map();
  const pending = new Set();
  const responses = [];
  let responseBytes = 0;
  let pass = 0;
  let frozen = false;

  const run = {
    kind: 'ssr-effects',
    href,
    closed: false,
    controllers: new Set(),
    sockets: new Set(),
    storage: {},
    timers: new Set(),
    errors: 0,
    track(promise) {
      pending.add(promise);
      const done = () => pending.delete(promise);
      promise.then(done, done);
      return promise;
    },
    record(url, status, type, body) {
      if (responseBytes + body.length > MAX_RESPONSES_BYTES) return;
      responseBytes += body.length;
      responses.push({ url, status, type, body });
    },
    fail() {
      run.errors += 1;
    },
  };

  const slot = (id, site, initial, make) => {
    const key = `${id} ${site}`;
    let entry = slots.get(key);
    if (!entry) {
      const value = initial();
      entry = { id, value, initial: value };
      make(entry);
      slots.set(key, entry);
    }
    entry.rendered = entry.value;
    entry.pass = pass;
    return entry;
  };
  const update = (entry, next) => {
    if (!run.closed) entry.value = next;
  };

  const context = {
    state(id, initial) {
      const entry = slot(id, callSite(), initial, (e) => {
        e.set = (next) => update(e, typeof next === 'function' ? next(e.value) : next);
      });
      return [entry.value, entry.set];
    },
    reducer(id, reducer, initial) {
      const entry = slot(id, callSite(), initial, (e) => {
        e.dispatch = (action) => update(e, e.reducer(e.value, action));
      });
      entry.reducer = reducer;
      return [entry.value, entry.dispatch];
    },
    ref(id, initial) {
      const key = `${id} ${callSite()}`;
      if (!refs.has(key)) refs.set(key, { current: initial });
      return refs.get(key);
    },
    // useMemo / useCallback: the same value from one pass to the next while the dependencies
    // hold — or every effect depending on a callback would see it change, and run again.
    memo(id, create, deps) {
      const key = `${id} ${callSite()}`;
      deps = depsOf(deps);
      const previous = memos.get(key);
      if (previous && deps && previous.deps && sameDeps(previous.deps, deps)) return previous.value;
      const value = create();
      memos.set(key, { value, deps });
      return value;
    },
    effect(id, effect, deps) {
      if (frozen || run.closed) return;
      id = `${id} ${callSite()}`;
      deps = depsOf(deps);
      const previous = effects.get(id);
      if (previous) {
        // No dependency array: "after every render" — on the server, after the first one.
        if (!deps || (previous.deps && sameDeps(previous.deps, deps))) return;
        if (previous.runs >= MAX_EFFECT_RUNS) return;
        cleanup(previous);
      }
      const record = { deps, runs: (previous?.runs || 0) + 1, cleanup: null };
      effects.set(id, record);
      try {
        const result = runtime.als.run(run, effect);
        if (typeof result === 'function') record.cleanup = result;
      } catch {
        run.fail();
      }
    },
  };
  const cleanup = (record) => {
    const fn = record.cleanup;
    record.cleanup = null;
    if (!fn) return;
    try {
      runtime.als.run(run, fn);
    } catch {
      run.fail();
    }
  };

  const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
  return {
    context,
    get errors() {
      return run.errors;
    },
    /** Before each render pass. The last one (`final`) runs no effect: it renders what is there. */
    beginPass(final = false) {
      pass += 1;
      frozen = final;
      return pass;
    },
    expired: () => Date.now() >= deadline,
    /** Waits for the requests (and short timers) the effects started, within the time budget. */
    async settle() {
      for (;;) {
        // Let what just answered carry on (setState after `await`, the next request…).
        for (let i = 0; i < 3; i += 1) await nextTurn();
        if (!pending.size) return true;
        const left = deadline - Date.now();
        if (left <= 0) return false;
        let timer;
        await Promise.race([
          Promise.allSettled([...pending]),
          new Promise((resolve) => (timer = setTimeout(resolve, left))),
        ]);
        clearTimeout(timer);
      }
    },
    /** True when a state the last pass rendered has changed since. */
    changed: () => [...slots.values()].some((entry) => entry.pass === pass && !Object.is(entry.value, entry.rendered)),
    /**
     * The states the last pass rendered, for hydration (src/seo/hooks.js): `data` — set by an
     * effect; `initial` — still their initial value, which the browser may compute differently
     * (a module cache filled on the server, localStorage, Math.random…): hydration starts from
     * the server's value either way, so the markup matches.
     */
    snapshot() {
      const state = { data: {}, initial: {} };
      for (const entry of slots.values()) {
        if (entry.pass !== pass) continue;
        if (!Object.is(entry.rendered, entry.initial)) {
          if (shippable(entry.rendered)) state.data[entry.id] = entry.rendered;
        } else if (shippable(entry.rendered, MAX_INITIAL_STATE_BYTES)) state.initial[entry.id] = entry.rendered;
      }
      return state;
    },
    /**
     * States the last pass rendered that the browser cannot be handed (a Date, a Map, a huge list…) go back to
     * their initial value — as hydration will start them. True when the page must be rendered
     * once more (a final pass) to match.
     */
    forgetUnshippable() {
      let forgot = false;
      for (const entry of slots.values()) {
        if (entry.pass !== pass || Object.is(entry.rendered, entry.initial) || shippable(entry.rendered)) continue;
        entry.value = entry.initial;
        forgot = true;
      }
      return forgot;
    },
    responses: () => responses,
    close() {
      if (run.closed) return;
      effects.forEach(cleanup);
      run.closed = true;
      run.controllers.forEach((controller) => controller.abort());
      run.sockets.forEach((req) => req.destroy());
      [...run.timers].forEach((entry) => {
        runtime.clear(entry);
        // (a runtime installed by an older version of this file, still running in dev, has no release)
        if (runtime.release) runtime.release(entry);
        else {
          run.timers.delete(entry);
          entry.done?.();
        }
      });
    },
  };
}
