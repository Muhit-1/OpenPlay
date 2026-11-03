// src/lib/text.js
// Small string helpers shared across the app.

/**
 * decodeURIComponent that never throws.
 *
 * Release names legitimately contain bare percent signs — "100% Wolf",
 * "Scary Movie 100%" — and a folder name coming back from the parser is already
 * decoded. Running it through decodeURIComponent again raises URIError and, in
 * a render path, blanks the whole page. Every decode in the UI goes through
 * here instead.
 */
export function safeDecode(value) {
  const str = String(value ?? '');
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/** The last path segment of a URL, decoded safely. */
export function basename(url) {
  return safeDecode(String(url ?? '').split('/').pop() || '');
}

/** Characters encodeURIComponent leaves alone but the file server escapes. */
const ESCAPE_EXTRA = c => '%' + c.charCodeAt(0).toString(16).toUpperCase();

/**
 * A file URL in one canonical form: each path segment percent-encoded exactly
 * once, whether it arrives encoded ("My%20Show"), decoded ("My Show"), or a mix.
 *
 * The player used to decode the route parameter a second time (the router has
 * already decoded it once), leaving spaces and unicode in the URL; the server
 * then listed that folder as empty, so the episode list never appeared. Every
 * place that stores, compares or hands out a file URL should go through this.
 */
export function normalizeFileUrl(url) {
  const raw = String(url ?? '').trim();
  const match = raw.match(/^(https?:\/\/[^/?#]+)(\/[^?#]*)?(.*)$/i);
  if (!match) return raw;

  const [, origin, path = '', rest] = match;
  const encoded = path
    .split('/')
    .map(segment => encodeURIComponent(safeDecode(segment)).replace(/[!'()*]/g, ESCAPE_EXTRA))
    .join('/');

  return origin + encoded + rest;
}

/** True when two URLs name the same file, however each happens to be encoded. */
export function sameFile(a, b) {
  return normalizeFileUrl(a) === normalizeFileUrl(b);
}
