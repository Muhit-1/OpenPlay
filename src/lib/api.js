// src/lib/api.js
//
// Where the API lives, and how media gets to the player.
//
// Two ways to run OpenPlay:
//   * Same origin  — `npm start` / Vite dev: the page and /api share a server.
//   * Helper       — the page is hosted (GitHub Pages) and talks to a small
//                    helper running on the user's own PC, usually
//                    http://localhost:8080. Only the helper can see the ISP's
//                    private addresses, so it also streams the video: an
//                    https:// page may not load http:// media directly.

import { getItem, setItem, removeItem } from './storage.js';

export const DEFAULT_HELPER = 'http://localhost:8080';

const KEY = 'api_base';

function clean(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** Hosted pages have no API of their own, so they default to the local helper. */
function defaultBase() {
  const configured = clean(import.meta.env?.VITE_API_BASE);
  if (configured) return configured;
  const host = typeof location === 'undefined' ? '' : location.hostname;
  return host.endsWith('.github.io') ? DEFAULT_HELPER : '';
}

/** '' means "same origin". */
export function apiBase() {
  const saved = clean(getItem(KEY));
  return saved || defaultBase();
}

export function setApiBase(url) {
  const value = clean(url);
  if (value) setItem(KEY, value); else removeItem(KEY);
}

/** True when the API is somewhere other than the page's own origin. */
export function usesHelper() {
  return apiBase() !== '';
}

/** `/api/tmdb?x=1` -> `http://localhost:8080/api/tmdb?x=1` when a helper is set. */
export function apiUrl(path) {
  return `${apiBase()}${path}`;
}

/**
 * What to put in a <video src> or <track src>.
 *
 * A secure page cannot load plain-http media, so it goes through the helper's
 * /api/stream. Everywhere else the browser fetches straight from the ISP, which
 * keeps video off the backend.
 */
export function mediaSrc(url) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  if (secure && /^http:\/\//i.test(url) && usesHelper()) {
    return apiUrl(`/api/stream?url=${encodeURIComponent(url)}`);
  }
  return url;
}

/**
 * Ask the API who it is. Resolves to { reachable, health }.
 * `reachable: false` means the request itself failed (helper not running, or
 * blocked by the browser) as opposed to the helper answering with a problem.
 */
export async function pingApi(base = apiBase()) {
  try {
    const res = await fetch(`${clean(base)}/api/health`, { signal: AbortSignal.timeout(6000) });
    const health = await res.json();
    return { reachable: true, health };
  } catch (error) {
    // A dev server answering 502 with no JSON means "nothing is behind me".
    return { reachable: false, health: null, error };
  }
}

/**
 * A failed API response, in words. OpenPlay's own API always explains itself in
 * JSON; a bare 502/503/504 with no explanation comes from whatever sits in
 * front of it (the Vite dev proxy, a reverse proxy) and means the API process
 * is not running or not reachable.
 */
export function describeApiFailure(status, body) {
  if (body?.detail) return body.detail;
  if (body?.error) return body.error;
  if (status === 502 || status === 503 || status === 504) {
    return usesHelper()
      ? 'The OpenPlay helper is not reachable. Start it with npm run helper.'
      : "OpenPlay's own API is not running. Start everything with npm run dev:all (or npm start) and reload.";
  }
  return `Server returned HTTP ${status}.`;
}
