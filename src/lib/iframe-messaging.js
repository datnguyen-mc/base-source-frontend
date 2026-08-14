
import { isIframe } from "./coreUtils.js";

export function setupIframeMessaging() {
  if (isIframe) {
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("error", handleWindowError);

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);
  }
}

function extractPathWithLine(stack) {
  if (!stack) return null;

  const match = stack.match(/https?:\/\/[^\s)]+:(\d+):\d+/);
  if (!match) return null;

  const full = match[0];   // full URL + line + col
  const line = match[1];   // line number only

  let path = full.replace(/^https?:\/\/[^/]+\//, "");
  path = path.split("?")[0]; // remove ?t=timestamp

  return `${path}:${line}`; // final format
}

// Transient React hook errors to suppress — these occur during HMR or
// module init race conditions and self-resolve on reload.
const SUPPRESSED_PATTERNS = [
  "Cannot read properties of null (reading 'useState')",
  "Cannot read properties of null (reading 'useEffect')",
  "Cannot read properties of null (reading 'useRef')",
  "Cannot read properties of null (reading 'useContext')",
  "Cannot read properties of null (reading 'useMemo')",
  "Cannot read properties of null (reading 'useCallback')",
  "Cannot read properties of null (reading 'useReducer')",
];

function isSuppressedError(error) {
  const msg = error?.toString?.() || error?.message || '';
  return SUPPRESSED_PATTERNS.some((p) => msg.includes(p));
}

// HMR quiet window — shared with vite-plugins/postmessage-inject.js.
// During a hot update the module graph is momentarily inconsistent and the
// re-render throws transient errors that self-resolve. We must NOT report
// those to the parent, or they wrongly trigger the auto-fix flow.
const HMR_QUIET_MS = 2500;

export function markHmrQuiet() {
  try {
    window.__VIBEX_HMR_QUIET_UNTIL__ = Date.now() + HMR_QUIET_MS;
  } catch { /* empty */ }
}

function isHmrQuiet() {
  try {
    return Date.now() < (window.__VIBEX_HMR_QUIET_UNTIL__ || 0);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// TRANSIENT IMPORT ERRORS ("does not provide an export named", failed dynamic
// import, …) mean the module graph the browser holds is out of sync with the
// files on disk — the dev server watches an NFS volume by polling, so it can
// hot-update an importer before it has noticed the module it imports from.
// Nothing is wrong with the code; a reload fixes it. `vite-plugins/postmessage-
// inject.js` owns the retry logic in dev and publishes it on
// window.__VIBEX_IMPORT_RETRY__; the fallback below covers the production build
// (no injected script), where the same error shape appears when a deploy
// replaced the chunks the open page still references.
// ---------------------------------------------------------------------------
const RETRYABLE_IMPORT_PATTERNS = [
  "does not provide an export named",
  "doesn't provide an export named",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
];

const IMPORT_RETRY_DELAY_MS = 3000;
const IMPORT_RETRY_MAX = 3;
const IMPORT_RETRY_KEY = "__vibex_import_retry__";
const IMPORT_RETRY_TTL_MS = 60000;

function isRetryableImportError(msg) {
  if (!msg) return false;
  const lower = String(msg).toLowerCase();
  if (lower.includes("importing binding name") && lower.includes("is not found")) {
    return true; // Safari wording
  }
  return RETRYABLE_IMPORT_PATTERNS.some((p) => lower.includes(p));
}

/** @returns {"retry"|"exhausted"|"skip"} */
function fallbackHandleImportError(msg) {
  if (!isRetryableImportError(msg)) return "skip";
  if (window.__VIBEX_RELOAD_SCHEDULED__) return "retry";

  let attempts = 0;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(IMPORT_RETRY_KEY) || "null");
    if (parsed && typeof parsed.n === "number" && Date.now() - (parsed.ts || 0) <= IMPORT_RETRY_TTL_MS) {
      attempts = parsed.n;
    }
  } catch { /* storage blocked */ }

  if (attempts >= IMPORT_RETRY_MAX) {
    try { sessionStorage.removeItem(IMPORT_RETRY_KEY); } catch { /* empty */ }
    return "exhausted";
  }

  attempts += 1;
  // The counter must survive the reload it schedules — without it we would
  // reload forever, so give up on retrying when storage is unavailable.
  try {
    sessionStorage.setItem(IMPORT_RETRY_KEY, JSON.stringify({ n: attempts, ts: Date.now() }));
    const check = JSON.parse(sessionStorage.getItem(IMPORT_RETRY_KEY) || "null");
    if (!check || check.n !== attempts) return "skip";
  } catch {
    return "skip";
  }

  window.__VIBEX_RELOAD_SCHEDULED__ = true;
  window.parent?.postMessage(
    {
      type: "app_error_retry",
      attempt: attempts,
      max: IMPORT_RETRY_MAX,
      delay_ms: IMPORT_RETRY_DELAY_MS,
      error: { title: "Static Import Error", details: String(msg), componentName: null },
    },
    "*"
  );
  setTimeout(() => {
    try { window.location.reload(); } catch { /* empty */ }
  }, IMPORT_RETRY_DELAY_MS);

  return "retry";
}

function handleImportError(msg) {
  const shared = window.__VIBEX_IMPORT_RETRY__;
  if (shared?.handle) return shared.handle(msg, null);
  return fallbackHandleImportError(msg);
}

function onAppError({ title, details, componentName, originalError }) {
  if (originalError?.response?.status === 402) return;

  // Skip transient React null-hook errors (HMR / init race)
  if (isSuppressedError(originalError) || isSuppressedError({ toString: () => details })) return;

  // Stale module graph → retry (reload) instead of reporting. Checked BEFORE the
  // quiet window: dropping these silently used to leave the preview broken with
  // nothing to recover it.
  const verdict = handleImportError(details || title);
  if (verdict === "retry") return;

  // Skip anything thrown while a hot update is settling
  if (verdict !== "exhausted" && isHmrQuiet()) return;

  window.parent?.postMessage(
    {
      type: "app_error",
      error: {
        title: title?.toString(),
        details: details?.toString(),
        componentName: componentName?.toString(),
        // Retries used up — the studio must treat this one as real.
        retry_exhausted: verdict === "exhausted",
      },
    },
    "*"
  );
}

function handleUnhandledRejection(event) {
  const stack = event.reason?.stack;
  const shortPath = extractPathWithLine(stack);

  const functionName =
    stack?.match(/at\s+(\w+)\s+\(eval/)?.[1] || shortPath;

  const msg = functionName
    ? `Error in ${functionName}: ${event.reason?.toString()}`
    : event.reason?.toString();

  onAppError({
    title: msg,
    details: event.reason?.toString(),
    componentName: functionName,
    originalError: event.reason,
  });
}

function handleWindowError(event) {
  const stack = event.error?.stack;
  let functionName = stack?.match(/at\s+(\w+)\s+\(eval/)?.[1];

  if (functionName === "eval") functionName = null;

  const shortPath = extractPathWithLine(stack);
  if (!functionName && shortPath) {
    functionName = shortPath;
  }

  const msg = functionName
    ? `in ${functionName}: ${event.error?.toString()}`
    : event.error?.toString();

  onAppError({
    title: msg,
    details: event.error?.toString(),
    componentName: functionName,
    originalError: event.error,
  });
}
