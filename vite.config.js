import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path'

export default defineConfig({
    plugins: [
        react(),
    ],
    resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        allowedHosts: true,
        hmr: {
           overlay: false,
        },
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        },
        watch: {
            usePolling: true,
            interval: 200,
        },
    },
});
