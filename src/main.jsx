import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import 'leaflet/dist/leaflet.css';
import '@/index.css'
import { setupIframeMessaging, markHmrQuiet } from '@/lib/iframe-messaging';
import { setupGoogleTranslateGuard } from '@/lib/google-translate-guard';

// Patch DOM methods before React renders (must run before render)
setupGoogleTranslateGuard();

// Install global error → postMessage handlers (must run before render)
setupIframeMessaging();

// A server-rendered page (SSR / SSG) is hydrated; otherwise the SPA renders from scratch.
const container = document.getElementById('root');
if (window.__staticRouterHydrationData) {
  ReactDOM.hydrateRoot(container, <App />, {
    // A mismatch (e.g. a widget that renders differently in the browser) is repaired by React
    // re-rendering on the client — a warning, not a crash for the error reporters to flag.
    onRecoverableError: (error) => console.warn('[ssr] hydration mismatch, re-rendered in the browser:', error),
  });
} else {
  ReactDOM.createRoot(container).render(<App />);
}
// dev:ssr links the stylesheets so the server markup is styled before JS runs (server.js);
// the imports above already injected Vite's own styles, which handle HMR from here on.
document.querySelectorAll('link[data-ssr-dev-css]').forEach((link) => link.remove());

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    // Open the quiet window FIRST so transient errors during the swap/re-render
    // are not reported to the parent (which would trigger a spurious auto-fix).
    markHmrQuiet();
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    // Extend the quiet window past the re-render that follows the update.
    markHmrQuiet();
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}

// Listen for language postMessage from parent and save to sessionStorage
window.addEventListener('message', (event) => {
  if (event.data?.type === 'set-lang') {
    try {
      sessionStorage.setItem('lang', event.data.language || 'ko');
    } catch (e) { }
  }
});
