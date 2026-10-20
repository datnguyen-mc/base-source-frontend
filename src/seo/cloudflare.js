// Cloudflare's Email Address Obfuscation rewrites every address in the HTML it serves:
// text → <a class="__cf_email__" data-cfemail="…">[email protected]</a>, and mailto: links →
// href="/cdn-cgi/l/email-protection#…". React would find markup it did not render and throw the
// server HTML away (#418 / #425 / #423), so main.jsx puts it back before hydrating — wherever the
// address came from (hard-coded text, entity data…). Cloudflare's own decoder may already have
// run (it then removes its <script>, leaving no trace): only the text nodes it split are left.
// One selector pass and one normalize(), well under a millisecond even on a slow phone — cheaper
// than checking first whether Cloudflare touched the page at all.
const PROTECTED_LINK = '/cdn-cgi/l/email-protection#';

const decode = (hex) => {
  const key = parseInt(hex.slice(0, 2), 16);
  const bytes = new Uint8Array((hex.length - 2) / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16) ^ key;
  return new TextDecoder().decode(bytes);
};

export function undoEmailObfuscation(root) {
  root.querySelectorAll(`[data-cfemail], a[href^="${PROTECTED_LINK}"]`).forEach((el) => {
    const hex = el.getAttribute('data-cfemail');
    if (hex) el.replaceWith(decode(hex));
    else el.setAttribute('href', `mailto:${decode(el.getAttribute('href').slice(PROTECTED_LINK.length))}`);
  });
  // The address now sits next to the text around it as separate text nodes; the server sent one.
  root.normalize();
}
