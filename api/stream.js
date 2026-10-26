// api/stream.js — media pass-through for the local helper
//
// A page served over https:// cannot load http:// video, and a website cannot
// reach the user's private network. When OpenPlay is hosted, the helper on the
// user's own PC fetches the video and hands it to the page — over loopback, so
// nothing leaves the machine. Range requests are forwarded, so seeking works.
//
// Off unless OPENPLAY_STREAM=1 (the helper turns it on). A normal LAN install
// does not need it: the browser plays straight from the ISP.

import { Readable } from 'node:stream';
import { assertUrlAllowed, MAX_REDIRECTS } from './_lib/safe-fetch.js';
import { preflight } from './_lib/http.js';

const MEDIA_TYPE = /^(video|audio)\/|^application\/(octet-stream|x-matroska|vnd\.apple\.mpegurl|x-mpegurl)/i;
const MEDIA_EXT  = /\.(mkv|mp4|m4v|webm|mov|avi|ts|m2ts|mpg|mpeg|ogv|m3u8|vtt|srt)$/i;

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export default async function handler(req, res) {
  if (preflight(req, res)) return;

  if (process.env.OPENPLAY_STREAM !== '1') {
    return res.status(404).json({ error: 'Streaming is not enabled on this server' });
  }

  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url parameter' });

  // Media only: this must not become a way to read arbitrary pages.
  let pathname;
  try { pathname = new URL(url).pathname; } catch { return res.status(400).json({ error: 'Malformed url' }); }
  if (!MEDIA_EXT.test(pathname)) return res.status(415).json({ error: 'Only media files can be streamed' });

  const upstream = new AbortController();
  res.on('close', () => upstream.abort());

  try {
    let current = url;
    let response;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const parsed = await assertUrlAllowed(current);
      const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; OpenPlay/1.0)' };
      if (req.headers.range) headers.Range = req.headers.range;

      response = await fetch(parsed.toString(), { headers, redirect: 'manual', signal: upstream.signal });

      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        current = new URL(response.headers.get('location'), parsed).toString();
        response.body?.cancel();
        continue;
      }
      break;
    }

    if (response.status >= 300 && response.status < 400) {
      return res.status(508).json({ error: 'Too many redirects' });
    }
    if (!response.ok && response.status !== 206) {
      response.body?.cancel();
      return res.status(response.status).json({ error: `Remote server returned ${response.status}` });
    }

    const type = response.headers.get('content-type') || '';
    if (!MEDIA_TYPE.test(type) && !/\.(vtt|srt)$/i.test(pathname)) {
      response.body?.cancel();
      return res.status(415).json({ error: 'Remote file is not media' });
    }

    res.status(response.status);
    for (const name of PASS_HEADERS) {
      const value = response.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader('Cache-Control', 'no-store');

    if (!response.body) return res.end();
    Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    if (upstream.signal.aborted) return;   // the player closed the connection
    const status = err.status || 502;
    if (!res.headersSent) res.status(status).json({ error: 'Stream failed', detail: err.message });
    else res.destroy();
  }
}
