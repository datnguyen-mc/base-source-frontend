import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";
import { visualEditPlugin } from './vite-plugins/visual-edit-plugin.js'
import { errorOverlayPlugin } from './vite-plugins/error-overlay-plugin.js'

export default defineConfig({
  plugins: [react()],
  plugins: [
    visualEditPlugin(),
    react(),
    errorOverlayPlugin(),
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
    rollupOptions: {
      onwarn(warning, warn) {
        // Treat import errors as fatal errors
        if (
          warning.code === "UNRESOLVED_IMPORT" ||
          warning.code === "MISSING_EXPORT"
        ) {
          throw new Error(`Build failed: ${warning.message}`);
        }
        // Use default for other warnings
        warn(warning);
      },
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true,
      interval: 100,
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
