import { useEffect, useRef, useState } from 'react';
// True while rendering on the server, and in the browser when the page arrived server-rendered
// (React hydrates that markup instead of starting from an empty #root).
const isServer = typeof window === 'undefined';
export const serverRendered = isServer || Boolean(window.__staticRouterHydrationData);

// True until a server-rendered page has finished hydrating (AppProviders calls markHydrated).
let hydrating = serverRendered && !isServer;
export const markHydrated = () => {
  hydrating = false;
};

/**
 * useState for a value only the browser knows (localStorage, matchMedia…). On the server, and
 * while a server-rendered page hydrates, it starts from `serverValue` — so the markup matches —
 * and reads the real value right after; components mounted later read it straight away.
 *
 *   const [view, setView] = useBrowserState(readViewMode, 'card');
 */
export function useBrowserState(read, serverValue) {
  const [deferred] = useState(() => isServer || hydrating);
  const [value, setValue] = useState(() => (deferred ? serverValue : read()));
  // Once, after mount: `read` may be a new function every render.
  const readRef = useRef(read);
  useEffect(() => {
    if (deferred) setValue(readRef.current());
  }, [deferred]);
  return [value, setValue];
}

/**
 * Wraps a page loader so it can never break or slow down a page:
 *  • it runs on the server only (the first, server-rendered response). In the browser it
 *    resolves to null at once, so client-side navigation never waits on the network — the page
 *    shows immediately and loads its data in useEffect, exactly as a plain SPA does;
 *  • on the server a failure or a slow backend (over `ms`) also resolves to null.
 *
 *   Home.loader = pageLoader(async ({ params, request }) => ({ stats: await loadStats() }));
 *   // in Home: const data = useLoaderData();  // null → fetch in useEffect as before
 */
export const pageLoader = (load, ms = 4000) => async (args) => {
  if (!isServer) return null;
  let timer;
  try {
    return await Promise.race([load(args), new Promise((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } catch (err) {
    // `throw redirect('/login')` / `throw new Response(…, { status: 404 })` are answers, not failures.
    if (err instanceof Response) throw err;
    console.error('[ssr] page loader failed:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Renders its children in the browser only — after hydration — and `fallback` on the server.
 * For widgets that need the DOM (maps, editors, charts on canvas…), so the server and the
 * browser render the same markup:
 *
 *   <ClientOnly fallback={<div className="h-64" />}><MapContainer … /></ClientOnly>
 */
export function ClientOnly({ children, fallback = null }) {
  const [mounted] = useBrowserState(() => true, false);
  return mounted ? children : fallback;
}

