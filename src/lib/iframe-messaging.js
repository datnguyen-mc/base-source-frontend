
import { isIframe } from "./coreUtils.js";

export function setupIframeMessaging() {
  if (isIframe) {
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("pagehide", handlePageHide);

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("pagehide", handlePageHide);
  }
}

/**
 * The page is going away — a reload (ours, or Vite reconnecting after the tab
 * was in the background), or a full navigation. This is the exact moment the
 * preview goes white, and the only one the parent cannot observe from outside,
 * so it is what lets it raise its loading overlay in time. It comes back down
 * on `visual-edit-agent-ready` from the document that replaces this one.
 */
function handlePageHide() {
  window.parent?.postMessage({ type: "sandbox:unloading" }, "*");
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

/**
 * Turn ANY thrown/rejected value into readable text.
 *
 * `String(value)` / `value.toString()` is fine for an Error, but an unhandled
 * promise rejection routinely carries a PLAIN OBJECT (a rejected fetch/axios
 * response, `throw { code, message }`, …) whose toString() is the literal
 * "[object Object]". The studio then displayed — and sent to the auto-fix AI —
 * "1. [object Object] → [object Object] → Component: no-component", which is
 * information-free yet still consumed one of the user's fix attempts.
 */
function toReadableText(value) {
  if (value == null) return "";
  const t = typeof value;
  if (t === "string") return value;
  if (t === "number" || t === "boolean") return String(value);
  if (t === "function" || t === "symbol") return "";
  if (t !== "object") return String(value);

  if (
    value instanceof Error ||
    (typeof value.name === "string" && typeof value.message === "string")
  ) {
    return [value.name, value.message].filter(Boolean).join(": ").trim();
  }

  const direct = [
    value.message,
    value.statusText,
    value.detail,
    value.details,
    value.reason,
    value.error,
  ];
  for (const candidate of direct) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const nested of [value.error, value.data, value.response]) {
    if (nested && typeof nested === "object" && typeof nested.message === "string" && nested.message.trim()) {
      return nested.message.trim();
    }
  }

  try {
    const seen = new WeakSet();
    const json = JSON.stringify(value, (_k, v) => {
      if (typeof v === "function") return undefined;
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    });
    if (json && json !== "{}" && json !== "[]" && json !== "null") {
      return json.slice(0, 2000);
    }
  } catch { /* unserialisable */ }
  return "";
}

function onAppError({ title, details, componentName, originalError }) {
  if (originalError?.response?.status === 402) return;

  // Recover readable text BEFORE any classification — the retry/suppression
  // checks below all match on message content, and "[object Object]" matches
  // nothing, so an unreadable payload used to sail past every guard.
  const safeTitle = toReadableText(title) || toReadableText(originalError);
  const safeDetails = toReadableText(details) || toReadableText(originalError);
  const safeComponent = toReadableText(componentName);

  // Skip transient React null-hook errors (HMR / init race)
  if (isSuppressedError(originalError) || isSuppressedError({ toString: () => safeDetails })) return;

  // Nothing readable could be recovered at all: the AI cannot act on it and it
  // would only burn a fix attempt. Let the studio-side gate reload instead.
  if (!safeTitle.trim() && !safeDetails.trim()) {
    console.warn("[Inject] dropping error with no readable payload:", originalError);
    return;
  }

  // Stale module graph → retry (reload) instead of reporting. Checked BEFORE the
  // quiet window: dropping these silently used to leave the preview broken with
  // nothing to recover it.
  const verdict = handleImportError(safeDetails || safeTitle);
  if (verdict === "retry") return;

  // Skip anything thrown while a hot update is settling
  if (verdict !== "exhausted" && isHmrQuiet()) return;

  window.parent?.postMessage(
    {
      type: "app_error",
      error: {
        title: safeTitle,
        details: safeDetails,
        componentName: safeComponent,
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

  // toReadableText, not toString(): a rejection reason is very often a plain
  // object (rejected fetch/axios response) whose toString() is "[object Object]".
  const reasonText = toReadableText(event.reason);
  const msg = functionName
    ? `Error in ${functionName}: ${reasonText}`
    : reasonText;

  onAppError({
    title: msg,
    details: reasonText,
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

  // toReadableText, not toString(): `throw { code, message }` and other
  // non-Error throws stringify to "[object Object]".
  const errorText = toReadableText(event.error) || toReadableText(event.message);
  const msg = functionName ? `in ${functionName}: ${errorText}` : errorText;

  onAppError({
    title: msg,
    details: errorText,
    componentName: functionName,
    originalError: event.error,
  });
}
