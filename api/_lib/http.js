// api/_lib/http.js — small shared helpers for the API handlers.
//
// The leading underscore keeps Vercel from deploying this file as a route.

import { isHosted } from './safe-fetch.js';

const WINDOW_MS = 60_000;
const HOSTED_DEFAULT = 600;   // one page load can legitimately fire a hundred calls

const hits = new Map();   // ip -> { count, resetAt }

/** Best-effort client address behind Vercel / a reverse proxy. */
function clientIp(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window rate limit, per instance (hosted deployments only by default). Not a substitute for an edge limiter
 * on a public deployment, but it stops one client hammering a warm function.
 * Returns true if the request may proceed.
 */
export function rateLimit(req, now = Date.now()) {
  // Off for a LAN / local install: every request comes from the user's own
  // browser, and a limit there only breaks the app. On when hosted, or when
  // RATE_LIMIT_PER_MIN is set explicitly.
  const configured = Number(process.env.RATE_LIMIT_PER_MIN) || 0;
  const maxHits = configured || (isHosted() ? HOSTED_DEFAULT : 0);
  if (!maxHits) return true;

  const ip = clientIp(req);
  let entry = hits.get(ip);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(ip, entry);
    if (hits.size > 5000) {
      for (const [key, e] of hits) if (e.resetAt <= now) hits.delete(key);
    }
  }
  entry.count += 1;
  return entry.count <= maxHits;
}

/** Origins allowed to call this API from another site (ALLOWED_ORIGINS). */
export function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
}

function originOf(value) {
  try { return new URL(value).origin; } catch { return null; }
}

/**
 * Browsers label every request with Sec-Fetch-Site. A page on another site —
 * which includes any website open in the same browser — may only use this API
 * if its origin is listed. Without this a malicious page could make a helper
 * running on someone's PC fetch addresses on their private network.
 *
 * Requests with no Sec-Fetch-Site (curl, scripts, old browsers) are not the
 * cross-site browser risk this guards against, so they pass.
 */
export function crossSiteAllowed(req) {
  const site = req.headers?.['sec-fetch-site'];
  if (!site || site === 'same-origin' || site === 'none') return true;

  const origin = req.headers.origin || originOf(req.headers.referer);
  return Boolean(origin) && allowedOrigins().includes(origin);
}

/**
 * CORS is off unless ALLOWED_ORIGINS lists the caller. In normal use the
 * frontend and API share an origin, so no cross-origin access is needed; the
 * hosted page + local helper setup is the case that lists one.
 */
export function applyCors(req, res) {
  const origin = req.headers?.origin;

  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    // A public page calling a private/loopback address sends a preflight that
    // must be answered with this, or Chrome blocks the request.
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
  }
}

/**
 * Common preamble. Returns true when the request was fully handled
 * (preflight, refused or rate-limited) and the caller should stop.
 */
export function preflight(req, res) {
  applyCors(req, res);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (!crossSiteAllowed(req))   { res.status(403).json({ error: 'Origin not allowed' }); return true; }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return true; }
  if (!rateLimit(req))          { res.status(429).json({ error: 'Too many requests' }); return true; }
  return false;
}
