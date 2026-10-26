// api/health.js — tells the UI whether metadata can work at all.
//
// "No posters" has two common causes that look identical in the browser:
// TMDB_API_KEY missing/wrong, or TMDB (or its image CDN) unreachable from this
// network. This endpoint tells them apart.

import { preflight } from './_lib/http.js';
import { tmdbAuth } from './_lib/tmdb-auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const key = process.env.TMDB_API_KEY;
  const stream = process.env.OPENPLAY_STREAM === '1';
  if (!key) {
    return res.status(200).json({ ok: false, reason: 'no-key', stream });
  }

  const started = Date.now();
  try {
    const auth = tmdbAuth(key);
    const url  = new URL(`${process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3'}/configuration`);
    if (auth.apiKey) url.searchParams.set('api_key', auth.apiKey);
    const r = await fetch(url, { headers: auth.headers, signal: AbortSignal.timeout(6000) });
    if (r.status === 401) return res.status(200).json({ ok: false, reason: 'bad-key', stream });
    if (!r.ok) return res.status(200).json({ ok: false, reason: 'tmdb-error', status: r.status, stream });
    return res.status(200).json({ ok: true, ms: Date.now() - started, stream });
  } catch (err) {
    return res.status(200).json({ ok: false, reason: 'unreachable', detail: err.message, stream });
  }
}
