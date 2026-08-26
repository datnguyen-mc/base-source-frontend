/**
 * The app-wide "this visitor is blocked by IP" latch.
 *
 * Deliberately app-level and NOT in the SDK: the SDK is a vendored file, and the
 * block only needs to change what the app RENDERS.
 *
 * Sticky on purpose. Every request from a blocked visitor comes back 403, and the
 * app has several handlers that read a 403 as "session expired" and send the user
 * to a login page they also cannot load. Latching once means the restricted
 * screen cannot be demoted by whatever fails next; only an explicit user retry
 * (`resetIpBlocked`) clears it.
 */

/** `error_code` the API returns when the owner has restricted the app by IP. */
export const NOT_ALLOWED_CODE = 'NOT_ALLOWED';

/** Fired on `window` when the latch flips, so any listener can react. */
export const IP_BLOCKED_EVENT = 'vibex:ip-not-allowed';

let blocked = false;

/**
 * True when `err` is the API refusing this visitor.
 *
 * Matched on `error_code` and NOT on an `extra_data.reason` field: the API wraps
 * every error as {code, message, data, error_code, timestamp}, so `error_code` is
 * the only part of a server error that survives to the client.
 */
export function isIpNotAllowedError(err) {
  if (!err) return false;
  const body = err.data || {};
  return err.status === 403 && body.error_code === NOT_ALLOWED_CODE;
}

export function isIpBlocked() {
  return blocked;
}

/** Latch the block (idempotent) and notify listeners. Returns true if blocked. */
export function markIpBlocked() {
  if (blocked) return true;
  blocked = true;
  if (typeof window !== 'undefined') {
    window.__VIBEX_IP_BLOCKED__ = true;
    try {
      window.dispatchEvent(new CustomEvent(IP_BLOCKED_EVENT));
    } catch (_) {
      /* CustomEvent unavailable — the latch above is what matters */
    }
  }
  return true;
}

/**
 * Latch if (and only if) `err` is an IP refusal. Call this from any catch block
 * that might see one; returns true when it WAS the block, so the caller can stop
 * instead of mapping the 403 onto some other state.
 */
export function captureIpBlock(err) {
  return isIpNotAllowedError(err) ? markIpBlocked() : false;
}

/**
 * Clear the latch. ONLY an explicit user retry may call this ("I reconnected
 * from an approved network") — nothing automatic, or the sticky guarantee above
 * is worthless.
 */
export function resetIpBlocked() {
  blocked = false;
  if (typeof window !== 'undefined') window.__VIBEX_IP_BLOCKED__ = false;
}
