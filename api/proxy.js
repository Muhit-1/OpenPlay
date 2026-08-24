// api/proxy.js — Vercel Serverless Function
//
// Fetches a text resource (directory listing or subtitle file) from an open
// directory server and returns it to the browser, bypassing CORS.
//
// Video is NEVER proxied — the player streams straight from the origin server.
// This endpoint only ever returns text, and caps how much of it.

const TIMEOUT_MS = 20_000;
const MAX_BYTES  = 8 * 1024 * 1024; // 8 MB — a directory listing or subtitle file

// Cloud instance-metadata endpoints. Always refused: an open proxy that can
// reach these hands an attacker the deployment's own credentials.
const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  '[fd00:ec2::254]',
  'metadata.google.internal',
  'metadata.goog',
]);

/**
 * Hosts this proxy is allowed to reach.
 *
 * Empty (the default) means "any host", which is what you want for local and
 * LAN use — the whole point of OpenPlay is reaching private addresses like
 * 172.16.50.12, so blanket-blocking private ranges would break the product.
 * On a public deployment, set ALLOWED_PROXY_HOSTS so strangers can't use your
 * function as a general-purpose proxy.
 */
function hostAllowed(hostname) {
  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) return false;

  const allowList = (process.env.ALLOWED_PROXY_HOSTS || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

  if (allowList.length === 0) return true;
  return allowList.includes(hostname.toLowerCase());
}

/** Convert SubRip to WebVTT. Browsers only accept VTT in a <track>. */
export function srtToVtt(srt) {
  const body = srt
    .replace(/^\uFEFF/, '')          // strip BOM
    .replace(/\r\n|\r/g, '\n')       // normalise line endings
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2'); // 00:00:01,234 -> 00:00:01.234

  return 'WEBVTT\n\n' + body.trim() + '\n';
}

/** Read a response body as text, refusing anything over MAX_BYTES. */
async function readCapped(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    throw new Error(`Response too large (${declared} bytes)`);
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(`Response too large (${buf.byteLength} bytes)`);
  }
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * Shared fetch used by both this endpoint and api/parse.js.
 * Returns the response body as text.
 */
export async function fetchText(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const err = new Error('Malformed url');
    err.status = 400;
    throw err;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('url must be http:// or https://');
    err.status = 400;
    throw err;
  }

  if (!hostAllowed(parsed.hostname)) {
    const err = new Error('Host not allowed by ALLOWED_PROXY_HOSTS');
    err.status = 403;
    throw err;
  }

  const response = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; OpenPlay/1.0)',
      'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const err = new Error(`Remote server returned ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return readCapped(response);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const text = await fetchText(url);

    if (url.toLowerCase().endsWith('.srt')) {
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
