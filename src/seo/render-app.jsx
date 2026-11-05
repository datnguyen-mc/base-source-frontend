import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, isRouteErrorResponse, matchRoutes, StaticRouterProvider } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { AppProviders, routes } from '@/App';
import { SsrEffectsContext } from '@/seo/hooks';
import { basenameOf } from '@/seo/i18n';
import { purifyCallsWithoutDom, serverDomLoaded } from '@/seo/server-dom';
import { createEffectsRun } from '@/seo/server-effects';
// Renders the real React app for one URL: page loaders run first, then the same component tree
// the browser shows — with the data its effects load (src/seo/server-effects.js): the page is
// rendered, the requests its effects made are awaited, and it is rendered again until nothing
// changes. The browser hydrates that markup from the same loader data and states instead of
// starting from a loading screen.
// One per language prefix (src/seo/i18n.js): /kr/shop is the app's /shop under the basename /kr,
// as in the browser. A single-language site has just the one, without a basename.
const handlers = new Map();
const handlerFor = (href) => {
  const basename = basenameOf(new URL(href).pathname);
  if (!handlers.has(basename)) handlers.set(basename, createStaticHandler(routes, { basename }));
  return handlers.get(basename);
};
/**
 * The route of the app (src/App.jsx) a path renders: { pattern: '/:lang/products/:id', params },
 * or null for none — its 404 route ('*'). The index route's pattern is '/'.
 */
export const pagePattern = (pathname) => {
  const matches = matchRoutes(routes, pathname);
  const leaf = matches?.at(-1);
  if (!leaf || leaf.route.path === '*') return null;
  const pattern = `/${matches.map((match) => match.route.path).filter(Boolean).join('/')}`.replace(/\/{2,}/g, '/');
  return { pattern, params: leaf.params };
};
// Time the effects of one page get to load their data (ms), and render passes at most.
const EFFECTS_TIMEOUT = Number(process.env.SSR_EFFECTS_TIMEOUT ?? 3000);
const MAX_PASSES = 8;
// Renders, and time (ms), spent at most per page finding the states a pass breaks on (see
// pinCulprit) — only a page that breaks spends any.
const MAX_PROBES = 32;
const MAX_PROBE_MS = 1000;
// The same error: its message and the frame it was thrown from (whatever was thrown: null, a string…).
const sameError = (err) => {
  try {
    return `${typeof err}\n${err?.message ?? String(err)}\n${String(err?.stack).split('\n').find((line) => /^\s*at /.test(line))}`;
  } catch {
    return 'unreadable';
  }
};

// The server log says once, per place in the code, what a page could not render.
const reported = new Set();
const warnOnce = (key, message) => {
  if (reported.has(key)) return;
  if (reported.size > 200) reported.clear();
  reported.add(key);
  console.warn(message);
};
// The app's file a stack points to first — no line: it would be the compiled module's, not the source's.
const inSrc = (text) => (String(text || '').match(/\/src\/[^\s):]+/) || [''])[0].slice(1);
const thrown = (err) => {
  try {
    return `"${err?.message || String(err)}"${inSrc(err?.stack) ? ` (in ${inSrc(err.stack)})` : ''}`;
  } catch {
    return 'an error';
  }
};
// `at NotifyHost (/app/src/components/NotifyHost.jsx:37:31)` → `NotifyHost (src/components/NotifyHost.jsx)`
const stateName = (entry) => {
  const component = String(entry.site).match(/^at\s+([\w$.]+)\s+\(/)?.[1];
  const file = inSrc(entry.site);
  return [component, file && `(${file})`].filter(Boolean).join(' ') || 'a component';
};
// A value as short as the log needs it: false, "draft", [3 items], {…}.
const preview = (value) => {
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  if (value && typeof value === 'object') return '{…}';
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > 24 ? `${text.slice(0, 23)}…` : text;
};

// Errors are not JSON: tag them the way the browser router expects to read them back.
const serializeErrors = (errors) =>
  errors &&
  Object.fromEntries(
    Object.entries(errors).map(([routeId, err]) => [
      routeId,
      isRouteErrorResponse(err)
        ? { ...err, __type: 'RouteErrorResponse' }
        : err instanceof Error
          ? { message: err.message, __type: 'Error' }
          : err,
    ]),
  );
const json = (value) => `JSON.parse(${JSON.stringify(JSON.stringify(value)).replace(/</g, '\\u003c')})`;
// Read before the app starts: window.__staticRouterHydrationData by createBrowserRouter,
// __SSR_STATE__ by src/seo/hooks.js, __SSR_FETCH__ by src/seo/fetch-hook.js. Rendered outside
// #root, not by StaticRouterProvider: its <script> would sit among the app's own siblings
// (Toaster…) and throw hydration off.
const hydrationScript = (context, state, responses) => {
  const data = { loaderData: context.loaderData, actionData: context.actionData, errors: serializeErrors(context.errors) };
  const lines = [`window.__staticRouterHydrationData = ${json(data)};`];
  if (Object.keys(state.data).length || Object.keys(state.initial).length) {
    lines.push(`window.__SSR_STATE__ = ${json(state)};`);
  }
  if (responses.length) lines.push(`window.__SSR_FETCH__ = ${json(responses)};`);
  return `<script>${lines.join('\n')}</script>`;
};

/**
 * → { html, script, status, timings } or, when a loader redirects, { redirect, status }.
 * timings in ms: { data, effects, render } — page loaders, the data the effects loaded, then
 * renderToString (all passes).
 */
export async function renderApp(href) {
  const purifyCallsBefore = purifyCallsWithoutDom();
  const started = performance.now();
  const handler = handlerFor(href);
  const context = await handler.query(new Request(href));
  const loaded = performance.now();
  if (context instanceof Response) {
    return { redirect: context.headers.get('Location'), status: context.status };
  }
  // The app's own 404 route ('*' in src/App.jsx): a page that does not exist is a 404, not a 200.
  const status = context.statusCode === 200 && context.matches.at(-1)?.route.path === '*' ? 404 : context.statusCode;
  const router = createStaticRouter(handler.dataRoutes, context);
  // A fresh query cache per request: nothing cached for one visitor leaks to the next.
  const queryClient = new QueryClient();
  const run = createEffectsRun({ timeout: EFFECTS_TIMEOUT, href });
  const app = (
    <SsrEffectsContext.Provider value={run.context}>
      <AppProviders queryClient={queryClient}>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </AppProviders>
    </SsrEffectsContext.Provider>
  );
  let page = null;
  let renderMs = 0;
  let passes = 0; // passes rendered so far — rendered again once a state is pinned, still the one
  let probes = 0;
  let probeMs = 0;
  let failure = null; // what the last pass that broke threw
  // The server-effects.js that comes with this file can pin a state; an older one (the two files
  // not updated together) cannot: a pass that breaks then keeps the last one that rendered, as before.
  const canPin = ['passed', 'suspects', 'revert', 'pin'].every((name) => typeof run[name] === 'function');
  // false when the pass threw: a later pass breaking (e.g. content that reads `window` once its
  // data is in) keeps the last one that rendered. The first one failing is the page failing.
  const renderPass = (final) => {
    run.beginPass(final);
    const passStarted = performance.now();
    try {
      page = { html: renderToString(app), state: run.snapshot() };
      if (canPin) run.passed();
      return true;
    } catch (err) {
      if (!page) throw err;
      failure = err;
      return false;
    } finally {
      renderMs += performance.now() - passStarted;
    }
  };
  const probesLeft = () => probes < MAX_PROBES && probeMs < MAX_PROBE_MS;
  // The page rendered with `entries` back at the value they last rendered with, no effect run:
  // → { err } with what it threw (even `throw null`), null when it rendered. Nothing is kept from it.
  const tryWithout = (entries) => {
    probes += 1;
    const restore = run.revert(entries);
    run.beginPass(true);
    const probeStarted = performance.now();
    try {
      renderToString(app);
      return null;
    } catch (err) {
      return { err };
    } finally {
      restore();
      const spent = performance.now() - probeStarted;
      probeMs += spent;
      renderMs += spent;
    }
  };
  // A pass threw once the data was in — typically a "mounted" flag an effect set, which now renders
  // a portal or reads `document`. Rather than losing every state changed since the last pass that
  // rendered, find the one behind that error and pin it (server-effects.js): the browser sets it.
  // The changed states are tried newest first — a component's own flag before the page data it is
  // rendered from (setting the data back would make the error go away too, with the content): the
  // shortest run of them that, set back, makes that error go away (a binary search) ends with it.
  // The error is the one the page throws with its states as they are now: the pass that broke ran
  // effects too, which may have changed some since. → { err, pinned: [{ name, change, count }] } —
  // pinned is empty when the page renders as it is now (the pass is just rendered again); null when
  // there is nothing to pin: the error comes from no changed state, or the probes ran out.
  const pinCulprit = () => {
    if (!probesLeft()) return null;
    const now = tryWithout([]);
    if (!now) return { err: null, pinned: [] };
    const { err } = now;
    const gone = (entries) => {
      const left = tryWithout(entries);
      return !left || sameError(left.err) !== sameError(err);
    };
    const suspects = run.suspects().reverse();
    if (!suspects.length || !probesLeft() || !gone(suspects)) return null;
    let lo = 1; // setting back the first lo - 1 suspects leaves the error…
    let hi = suspects.length; // …setting back the first hi makes it go away
    while (lo < hi && probesLeft()) {
      const mid = (lo + hi) >> 1;
      if (gone(suspects.slice(0, mid))) hi = mid;
      else lo = mid + 1;
    }
    const found = suspects.slice(lo - 1, hi); // one, unless the probes ran out
    // The same state of the component's other instances (a list of cards…), changed the same way.
    const sameState = (a, b) => a === b || (a.site === b.site && Object.is(a.good, b.good) && Object.is(a.value, b.value));
    const pinned = found.map((entry) => ({
      name: stateName(entry),
      change: `${preview(entry.good)} → ${preview(entry.value)}`,
      count: suspects.filter((other) => sameState(entry, other)).length,
    }));
    suspects.filter((entry) => found.some((culprit) => sameState(culprit, entry))).forEach(run.pin);
    return { err, pinned };
  };
  const path = new URL(href).pathname;
  // Finding the state never costs the page: should anything go wrong there, the last pass that
  // rendered is sent, as before.
  const recover = () => {
    if (!canPin) return null;
    try {
      return pinCulprit();
    } catch (err) {
      warnOnce(`recover ${sameError(err)}`, `[ssr] ${path}: finding the state a render pass broke on threw ${thrown(err)} — the last pass that rendered is sent.`);
      return null;
    }
  };
  try {
    for (;;) {
      const final = passes + 1 >= MAX_PASSES || run.expired();
      passes += 1;
      let rendered = renderPass(final);
      // One error at a time: the state behind it is pinned, then the pass rendered again.
      for (let found; !rendered && (found = recover()); rendered = renderPass(final)) {
        if (!found.pinned.length) continue;
        const states = found.pinned
          .map(({ name, change, count }) => `a state in ${name}${count > 1 ? ` (${count} instances)` : ''} an effect set (${change})`)
          .join(', ');
        warnOnce(
          `${found.pinned.map(({ name }) => name).join()} ${sameError(found.err)}`,
          `[ssr] ${path}: ${states} throws ${thrown(found.err)} — left to the browser; the rest of the page is server-rendered.`,
        );
      }
      if (!rendered) {
        warnOnce(`pass ${sameError(failure)}`, `[ssr] ${path}: a render pass threw ${thrown(failure)} once its data was in — the last pass that rendered is sent.`);
        break;
      }
      if (final) break;
      await run.settle();
      if (!run.changed()) break;
    }
    // DOMPurify was used before jsdom was in (the first page that sanitizes): once more with it.
    if (purifyCallsWithoutDom() !== purifyCallsBefore) {
      await serverDomLoaded();
      renderPass(true);
    }
    // A state hydration could not start from would make the browser render something else.
    if (run.forgetUnshippable()) renderPass(true);
  } finally {
    run.close();
  }
  const timings = {
    data: Math.round(loaded - started),
    effects: Math.round(performance.now() - loaded - renderMs),
    render: Math.round(renderMs),
  };
  return { html: page.html, script: hydrationScript(context, page.state, run.responses()), status, timings };
}
