// api/parse.js — Vercel Serverless Function
//
// Parses an open-directory HTML listing into JSON.
// Handles h5ai (the DhakaFlix stack), Apache, nginx and lighttpd layouts.

import { parse } from 'node-html-parser';
import { fetchText } from './_lib/safe-fetch.js';
import { preflight } from './_lib/http.js';

const VIDEO_EXT = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mpg', 'mpeg',
  'm2ts', 'ogv', '3gp', 'divx', 'rmvb', 'm3u8',
]);
const SUB_EXT = new Set(['srt', 'vtt', 'ass', 'ssa', 'sub']);

// Links that are part of the listing UI rather than the directory contents.
// Note: only a bare "/" is chrome — h5ai emits real entries as root-absolute
// paths like /DHAKA-FLIX-14/..., which must NOT be filtered here.
const CHROME_EXACT  = new Set(['/', '..', '../', '.', './']);
const CHROME_PREFIX = /^(#|\?|javascript:|mailto:|data:)/i;
const ASSET_PATH  = /\/_h5ai\/|\/icons\/|\/\.well-known\//i;
const EXTERNAL    = /^(https?:)?\/\/(fonts\.|larsjung\.de|browsehappy\.com)/i;

/** Collapse whitespace in text that came out of the DOM. */
function squash(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeDecode(str) {
  try { return decodeURIComponent(str); } catch { return str; }
}

/**
 * Resolve an href against the listing URL.
 * h5ai emits root-absolute paths (/DHAKA-FLIX-14/...), Apache emits relative ones.
 */
function resolveUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Pull the size and last-modified cells out of the table row an <a> sits in.
 * Purely additive — listings without a table still parse fine.
 */
function rowMetadata(anchor) {
  const row = anchor.closest('tr');
  if (!row) return { date: null, size: null };

  const cells = row.querySelectorAll('td, th').map(c => squash(c.text));
  const date = cells.find(c => /^\d{4}-\d{2}-\d{2}/.test(c)) || null;
  const size = cells.find(c => /^[\d.]+\s*(B|KB|MB|GB|TB|K|M|G|T)$/i.test(c)) || null;
  return { date, size };
}

/** True if `url` is on the same origin as `baseUrl` and at or below its directory. */
function withinDirectory(url, baseUrl) {
  const target = new URL(url);
  const dir    = new URL('.', baseUrl);
  return target.origin === dir.origin && target.pathname.startsWith(dir.pathname);
}

export function parseDirectoryHTML(html, baseUrl) {
  const folders = [];
  const files   = [];
  const seen    = new Set();

  const root = parse(String(html));

  for (const anchor of root.querySelectorAll('a[href]')) {
    const rawHref = (anchor.getAttribute('href') || '').trim();
    const label   = squash(anchor.text);

    if (!rawHref) continue;
    if (CHROME_EXACT.has(rawHref)) continue;
    if (CHROME_PREFIX.test(rawHref)) continue;
    if (ASSET_PATH.test(rawHref)) continue;
    if (EXTERNAL.test(rawHref)) continue;
    if (/^(parent directory|\.\.)$/i.test(label)) continue;

    const absoluteUrl = resolveUrl(rawHref, baseUrl);
    if (!absoluteUrl) continue;

    // Never walk above (or away from) the directory we were asked to read.
    if (!withinDirectory(absoluteUrl, baseUrl)) continue;
    if (absoluteUrl.replace(/\/$/, '') === baseUrl.replace(/\/$/, '')) continue;
    if (seen.has(absoluteUrl)) continue;
    seen.add(absoluteUrl);

    const { date, size } = rowMetadata(anchor);
    const pathPart = absoluteUrl.split('?')[0].split('#')[0];

    if (rawHref.endsWith('/') || pathPart.endsWith('/')) {
      const name  = safeDecode(pathPart.replace(/\/$/, '').split('/').pop());
      const clean = label.replace(/\/$/, '').trim();
      folders.push({ type: 'folder', name: clean || name, url: absoluteUrl, date });
    } else {
      const name = safeDecode(pathPart.split('/').pop());
      const ext  = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

      if (VIDEO_EXT.has(ext)) {
        files.push({ type: 'video', name, url: absoluteUrl, ext, size, date });
      } else if (SUB_EXT.has(ext)) {
        files.push({ type: 'subtitle', name, url: absoluteUrl, ext, size, date });
      }
      // Everything else (posters, .nfo, checksums) is intentionally dropped.
    }
  }

  return { folders, files };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;

  const { url } = req.query;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url parameter' });

  try {
    // Direct call — no HTTP round-trip back into our own /api/proxy.
    const html   = await fetchText(url);
    const result = parseDirectoryHTML(html, url);
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 502;
    console.error('[parse]', status, err.message);
    return res.status(status).json({ error: 'Parse failed', detail: err.message });
  }
}
