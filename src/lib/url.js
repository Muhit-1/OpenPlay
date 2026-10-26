// src/lib/url.js
//
// Turning whatever a person types into the address of their ISP server.
//
// People type "172.16.50.12", "http://172.16.50.12", "172.16.50.12:8080/media",
// or paste a whole link. All of those mean the same thing, so accept them and
// show a plain-language reason when something cannot work.

const SCHEME   = /^[a-z][a-z0-9+.-]*:\/\//i;
const ODD_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i;   // "javascript:", "mailto:" — but not "host:8080"
const LABEL    = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

function validIpv4(host) {
  const parts = host.split('.');
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function validHostname(host) {
  if (host === 'localhost') return true;
  const labels = host.split('.');
  return host.length <= 253 && labels.every(l => l.length <= 63 && LABEL.test(l));
}

/**
 * @param {string} input what the user typed
 * @returns {{ ok: true, url: string, host: string } | { ok: false, error: string }}
 */
export function normalizeServerAddress(input) {
  const text = String(input ?? '').trim();

  if (!text) return { ok: false, error: 'Enter your ISP server address, for example 172.16.50.12' };
  if (/\s/.test(text)) return { ok: false, error: 'An address cannot contain spaces.' };

  let withScheme = text;
  if (SCHEME.test(text)) {
    if (!/^https?:\/\//i.test(text)) return { ok: false, error: 'Only http:// or https:// addresses work.' };
  } else if (ODD_SCHEME.test(text)) {
    return { ok: false, error: 'Only http:// or https:// addresses work.' };
  } else {
    withScheme = `http://${text}`;
  }

  // Judge the host as typed: the URL parser rejects or quietly rewrites odd
  // numeric hosts ("172.16.50.999", "172.16.50" -> 172.16.0.50).
  const typedHost = withScheme.replace(SCHEME, '').split(/[/?#]/)[0].replace(/:\d*$/, '').replace(/^\[|\]$/g, '');
  if (/^[\d.]+$/.test(typedHost) && !validIpv4(typedHost)) {
    return { ok: false, error: 'An IP address has four numbers from 0 to 255, like 172.16.50.12' };
  }

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: 'That does not look like an address. Try 172.16.50.12 or http://172.16.50.12/' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Leave the username and password out of the address.' };
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!/^[\d.]+$/.test(typedHost) && !typedHost.includes(':') && !validHostname(host)) {
    return { ok: false, error: 'That host name has characters an address cannot use.' };
  }

  const path = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
  return { ok: true, url: `${parsed.origin}${path}`, host: parsed.host };
}
