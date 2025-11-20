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

                window.addEventListener("error", function (e) {
                  const stack = e?.error?.stack;
                  const shortPath = extractPathWithLine(stack);

                  const title = shortPath
                    ? \`Error in \${shortPath}:\`
                    : e.message;

                  onAppError({
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

                  onAppError({
                    title,
                    details: e.reason?.toString(),
                    componentName: shortPath,
                  });
                });

                const originalConsoleError = console.error;
                console.error = function (...args) {
                  const msg = args.join(" ");

                  if (msg.includes("does not provide an export named")) {
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

                        // --- Catch Vite import errors ---
                        if (data.type === "error" && data.err) {
                          const msg = data.err.msg || "Unknown HMR Error";

                          onAppError({
                            title: "HMR Import Error",
                            details: msg,
                            componentName: data.err.id || "hmr",
                          });
                        }

                        // --- Catch full reload triggers ---
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
