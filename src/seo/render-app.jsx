import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, isRouteErrorResponse, StaticRouterProvider } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { AppProviders, routes } from '@/App';
// Renders the real React app for one URL: page loaders run first, then the same component tree
// the browser shows. The browser hydrates that markup from the same loader data instead of
// fetching it again.
const handler = createStaticHandler(routes);

// DOMPurify needs a DOM to sanitize HTML, which Node has not: give it jsdom's (the setup DOMPurify
// documents for Node) on the very instance the app imports, so components that sanitize while
// rendering work on the server unchanged. Done once.
let serverDomReady;
const prepareServerDom = () =>
  (serverDomReady ??= (async () => {
    const purify = (await import('dompurify').catch(() => null))?.default;
    if (purify && !purify.isSupported) {
      const { JSDOM } = await import('jsdom');
      Object.assign(purify, purify(new JSDOM('').window));
    }
  })());

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
// window.__staticRouterHydrationData — read by createBrowserRouter. Rendered outside #root, not by
// StaticRouterProvider: its <script> would sit among the app's own siblings (Toaster…) and
// throw hydration off.
const hydrationScript = (context) => {
  const data = { loaderData: context.loaderData, actionData: context.actionData, errors: serializeErrors(context.errors) };
  return `<script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(JSON.stringify(data)).replace(/</g, '\\u003c')});</script>`;
};

/**
 * → { html, script, status, timings } or, when a loader redirects, { redirect, status }.
 * timings: { data, render } in ms — page loaders, then renderToString.
 */
export async function renderApp(href) {
  await prepareServerDom();
  const started = performance.now();
  const context = await handler.query(new Request(href));
  const loaded = performance.now();
  if (context instanceof Response) {
    return { redirect: context.headers.get('Location'), status: context.status };
  }
  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(
    // A fresh query cache per request: nothing cached for one visitor leaks to the next.
    <AppProviders queryClient={new QueryClient()}>
      <StaticRouterProvider router={router} context={context} hydrate={false} />
    </AppProviders>,
  );
  const timings = { data: Math.round(loaded - started), render: Math.round(performance.now() - loaded) };
  return { html, script: hydrationScript(context), status: context.statusCode, timings };
}
