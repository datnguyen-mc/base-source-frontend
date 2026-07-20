export function postMessageInject() {
  return {
    name: "postmessage-inject",
    apply: "serve",

    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "script",
            injectTo: "head-prepend",
            children: `
              (function () {
                console.log("[Inject] iframe error hook loaded");

                // =============== HMR QUIET WINDOW ===============
                // While Vite is hot-updating / reloading, the module graph is
                // momentarily inconsistent and React re-mounts the tree. The
                // transient errors thrown in that window (null-hook reads, half-
                // applied modules) are NOT real app bugs — they self-resolve once
                // the update settles. We expose a shared deadline that BOTH this
                // injected hook and src/lib/iframe-messaging.js honour so neither
                // reports an error to the parent (which would trigger auto-fix).
                var HMR_QUIET_MS = 2500;
                function markHmrQuiet() {
                  window.__VIBEX_HMR_QUIET_UNTIL__ = Date.now() + HMR_QUIET_MS;
                }
                function isHmrQuiet() {
                  return Date.now() < (window.__VIBEX_HMR_QUIET_UNTIL__ || 0);
                }

                // Transient React hook errors during HMR / module-init race —
                // identical list to src/lib/iframe-messaging.js. Always suppressed.
                var SUPPRESSED_PATTERNS = [
                  "Cannot read properties of null (reading 'useState')",
                  "Cannot read properties of null (reading 'useEffect')",
                  "Cannot read properties of null (reading 'useRef')",
                  "Cannot read properties of null (reading 'useContext')",
                  "Cannot read properties of null (reading 'useMemo')",
                  "Cannot read properties of null (reading 'useCallback')",
                  "Cannot read properties of null (reading 'useReducer')",
                ];
                function isSuppressed(msg) {
                  if (!msg) return false;
                  return SUPPRESSED_PATTERNS.some(function (p) {
                    return msg.indexOf(p) !== -1;
                  });
                }

                // =============== UTIL ===============
                function extractPathWithLine(stack) {
                  if (!stack) return null;
                  const match = stack.match(/\\/src\\/[^\\s):]+:(\\d+)/);
                  return match ? match[0] : null;
                }

                function onAppError({ title, details, componentName }) {
                  window.parent?.postMessage(
                    {
                      type: "app_error",
                      error: {
                        title: title?.toString(),
                        details: details?.toString(),
                        componentName: componentName?.toString(),
                      },
                    },
                    "*"
                  );
                }

                // Runtime errors (window error / unhandled rejection) are the ones
                // that wrongly fired auto-fix during hot reload. Gate them behind
                // the suppression list + HMR quiet window before forwarding.
                function onRuntimeError(payload) {
                  var msg = (payload && (payload.details || payload.title)) || "";
                  if (isSuppressed(msg)) return;
                  if (isHmrQuiet()) return;
                  onAppError(payload);
                }

                window.addEventListener("error", function (e) {
                  const stack = e?.error?.stack;
                  const shortPath = extractPathWithLine(stack);

                  const title = shortPath
                    ? \`Error in \${shortPath}:\`
                    : e.message;

                  onRuntimeError({
                    title,
                    details: e.error?.toString(),
                    componentName: shortPath,
                  });
                }, true);

                window.addEventListener("unhandledrejection", function (e) {
                  const stack = e.reason?.stack;
                  const shortPath = extractPathWithLine(stack);

                  const title = shortPath
                    ? \`Unhandled Error in \${shortPath}\`
                    : e.reason?.toString();

                  onRuntimeError({
                    title,
                    details: e.reason?.toString(),
                    componentName: shortPath,
                  });
                });

                const originalConsoleError = console.error;
                console.error = function (...args) {
                  const msg = args.join(" ");

                  // Static import errors surface transiently mid-HMR too — gate them.
                  if (msg.includes("does not provide an export named") && !isHmrQuiet()) {
                    onAppError({
                      title: "Static Import Error",
                      details: msg,
                      componentName: null,
                    });
                  }

                  originalConsoleError.apply(console, args);
                };

                (function interceptHMR() {
                  const OriginalWS = window.WebSocket;

                  window.WebSocket = function (url, protocols) {
                    const ws = protocols
                      ? new OriginalWS(url, protocols)
                      : new OriginalWS(url);

                    ws.addEventListener("message", (ev) => {
                      try {
                        const data = JSON.parse(ev.data);

                        // Any HMR update / reload opens the quiet window so the
                        // re-render that follows doesn't report transient errors.
                        if (
                          data.type === "update" ||
                          data.type === "full-reload" ||
                          data.type === "prune"
                        ) {
                          markHmrQuiet();
                        }

                        // --- Catch Vite import errors ---
                        // Real compile error: surface it for the crash overlay,
                        // but NOT during the quiet window (mid-update transient).
                        if (data.type === "error" && data.err && !isHmrQuiet()) {
                          const msg = data.err.msg || "Unknown HMR Error";

                          onAppError({
                            title: "HMR Import Error",
                            details: msg,
                            componentName: data.err.id || "hmr",
                          });
                        }

                        // --- Catch full reload triggers ---
                        // Forwarded for the overlay only; the studio listener
                        // drops "HMR Full Reload" so it never triggers auto-fix.
                        if (data.type === "full-reload") {
                          onAppError({
                            title: "HMR Full Reload",
                            details: "Vite triggered a full reload (module failed)",
                            componentName: data.path || "hmr",
                          });
                        }

                      } catch (err) {
                        // ignore parsing failures
                      }
                    });

                    return ws;
                  };
                })();

              })();
            `,
          },
        ],
      };
    },
  };
}
