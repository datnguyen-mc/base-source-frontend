import React from 'react';
import { endFetchReplay, networkSettled } from '@/seo/fetch-hook';
// `react` as the app's own code sees it. vite-plugins/seo-plugin.js points `import … from 'react'`
// in the app's files (pages, components, hooks, Layout) here; everything else in React is
// unchanged. Only the hooks below differ, so that data loaded in a useEffect is in the
// server-rendered HTML — the same page the browser ends up showing, without writing a loader:
//
//   • server — useState / useReducer / useRef / useMemo / useCallback keep their value between the
//     render passes of src/seo/render-app.jsx, and useEffect / useLayoutEffect run their effect
//     (once, and again when their dependencies change), as the browser would after mounting. The
//     page is rendered again once the requests those effects made have answered, until nothing
//     changes any more.
//   • browser — while the server-rendered page hydrates, each state starts from the value the
//     server rendered with (window.__SSR_STATE__), so the markup matches and nothing flashes.
//
// Every state is keyed by React.useId(), which React keeps identical between the server render
// and hydration.

// The rest of React, as is (named: `export *` does not reach through a pre-bundled CJS package).
export const {
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cache,
  cloneElement,
  createContext,
  createElement,
  createFactory,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  unstable_act,
  use,
  useActionState,
  useContext,
  useDebugValue,
  useDeferredValue,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useOptimistic,
  useSyncExternalStore,
  useTransition,
  version,
} = React;

/** Set by the server render (src/seo/render-app.jsx) around the app; null in the browser. */
export const SsrEffectsContext = React.createContext(null);

// { data, initial } — see snapshot() in src/seo/server-effects.js.
let hydrationState = (typeof window !== 'undefined' && window.__SSR_STATE__) || null;
if (typeof window !== 'undefined') delete window.__SSR_STATE__;
const has = (map, id) => Boolean(map) && Object.hasOwn(map, id);
const sameJson = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};
/**
 * → { value, correction? }: a state starts from the value the server rendered, so the markup
 * matches. One no effect had changed there, but which the browser computes differently (a module
 * cache the server had filled, localStorage, Math.random…), gets the browser's own value right
 * after hydration (`correction`).
 */
const hydrated = (id, own) => {
  if (has(hydrationState?.data, id)) return { value: hydrationState.data[id] };
  if (!has(hydrationState?.initial, id)) return { value: own() };
  const server = hydrationState.initial[id];
  const mine = own();
  return sameJson(server, mine) ? { value: mine } : { value: server, correction: mine };
};

// Right after hydration the effects run again in the browser, and an effect's `setLoading(true)`
// would be rendered before the response it awaits has landed: the page would flash its loading
// state. Until those responses are in — replayed ones at once, a signed-in visitor's from the
// network (src/seo/fetch-hook.js), 3 s at most — the app's state updates wait, then are applied
// together: the page goes straight from what the server rendered to the browser's own data. The
// visitor's first click, key press, scroll or touch applies them at once.
const NETWORK_WAIT_MS = 3000;
let held = hydrationState ? [] : null;
const release = () => {
  const queue = held;
  held = null;
  queue?.forEach((apply) => apply());
};
const hold = (apply) => (held ? held.push(apply) : apply());
if (held) {
  // In case the page never reports hydrated (src/App.jsx calls markHydrated): end it all anyway.
  setTimeout(() => {
    endHydration();
    release();
  }, NETWORK_WAIT_MS + 5000);
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(type, release, { capture: true, once: true, passive: true });
  }
}

// A server-rendered page is hydrating until the effects of its first commit have run. src/App.jsx
// reports it (markHydrated in src/seo/ssr.js); so does the first effect of the app's own
// components, a task later — the same moment — should App.jsx ever lose that line.
let hydrating = typeof window !== 'undefined' && Boolean(window.__staticRouterHydrationData);
/** True in the browser while a server-rendered page hydrates. */
export const isHydrating = () => hydrating;
/** The page has hydrated: states created from now on start from their own initial value. */
export const endHydration = () => {
  if (!hydrating) return;
  hydrating = false;
  hydrationState = null;
  endFetchReplay();
  if (held) setTimeout(() => networkSettled(NETWORK_WAIT_MS).then(release), 0);
};
let endScheduled = false;
const endAfterThisCommit = () => {
  if (hydrating && !endScheduled) {
    endScheduled = true;
    setTimeout(endHydration, 0);
  }
};

const initialOf = (initial) => (typeof initial === 'function' ? initial() : initial);
const NO_CORRECTION = Symbol('no correction');

// → [id, ssr]: every hook below branches on `ssr` (SsrEffectsContext), which is fixed for the
// whole process (server / browser), so the order of hooks never changes between two renders.
// Each hook calls `ssr.*` itself: server-effects.js tells hooks apart by the line that called it.
const useServerRun = () => [React.useId(), React.useContext(SsrEffectsContext)];

export function useState(initial) {
  const [id, ssr] = useServerRun();
  if (ssr) return ssr.state(id, () => initialOf(initial));
  let correction = NO_CORRECTION;
  const [value, set] = React.useState(() => {
    const start = hydrated(id, () => initialOf(initial));
    if ('correction' in start) correction = start.correction;
    return start.value;
  });
  const setValue = React.useMemo(() => (next) => hold(() => set(next)), [set]);
  // Queued now, so the effects' own updates (queued after the render) come after it.
  if (correction !== NO_CORRECTION) hold(() => set(() => correction));
  return [value, setValue];
}

export function useReducer(reducer, initialArg, init) {
  const [id, ssr] = useServerRun();
  const initial = () => (init ? init(initialArg) : initialArg);
  if (ssr) return ssr.reducer(id, reducer, initial);
  const [value, dispatch] = React.useReducer(reducer, undefined, () => hydrated(id, initial).value);
  const send = React.useMemo(() => (action) => hold(() => dispatch(action)), [dispatch]);
  return [value, send];
}

export function useRef(initial) {
  const [id, ssr] = useServerRun();
  if (ssr) return ssr.ref(id, initial);
  return React.useRef(initial);
}

export function useMemo(create, deps) {
  const [id, ssr] = useServerRun();
  if (ssr) return ssr.memo(id, create, deps);
  return React.useMemo(create, deps);
}

export function useCallback(callback, deps) {
  const [id, ssr] = useServerRun();
  if (ssr) return ssr.memo(id, () => callback, deps);
  return React.useCallback(callback, deps);
}

export function useEffect(effect, deps) {
  const [id, ssr] = useServerRun();
  if (ssr) return ssr.effect(id, effect, deps);
  return React.useEffect(
    hydrating
      ? () => {
          endAfterThisCommit();
          return effect();
        }
      : effect,
    deps,
  );
}

export function useLayoutEffect(effect, deps) {
  const [id, ssr] = useServerRun();
  if (ssr) return ssr.effect(id, effect, deps);
  return React.useLayoutEffect(effect, deps);
}

// `import React from 'react'` → React.useState etc. are the hooks above too.
export default { ...React, useState, useReducer, useRef, useMemo, useCallback, useEffect, useLayoutEffect };
