// api/subtitles.js — Vercel Serverless Function / local Express route
//
// Finds and fetches subtitles from OpenSubtitles (opensubtitles.com, REST API v1)
// so the player can offer them without anyone uploading a file by hand.
//
// Query modes:
//   ?search=1&type=tv|movie&tmdbId=…&season=…&episode=…&lang=en,bn&query=…&year=…
//        → { results: [...] }   flat, normalised, not yet ranked (the browser ranks
//          them against the file's own release name)
//   ?download=<fileId>
//        → the subtitle as WebVTT text, ready for a <track>
//
// The API key lives in OPENSUBTITLES_API_KEY and never leaves the server.
// Downloads usually also need an account: set OPENSUBTITLES_USERNAME and
// OPENSUBTITLES_PASSWORD. Anonymous downloads are heavily limited by OpenSubtitles.

import { preflight } from './_lib/http.js';
import { normalizeResults, srtToVtt, decodeSubtitle } from '../shared/subtitles.js';

export { decodeSubtitle };

const TIMEOUT = 10_000;
const MAX_SUBTITLE_BYTES = 2_500_000;

const SEARCH_TTL = 10 * 60_000;
const DOWNLOAD_TTL = 24 * 60 * 60_000;

const searchCache = new Map();     // key -> { at, value }
const downloadCache = new Map();   // fileId -> { at, value }
let session = null;                // { token, expires }

// OPENSUBTITLES_BASE_URL exists so tests can point at a stand-in server.
const base = () => (process.env.OPENSUBTITLES_BASE_URL || 'https://api.opensubtitles.com/api/v1').replace(/\/+$/, '');
const apiKey = () => String(process.env.OPENSUBTITLES_API_KEY || '').trim();
const userAgent = () => process.env.OPENSUBTITLES_USER_AGENT || 'OpenPlay v0.1';

export const isConfigured = () => Boolean(apiKey());

/** An error that carries an HTTP status and a stable code the UI can switch on. */
function fail(status, code, detail) {
  const err = new Error(detail);
  err.status = status;
  err.code = code;
  return err;
}

function cacheGet(map, key, ttl, now = Date.now()) {
  const hit = map.get(key);
  if (hit && now - hit.at < ttl) return hit.value;
  map.delete(key);
  return undefined;
}

function cacheSet(map, key, value, max = 200, now = Date.now()) {
  if (map.size >= max) map.delete(map.keys().next().value);
  map.set(key, { at: now, value });
}

/** Test hook. */
export function clearSubtitleCaches() {
  searchCache.clear();
  downloadCache.clear();
  session = null;
}

function headers(extra = {}) {
  return {
    'Api-Key': apiKey(),
    'User-Agent': userAgent(),
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Turn an OpenSubtitles failure into our own status + code. */
async function upstreamError(res) {
  let message = '';
  try { message = (await res.json()).message || ''; } catch { /* not JSON */ }

  if (res.status === 401 || res.status === 403) {
    return fail(401, 'bad_key', message || 'OpenSubtitles rejected the API key or login.');
  }
  if (res.status === 406) {
    return fail(429, 'quota', message || 'The OpenSubtitles download limit for today has been reached.');
  }
  if (res.status === 429) {
    return fail(429, 'rate', 'OpenSubtitles is rate limiting requests. Try again in a moment.');
  }
  return fail(502, 'upstream', message || `OpenSubtitles returned ${res.status}.`);
}

async function login() {
  const username = process.env.OPENSUBTITLES_USERNAME;
  const password = process.env.OPENSUBTITLES_PASSWORD;
  if (!username || !password) return null;

  if (session && session.expires > Date.now()) return session.token;

  const res = await fetch(`${base()}/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw await upstreamError(res);

  const { token } = await res.json();
  if (!token) throw fail(502, 'upstream', 'OpenSubtitles did not return a login token.');

  session = { token, expires: Date.now() + 20 * 60 * 60_000 };   // tokens last 24 h
  return token;
}

// ── Search ───────────────────────────────────────────────────────────────

const LANGS = /^[a-z]{2}(-[a-z]{2})?(,[a-z]{2}(-[a-z]{2})?)*$/i;
const whole = v => /^\d{1,9}$/.test(String(v ?? ''));

/**
 * Build the OpenSubtitles query from our own parameters. OpenSubtitles wants
 * lowercase names in alphabetical order, otherwise it redirects.
 */
export function buildSearchParams(q) {
  const type = q.type === 'tv' ? 'episode' : 'movie';
  const p = { type };

  if (type === 'episode') {
    if (whole(q.tmdbId)) p.parent_tmdb_id = q.tmdbId;
    if (whole(q.season)) p.season_number = q.season;
    if (whole(q.episode)) p.episode_number = q.episode;
  } else if (whole(q.tmdbId)) {
    p.tmdb_id = q.tmdbId;
  }

  const text = String(q.query || '').trim().slice(0, 120);
  if (text && !p.tmdb_id && !p.parent_tmdb_id) p.query = text;
  if (text && p.parent_tmdb_id && type === 'episode') p.query = text;
  if (whole(q.year) && !p.tmdb_id && !p.parent_tmdb_id) p.year = q.year;

  if (q.lang && LANGS.test(String(q.lang))) p.languages = String(q.lang).toLowerCase();

  p.order_by = 'download_count';
  return Object.fromEntries(Object.entries(p).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export async function searchSubtitles(q) {
  const params = buildSearchParams(q);
  if (!params.tmdb_id && !params.parent_tmdb_id && !params.query) {
    throw fail(400, 'bad_request', 'Give a tmdbId or a query to search for.');
  }

  const key = new URLSearchParams(params).toString();
  const cached = cacheGet(searchCache, key, SEARCH_TTL);
  if (cached) return cached;

  const res = await fetch(`${base()}/subtitles?${key}`, {
    headers: headers(),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw await upstreamError(res);

  const body = await res.json();
  const value = { results: normalizeResults(body.data), total: Number(body.total_count) || 0 };
  cacheSet(searchCache, key, value);
  return value;
}

// ── Download ─────────────────────────────────────────────────────────────

/** Only follow download links that point at OpenSubtitles (or the configured API host). */
export function linkAllowed(link) {
  let host;
  try { host = new URL(link).hostname.toLowerCase(); } catch { return false; }
  let apiHost = '';
  try { apiHost = new URL(base()).hostname.toLowerCase(); } catch { /* ignore */ }
  return /(^|\.)opensubtitles\.(com|org)$/.test(host) || host === apiHost;
}

async function requestDownloadLink(fileId, token) {
  const res = await fetch(`${base()}/download`, {
    method: 'POST',
    headers: headers(token ? { Authorization: `Bearer ${token}` } : {}),
    body: JSON.stringify({ file_id: Number(fileId), sub_format: 'srt' }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw await upstreamError(res);
  return res.json();
}

export async function downloadSubtitle(fileId) {
  if (!whole(fileId)) throw fail(400, 'bad_request', 'Invalid subtitle id.');

  const cached = cacheGet(downloadCache, fileId, DOWNLOAD_TTL);
  if (cached) return cached;

  let token = await login();
  let info;
  try {
    info = await requestDownloadLink(fileId, token);
  } catch (err) {
    // An expired token: log in again once.
    if (token && err.code === 'bad_key') {
      session = null;
      token = await login();
      info = await requestDownloadLink(fileId, token);
    } else {
      throw err;
    }
  }

  if (!info?.link || !linkAllowed(info.link)) {
    throw fail(502, 'upstream', 'OpenSubtitles returned no usable download link.');
  }

  const file = await fetch(info.link, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
  if (!file.ok) throw fail(502, 'upstream', `The subtitle file could not be fetched (${file.status}).`);

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_SUBTITLE_BYTES) throw fail(502, 'upstream', 'That subtitle file is too large.');

  const vtt = srtToVtt(decodeSubtitle(buffer));
  cacheSet(downloadCache, fileId, vtt, 100);
  return vtt;
}

// ── Handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (preflight(req, res)) return;

  if (!isConfigured()) {
    return res.status(501).json({
      error: 'Subtitles are not set up',
      code: 'not_configured',
      detail: 'Add OPENSUBTITLES_API_KEY to .env and restart OpenPlay.',
    });
  }

  try {
    if (req.query.download !== undefined) {
      const vtt = await downloadSubtitle(String(req.query.download));
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.status(200).send(vtt);
    }

    if (req.query.search !== undefined) {
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.status(200).json(await searchSubtitles(req.query));
    }

    return res.status(400).json({ error: 'Use ?search=1 or ?download=<fileId>', code: 'bad_request' });
  } catch (err) {
    // Errors we raised carry a code and a readable message. Anything else is the
    // network itself failing ("fetch failed", a timeout) and says nothing useful.
    const known = Boolean(err.code && err.status);
    const status = known ? err.status : 502;
    const message = known ? err.message : 'OpenSubtitles could not be reached from this server. Check its internet connection.';
    if (status >= 500) console.error('[subtitles]', err.message);
    return res.status(status).json({ error: message, code: err.code || 'upstream', detail: message });
  }
}
