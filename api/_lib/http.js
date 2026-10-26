// api/_lib/http.js — small shared helpers for the API handlers.
//
// The leading underscore keeps Vercel from deploying this file as a route.

const WINDOW_MS = 60_000;
const MAX_HITS  = Number(process.env.RATE_LIMIT_PER_MIN) || 240;

const hits = new Map();   // ip -> { count, resetAt }

/** Best-effort client address behind Vercel / a reverse proxy. */
function clientIp(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

/**
 * Fixed-window rate limit, per instance. Not a substitute for an edge limiter
 * on a public deployment, but it stops one client hammering a warm function.
 * Returns true if the request may proceed.
 */
export function rateLimit(req, now = Date.now()) {
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
  return entry.count <= MAX_HITS;
}

/**
 * CORS is off unless ALLOWED_ORIGINS lists the caller. In normal use the
 * frontend and API share an origin (the Vite proxy in dev, one server or one
 * Vercel project in production), so no cross-origin access is needed.
 */
export function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean);
  const origin = req.headers?.origin;

  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

/**
 * Common preamble. Returns true when the request was fully handled
 * (preflight or rate-limited) and the caller should stop.
 */
export function preflight(req, res) {
  applyCors(req, res);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return true; }
  if (!rateLimit(req))          { res.status(429).json({ error: 'Too many requests' }); return true; }
  return false;
}
