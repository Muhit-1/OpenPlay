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
