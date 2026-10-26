// api/_lib/safe-fetch.js
//
// Fetches text from an open-directory server on the caller's behalf, without
// letting the caller turn the function into a general-purpose proxy.
//
// OpenPlay's whole job is reaching private addresses like 172.16.50.12, so
// private ranges are NOT blanket-blocked. What is blocked, always:
//   * link-local / cloud-metadata addresses (169.254.0.0/16, fe80::/10, …)
//   * the unspecified and multicast ranges
// and on a hosted deployment (Vercel, or OPENPLAY_HOSTED=1) additionally:
//   * loopback, and every host not named in ALLOWED_PROXY_HOSTS
//
// Every redirect hop is re-validated, and hostnames are resolved so a DNS name
// pointing at a blocked address is refused too.

import dns from 'node:dns/promises';
import net from 'node:net';

export const TIMEOUT_MS    = 20_000;
export const MAX_BYTES     = 8 * 1024 * 1024;   // a directory listing or subtitle file
export const MAX_REDIRECTS = 5;

const BLOCKED_NAMES = new Set(['metadata.google.internal', 'metadata.goog']);

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function isHosted() {
  return Boolean(process.env.VERCEL) || process.env.OPENPLAY_HOSTED === '1';
}

function allowList() {
  return (process.env.ALLOWED_PROXY_HOSTS || '')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
}

/** Dotted-quad of an IPv4-mapped IPv6 address, or null. */
function mappedV4(ip) {
  const m = ip.toLowerCase().match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (!m) return null;
  if (m[1]) return m[1];
  const hi = parseInt(m[2], 16), lo = parseInt(m[3], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/**
 * Classify a literal IP address.
 * @returns {'ok' | 'blocked' | 'loopback'}
 */
export function classifyIp(rawIp) {
  const ip = String(rawIp).replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = mappedV4(ip) || (net.isIPv4(ip) ? ip : null);

  if (v4) {
    const [a, b] = v4.split('.').map(Number);
    if (a === 127) return 'loopback';
    if (a === 0 || a >= 224) return 'blocked';        // unspecified, multicast, reserved
    if (a === 169 && b === 254) return 'blocked';     // link-local + cloud metadata
    return 'ok';
  }

  if (net.isIPv6(ip)) {
    if (ip === '::1') return 'loopback';
    if (ip === '::' ) return 'blocked';
    if (/^fe[89ab]/.test(ip)) return 'blocked';       // fe80::/10 link-local
    if (/^ff/.test(ip)) return 'blocked';             // multicast
    if (ip.startsWith('fd00:ec2:')) return 'blocked'; // AWS IPv6 metadata
    return 'ok';
  }

  return 'blocked';   // not an address at all
}

function applyClass(cls, hostname) {
  if (cls === 'blocked') throw fail(`Host ${hostname} is not reachable through this proxy`, 403);
  if (cls === 'loopback' && isHosted()) throw fail('Loopback addresses are not allowed', 403);
}

/**
 * Throw (with an HTTP status) unless `rawUrl` is a URL this proxy may fetch.
 * `lookup` is injectable so the check can be tested without a network.
 */
export async function assertUrlAllowed(rawUrl, lookup = host => dns.lookup(host, { all: true })) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw fail('Malformed url', 400); }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw fail('url must be http:// or https://', 400);
  }
  if (parsed.username || parsed.password) throw fail('Credentials in urls are not allowed', 400);

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_NAMES.has(hostname)) throw fail('Host not allowed', 403);

  const list = allowList();
  if (list.length > 0) {
    if (!list.includes(hostname)) throw fail('Host not allowed by ALLOWED_PROXY_HOSTS', 403);
  } else if (isHosted()) {
    throw fail('This deployment requires ALLOWED_PROXY_HOSTS to be set', 403);
  }

  if (net.isIP(hostname)) {
    applyClass(classifyIp(hostname), hostname);
    return parsed;
  }

  let addresses;
  try { addresses = await lookup(hostname); } catch { throw fail(`Could not resolve ${hostname}`, 502); }
  if (!addresses?.length) throw fail(`Could not resolve ${hostname}`, 502);
  for (const { address } of addresses) applyClass(classifyIp(address), hostname);

  return parsed;
}

/** Read a response body as text, aborting as soon as it exceeds MAX_BYTES. */
async function readCapped(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) throw fail(`Response too large (${declared} bytes)`, 413);

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw fail('Response too large', 413);
    }
    chunks.push(value);
  }

  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

/**
 * Fetch a URL as text, following redirects by hand so each hop is re-checked.
 * `fetchImpl` is injectable for tests.
 */
export async function fetchText(rawUrl, { fetchImpl = fetch, lookup } = {}) {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = await assertUrlAllowed(current, lookup);

    const response = await fetchImpl(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenPlay/1.0)',
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw fail('Redirect without a location', 502);
      current = new URL(location, parsed).toString();
      continue;
    }

    if (!response.ok) throw fail(`Remote server returned ${response.status}`, response.status);
    return readCapped(response);
  }

  throw fail('Too many redirects', 508);
}
