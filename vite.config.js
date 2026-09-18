import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "path";
import { babelTransformPlugin } from './vite-plugins/babel-transform-plugin.js';
import { visualEditPlugin } from './vite-plugins/visual-edit-plugin.js';
import { errorOverlayPlugin } from './vite-plugins/error-overlay-plugin.js'
import { postMessageInject } from "./vite-plugins/postmessage-inject.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = env.VITE_APP_ENV === 'production';

  return {
    // Unset → node_modules/.vite. The pod sets it to keep the dep cache off the
    // node_modules it shares with the next pod during a rollout.
    cacheDir: process.env.VITE_CACHE_DIR || undefined,
    plugins: [
      react(),
      ...(!isProduction
        ? [
          babelTransformPlugin(),
          visualEditPlugin(),
          errorOverlayPlugin(),
          postMessageInject(),
          {
            name: 'iframe-hmr',
            configureServer(server) {
              server.middlewares.use((req, res, next) => {
                // Allow iframe embedding
                res.setHeader('X-Frame-Options', 'ALLOWALL');
                res.setHeader('Content-Security-Policy', "frame-ancestors * https://localhost capacitor: app: file:;");
                next();
              });
            }
          },
        ]
        : []),
    ].filter(Boolean),
    build: {
      sourcemap: false,
    },
    server: {
      port: 5173,
      allowedHosts: true,
      watch: {
        usePolling: true,
        interval: 1000,
        binaryInterval: 2000,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/.idea/**",
          "**/.vscode/**",
          "**/*.log",
          "**/.DS_Store",
          "**/assets/**",
          "**/vite-plugins/**",
          "**/public/**",
          "**/*.md",
          "**/coverage/**",
          "**/.husky/**",
        ],
        awaitWriteFinish: {
          stabilityThreshold: 800,
          pollInterval: 1000
        }
      },
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ['react', 'react-dom']
    },
    optimizeDeps: {
      // Every dependency up front, so Vite never re-optimizes mid-session.
      // Refreshed on each pod start by ensure-optimize-deps.mjs.
      include: [
        '@hello-pangea/dnd',
        '@hookform/resolvers',
        '@radix-ui/react-accordion',
        '@radix-ui/react-alert-dialog',
        '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-avatar',
        '@radix-ui/react-checkbox',
        '@radix-ui/react-collapsible',
        '@radix-ui/react-context-menu',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-hover-card',
        '@radix-ui/react-label',
        '@radix-ui/react-menubar',
        '@radix-ui/react-navigation-menu',
        '@radix-ui/react-popover',
        '@radix-ui/react-progress',
        '@radix-ui/react-radio-group',
        '@radix-ui/react-scroll-area',
        '@radix-ui/react-select',
        '@radix-ui/react-separator',
        '@radix-ui/react-slider',
        '@radix-ui/react-slot',
        '@radix-ui/react-switch',
        '@radix-ui/react-tabs',
        '@radix-ui/react-toast',
        '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group',
        '@radix-ui/react-tooltip',
        '@tanstack/react-query',
        '@vibexnpm/talkflow',
        'add',
        'browserslist-config-baseline',
        'canvas-confetti',
        'class-variance-authority',
        'clsx',
        'cmdk',
        'date-fns',
        'embla-carousel-react',
        'framer-motion',
        'html2canvas',
        'html5-qrcode',
        'input-otp',
        'jspdf',
        'jszip',
        'leaflet',
        'lodash',
        'lucide-react',
        'moment',
        'next-themes',
        'qrcode.react',
        'react',
        'react-day-picker',
        'react-dom',
        'react-hook-form',
        'react-hot-toast',
        'react-leaflet',
        'react-markdown',
        'react-quill',
        'react-resizable-panels',
        'react-router-dom',
        'recharts',
        'sonner',
        'swiper',
        'tailwind-merge',
        'tailwindcss-animate',
        'three',
        'v',
        'vaul',
        'zod',
        'zustand',
        'react-dom/client',
      ],
      holdUntilCrawlEnd: true,
    }
  };
});
