import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import 'leaflet/dist/leaflet.css';
import '@/index.css'
import { setupIframeMessaging, markHmrQuiet } from '@/lib/iframe-messaging';

// Install global error → postMessage handlers (must run before render)
setupIframeMessaging();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

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
