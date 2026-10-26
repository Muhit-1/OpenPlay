// api/health.js — tells the UI whether metadata can work at all.
//
// "No posters" has two common causes that look identical in the browser:
// TMDB_API_KEY missing/wrong, or TMDB (or its image CDN) unreachable from this
// network. This endpoint tells them apart.

import { preflight } from './_lib/http.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return res.status(200).json({ ok: false, reason: 'no-key' });
  }

  const started = Date.now();
  try {
    const r = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (r.status === 401) return res.status(200).json({ ok: false, reason: 'bad-key' });
    if (!r.ok) return res.status(200).json({ ok: false, reason: 'tmdb-error', status: r.status });
    return res.status(200).json({ ok: true, ms: Date.now() - started });
  } catch (err) {
    return res.status(200).json({ ok: false, reason: 'unreachable', detail: err.message });
  }
}
