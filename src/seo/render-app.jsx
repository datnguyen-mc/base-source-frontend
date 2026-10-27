import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, isRouteErrorResponse, StaticRouterProvider } from 'react-router-dom';
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
// Time the effects of one page get to load their data (ms), and render passes at most.
const EFFECTS_TIMEOUT = Number(process.env.SSR_EFFECTS_TIMEOUT ?? 3000);
const MAX_PASSES = 8;

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
  let passes = 0; // passes rendered so far
  // false when the pass threw: a later pass breaking (e.g. content that reads `window` once its
  // data is in) keeps the last one that rendered. The first one failing is the page failing.
  const renderPass = (final) => {
    passes = run.beginPass(final);
    const passStarted = performance.now();
    try {
      page = { html: renderToString(app), state: run.snapshot() };
      return true;
    } catch (err) {
      if (!page) throw err;
      return false;
    } finally {
      renderMs += performance.now() - passStarted;
    }
  };
  try {
    for (;;) {
      const final = passes + 1 >= MAX_PASSES || run.expired();
      if (!renderPass(final) || final) break;
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
  return { html: page.html, script: hydrationScript(context, page.state, run.responses()), status: context.statusCode, timings };
}
