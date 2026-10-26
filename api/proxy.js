// api/proxy.js — Vercel Serverless Function / local Express route
//
// Fetches a text resource (directory listing or subtitle file) from an open
// directory server and returns it to the browser, bypassing CORS.
//
// Video is NEVER proxied — the player streams straight from the origin server.
// This endpoint only ever returns text, and caps how much of it.

import { fetchText } from './_lib/safe-fetch.js';
import { preflight } from './_lib/http.js';

export { fetchText };

/** Convert SubRip to WebVTT. Browsers only accept VTT in a <track>. */
export function srtToVtt(srt) {
  const body = srt
    .replace(/^\uFEFF/, '')          // strip BOM
    .replace(/\r\n|\r/g, '\n')       // normalise line endings
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2'); // 00:00:01,234 -> 00:00:01.234

  return 'WEBVTT\n\n' + body.trim() + '\n';
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;

  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const text = await fetchText(url);

    // Judge by the path, not the raw string: a `?x=.srt` suffix must not count.
    let pathname = '';
    try { pathname = new URL(url).pathname.toLowerCase(); } catch { /* validated above */ }

    if (pathname.endsWith('.srt')) {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      return res.status(200).send(srtToVtt(text));
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    const status = err.status || 502;
    console.error('[proxy]', status, err.message);
    return res.status(status).json({ error: 'Proxy failed', detail: err.message });
  }
}
