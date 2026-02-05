import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import 'leaflet/dist/leaflet.css';
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)


if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}


// Logic gửi message an toàn và mượt mà

  if (import.meta.hot) {
    let debounceTimer;

    const sendToParent = (type, message, delay = 0) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        window.parent.postMessage({ type, message }, '*');
      }, delay);
    };

    // 1. Khi AI đang sửa file (nhận từ Plugin)
    import.meta.hot.on('vite-fs-syncing', (data) => {
      sendToParent('sourcex_syncing', data.message, 0);
    });

    // 2. Khi Vite bắt đầu quá trình Compile (HMR)
    import.meta.hot.on('vite:beforeUpdate', () => {
      sendToParent('sourcex_building', 'Vite is recompiling...', 0);
    });

    // 3. Khi mọi thứ đã build xong
    import.meta.hot.on('vite:afterUpdate', () => {
      sendToParent('sourcex_ready', 'App A is stable', 1000);
    });

    // 4. Khi có lỗi code (AI viết sai cú pháp)
    import.meta.hot.on('vite:error', (err) => {
      sendToParent('sourcex_error', err?.err?.message || 'Compile Error', 0);
    });
  }

  // Bắt sự kiện load trang/reload trang
  window.addEventListener('load', () => {
    window.parent.postMessage({ type: 'sourcex_ready', message: 'App A Loaded' }, '*');
  });

  window.addEventListener('beforeunload', () => {
    window.parent.postMessage({ type: 'sourcex_building', message: 'Reloading...' }, '*');
  });

  window.addEventListener('error', (e) => {
    window.parent.postMessage({ type: 'sourcex_error', message: e.message }, '*');
  });

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'sourcex_ping') {
      window.parent.postMessage({ type: 'sourcex_pong' }, '*');
    }
  });

