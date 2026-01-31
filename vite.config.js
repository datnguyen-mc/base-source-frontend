import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";
import { babelTransformPlugin } from './vite-plugins/babel-transform-plugin.js';
import { visualEditPlugin } from './vite-plugins/visual-edit-plugin.js';
import { errorOverlayPlugin } from './vite-plugins/error-overlay-plugin.js'
import { postMessageInject } from "./vite-plugins/postmessage-inject.js";

export default defineConfig({
  plugins: [
    babelTransformPlugin(),
    visualEditPlugin(),
    react(),
    errorOverlayPlugin(),
    postMessageInject(),
    {
      name: 'iframe-hmr',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Allow iframe embedding
          res.setHeader('X-Frame-Options', 'ALLOWALL');
          res.setHeader('Content-Security-Policy', "frame-ancestors *;");
          next();
        });
      }
    }
  ].filter(Boolean),
  build: {
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    port: 5173,
    allowedHosts: true,
    // watch: {
    //   usePolling: true,
    //   interval: 500,
    //   ignored: [
    //     "**/node_modules/**",
    //     "**/.git/**",
    //     "**/dist/**",
    //     "**/build/**",
    //     "**/.idea/**",
    //     "**/.vscode/**",
    //     "**/*.log",
    //     "**/.DS_Store",
    //     "**/assets/**",
    //     "**/vite-plugins/**",
    //   ],
    //   awaitWriteFinish: {
    //     stabilityThreshold: 500,
    //     pollInterval: 100
    //   }
    // },
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
    include: ["react", "react-dom"],
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
});
