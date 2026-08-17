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

                // =============== RETRY-BEFORE-REPORT (STALE MODULE GRAPH) ======
                // The project source lives on an NFS volume, so the dev server
                // watches it by POLLING (usePolling, interval 1000ms +
                // awaitWriteFinish 800ms). When the backend writes a generation's
                // files, Vite notices them file-by-file over one or more polling
                // passes — it can hot-update an IMPORTER before it has noticed the
                // module it imports from, and then serves the OLD cached transform
                // of that dependency. The browser throws:
                //
                //   SyntaxError: The requested module '/src/x.jsx?t=…' does not
                //                provide an export named 'Y'
                //
                // Nothing is wrong with the code — the file on disk is already
                // correct, only Vite's view of it is stale, and it self-corrects a
                // second later. Reporting this to the studio triggered a pointless
                // auto-fix (and the LLM kept replying that the code is fine).
                //
                // So for this class of error: wait, reload the page (that is the
                // only real recovery once a module failed to link), and only report
                // it after RETRY_MAX failed attempts. The attempt streak lives in
                // sessionStorage because each attempt is a page reload. It is a
                // plain counter — NOT keyed by message — so alternating messages
                // can never reset it into a reload loop.
                var IMPORT_RETRY_DELAY_MS = 3000;
                var IMPORT_RETRY_MAX = 3;
                var IMPORT_RETRY_KEY = "__vibex_import_retry__";
                var IMPORT_RETRY_TTL_MS = 60000;

                var RETRYABLE_IMPORT_PATTERNS = [
                  // Chrome / Firefox / Safari wordings of the same failure
                  "does not provide an export named",
                  "doesn't provide an export named",
                  "failed to fetch dynamically imported module",
                  "error loading dynamically imported module",
                  "importing a module script failed",
                  "failed to resolve import",
                  "failed to reload",
                ];

                function isRetryableImportError(msg) {
                  if (!msg) return false;
                  var lower = String(msg).toLowerCase();
                  if (
                    lower.indexOf("importing binding name") !== -1 &&
                    lower.indexOf("is not found") !== -1
                  ) {
                    return true; // Safari
                  }
                  return RETRYABLE_IMPORT_PATTERNS.some(function (p) {
                    return lower.indexOf(p) !== -1;
                  });
                }

                function readRetryState() {
                  try {
                    var raw = sessionStorage.getItem(IMPORT_RETRY_KEY);
                    if (!raw) return null;
                    var parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed.n !== "number") return null;
                    if (Date.now() - (parsed.ts || 0) > IMPORT_RETRY_TTL_MS) return null;
                    return parsed;
                  } catch (e) {
                    return null;
                  }
                }

                function writeRetryState(n, key) {
                  try {
                    sessionStorage.setItem(
                      IMPORT_RETRY_KEY,
                      JSON.stringify({ n: n, ts: Date.now(), k: key || "" })
                    );
                  } catch (e) { /* private mode */ }
                }

                function clearRetryState() {
                  try {
                    sessionStorage.removeItem(IMPORT_RETRY_KEY);
                  } catch (e) { /* private mode */ }
                }

                // "retry"     → swallowed, a reload is scheduled
                // "exhausted" → retried IMPORT_RETRY_MAX times, report it for real
                // "skip"      → not this class of error, caller keeps its behaviour
                function handleImportError(msg, payload) {
                  if (!isRetryableImportError(msg)) return "skip";

                  window.__VIBEX_LAST_IMPORT_ERROR_AT__ = Date.now();

                  // A reload is already pending in this page life — every further
                  // error is part of the same broken load.
                  if (window.__VIBEX_RELOAD_SCHEDULED__) return "retry";

                  var state = readRetryState();
                  var attempts = state ? state.n : 0;

                  if (attempts >= IMPORT_RETRY_MAX) {
                    clearRetryState();
                    return "exhausted";
                  }

                  attempts += 1;
                  writeRetryState(attempts, String(msg).slice(0, 200));

                  // Each attempt is a page reload, so the counter MUST survive it.
                  // If sessionStorage is unavailable (privacy mode / partitioned
                  // third-party storage) we would reload forever — so bail out and
                  // let the studio-side gate, whose counter lives in a page that
                  // never reloads, drive the retries instead.
                  var persisted = readRetryState();
                  if (!persisted || persisted.n !== attempts) {
                    console.warn(
                      "[Inject] cannot persist retry counter — deferring to the studio"
                    );
                    return "skip";
                  }

                  window.__VIBEX_RELOAD_SCHEDULED__ = true;

                  // Tell the studio we are self-healing so it shows the loading
                  // state instead of the crash overlay, and does not reload us too.
                  window.parent?.postMessage(
                    {
                      type: "app_error_retry",
                      attempt: attempts,
                      max: IMPORT_RETRY_MAX,
                      delay_ms: IMPORT_RETRY_DELAY_MS,
                      error: {
                        title: payload && payload.title ? String(payload.title) : "Static Import Error",
                        details: String(msg),
                        componentName: payload && payload.componentName ? String(payload.componentName) : null,
                      },
                    },
                    "*"
                  );

                  console.warn(
                    "[Inject] transient import error — reloading in " +
                      IMPORT_RETRY_DELAY_MS +
                      "ms (attempt " + attempts + "/" + IMPORT_RETRY_MAX + "): " +
                      String(msg).slice(0, 200)
                  );

                  setTimeout(function () {
                    try {
                      window.location.reload();
                    } catch (e) { /* ignore */ }
                  }, IMPORT_RETRY_DELAY_MS);

                  return "retry";
                }

                // A load that stays quiet ends the streak, so a later, unrelated
                // incident starts again from attempt 1.
                window.addEventListener("load", function () {
                  setTimeout(function () {
                    if (Date.now() - (window.__VIBEX_LAST_IMPORT_ERROR_AT__ || 0) > 4000) {
                      clearRetryState();
                    }
                  }, 5000);
                });

                // Shared with src/lib/iframe-messaging.js and the patched Vite
                // error overlay so all three report paths retry as one.
                window.__VIBEX_IMPORT_RETRY__ = {
                  version: 1,
                  isRetryable: isRetryableImportError,
                  handle: handleImportError,
                };

                // =============== UTIL ===============
                function extractPathWithLine(stack) {
                  if (!stack) return null;
                  const match = stack.match(/\\/src\\/[^\\s):]+:(\\d+)/);
                  return match ? match[0] : null;
                }

                // Turn ANY thrown/rejected value into readable text. toString()
                // on a plain object is the literal "[object Object]" — and an
                // unhandled rejection very often carries a plain object (a
                // rejected fetch/axios response, throw { code, message }, ...).
                // That produced the information-free studio report
                //   "1. [object Object] -> [object Object] -> no-component"
                // which no classifier matched and no AI could fix, while still
                // consuming one of the user's auto-fix attempts.
                function toReadableText(value) {
                  if (value === null || value === undefined) return "";
                  var t = typeof value;
                  if (t === "string") return value;
                  if (t === "number" || t === "boolean") return String(value);
                  if (t === "function" || t === "symbol") return "";
                  if (t !== "object") return String(value);

                  if (value instanceof Error ||
                      (typeof value.name === "string" && typeof value.message === "string")) {
                    return [value.name, value.message].filter(Boolean).join(": ").trim();
                  }
                  var direct = [value.message, value.statusText, value.detail,
                                value.details, value.reason, value.error];
                  for (var i = 0; i < direct.length; i++) {
                    if (typeof direct[i] === "string" && direct[i].trim()) {
                      return direct[i].trim();
                    }
                  }
                  var nested = [value.error, value.data, value.response];
                  for (var j = 0; j < nested.length; j++) {
                    var n = nested[j];
                    if (n && typeof n === "object" &&
                        typeof n.message === "string" && n.message.trim()) {
                      return n.message.trim();
                    }
                  }
                  try {
                    var seen = [];
                    var json = JSON.stringify(value, function (_k, v) {
                      if (typeof v === "function") return undefined;
                      if (typeof v === "object" && v !== null) {
                        if (seen.indexOf(v) !== -1) return "[Circular]";
                        seen.push(v);
                      }
                      return v;
                    });
                    if (json && json !== "{}" && json !== "[]" && json !== "null") {
                      return json.slice(0, 2000);
                    }
                  } catch (e) { /* unserialisable */ }
                  return "";
                }

                function onAppError({ title, details, componentName }, isFinal) {
                  window.parent?.postMessage(
                    {
                      type: "app_error",
                      error: {
                        title: toReadableText(title),
                        details: toReadableText(details),
                        componentName: toReadableText(componentName),
                        // Set once the retries above are used up: tells the studio
                        // this one is real and must not be held back again.
                        retry_exhausted: !!isFinal,
                      },
                    },
                    "*"
                  );
                }

                // Runtime errors (window error / unhandled rejection) are the ones
                // that wrongly fired auto-fix during hot reload. Gate them behind
                // the suppression list, the retry handler and the HMR quiet window
                // before forwarding.
                function onRuntimeError(payload) {
                  var msg = toReadableText(
                    payload && (payload.details || payload.title)
                  );
                  if (isSuppressed(msg)) return;

                  // Nothing readable could be recovered — not actionable by the
                  // user or the AI. Drop it; the studio-side gate reloads instead.
                  if (!msg.trim()) {
                    console.warn("[Inject] dropping error with no readable payload:", payload);
                    return;
                  }

                  // Retry FIRST: a stale-module-graph error must not be dropped by
                  // the quiet window either — dropping it left the preview broken
                  // with nothing reloading it.
                  var verdict = handleImportError(msg, payload);
                  if (verdict === "retry") return;
                  if (verdict === "exhausted") {
                    onAppError(payload, true);
                    return;
                  }

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
                    details: toReadableText(e.error) || toReadableText(e.message),
                    componentName: shortPath,
                  });
                }, true);

                window.addEventListener("unhandledrejection", function (e) {
                  const stack = e.reason?.stack;
                  const shortPath = extractPathWithLine(stack);

                  const reasonText = toReadableText(e.reason);
                  const title = shortPath
                    ? \`Unhandled Error in \${shortPath}\`
                    : reasonText;

                  onRuntimeError({
                    title,
                    details: reasonText,
                    componentName: shortPath,
                  });
                });

                const originalConsoleError = console.error;
                console.error = function (...args) {
                  const msg = args.join(" ");

                  // Static import errors surface transiently mid-HMR too — retry
                  // them and only report once the retries are exhausted.
                  if (isRetryableImportError(msg)) {
                    const payload = {
                      title: "Static Import Error",
                      details: msg,
                      componentName: null,
                    };
                    if (handleImportError(msg, payload) === "exhausted") {
                      onAppError(payload, true);
                    }
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
                          const payload = {
                            title: "HMR Import Error",
                            details: msg,
                            componentName: data.err.id || "hmr",
                          };

                          // "Failed to resolve import …" from a half-seen write is
                          // the same stale-graph race — retry before reporting.
                          const verdict = handleImportError(msg, payload);
                          if (verdict === "skip") {
                            onAppError(payload);
                          } else if (verdict === "exhausted") {
                            onAppError(payload, true);
                          }
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
