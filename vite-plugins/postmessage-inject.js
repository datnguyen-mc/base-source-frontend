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
  
                  function extractPathWithLine(stack) {
                    if (!stack) return null;
                    const match = stack.match(/\\/src\\/[^\\s):]+:(\\d+)/);
                    return match ? match[0] : null;
                  }
  
                  function onAppError({ title, details, componentName, originalError }) {
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
                      originalError: e.error,
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
                      originalError: e.reason,
                    });
                  });
  
  
                  // ===== 3) PATCH console.error (IMPORT ERROR) =====
                  const originalConsoleError = console.error;
                  console.error = function(...args) {
                    const msg = args.join(" ");
  
                    if (msg.includes("does not provide an export named")) {
                      const error = new Error(msg);
  
                      onAppError({
                        title: "Static Import Error",
                        details: msg,
                        componentName: null,
                        originalError: error,
                      });
                    }
  
                    originalConsoleError.apply(console, args);
                  };
                })();
              `,
            },
          ],
        };
      },
    };
  }
  