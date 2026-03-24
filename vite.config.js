import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "path";
import { babelTransformPlugin, visualEditPlugin, postMessageInject, errorOverlayPlugin } from '@devvibex/plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProduction = env.VITE_APP_ENV === 'production';

  return {
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
                res.setHeader('Content-Security-Policy', "frame-ancestors *;");
                next();
              });
            }
          },
        ]
        : []),
    ].filter(Boolean),
    build: {
      minify: 'esbuild',
      sourcemap: false,
    },
    server: {
      port: 5173,
      allowedHosts: true,
      watch: {
        usePolling: true,
        interval: 1000,
        binaryInterval: 3000,
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
          pollInterval: 200
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
  };
});
