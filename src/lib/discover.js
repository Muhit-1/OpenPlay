// src/lib/discover.js
//
// Discovers every library reachable from a single entry address.
//
// A DhakaFlix-style portal is one landing page whose navigation links out to
// libraries spread across several hosts:
//
//   http://172.16.50.12/  ->  English Movies      http://172.16.50.7/DHAKA-FLIX-7/…
//                             English Movies-1080p http://172.16.50.14/DHAKA-FLIX-14/…
//                             TV & WEB Series      http://172.16.50.12/DHAKA-FLIX-12/…
//                             Cartoon TV Series    http://172.16.50.9/DHAKA-FLIX-9/…
//
// So the user gives one address and OpenPlay reads the rest off the page,
// rather than making them paste in six.

import { safeDecode } from './text.js';

/** Labels that are not watchable media, and are dropped from the results. */
const NOT_MEDIA = /\b(game|games|software|tutorial|training|islamic|app|apps|driver|ebook|book)\b/i;

/** Order matters: animation wins over the generic movie/series tests. */
const CATEGORY_TESTS = [
  { category: 'animation', kind: 'tv',    test: /(anime|cartoon|animation)[^a-z]*(tv|series|show)/i },
  { category: 'animation', kind: 'movie', test: /\b(anime|cartoon|animation)\b/i },
  { category: 'series',    kind: 'tv',    test: /\b(tv|web|series|show|drama)\b/i },
  { category: 'movies',    kind: 'movie', test: /\b(movie|movies|film|films|cinema)\b/i },
];

/** Some libraries are real media but shouldn't clutter the main navigation. */
const SECONDARY = /\b(3d|wrestling|wwe|aew|award|awards|documentary|tutorial)\b/i;

function detectQuality(label, url) {
  const text = `${label} ${safeDecode(url)}`;
  if (/2160p|\b4k\b|uhd/i.test(text)) return 2160;
  if (/1080p/i.test(text)) return 1080;
  if (/720p/i.test(text)) return 720;
  return 720;
}

function classify(label) {
  for (const entry of CATEGORY_TESTS) {
    if (entry.test.test(label)) return entry;
  }
  return null;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Pull labelled library links out of a portal page.
 *
 * Anchors are read with their text so the label the ISP already wrote can be
 * reused, which is far more reliable than guessing a name from the URL path.
 */
export function extractLibraries(html, baseUrl) {
  const anchors = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set();
  const libraries = [];

  for (const [, rawHref, rawLabel] of anchors) {
    const label = rawLabel
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!label || label.length > 60) continue;

    let url;
    try {
      url = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;

    // Only directory links are libraries; skip the page's own assets and
    // anything pointing off the local network.
    if (!url.pathname.endsWith('/')) continue;
    if (url.pathname === '/') continue;
    if (/^(www\.)?(youtube|facebook|twitter|instagram|t\.me)\./i.test(url.hostname)) continue;
    if (NOT_MEDIA.test(label)) continue;

    const match = classify(label);
    if (!match) continue;

    const href = url.toString();
    if (seen.has(href)) continue;
    seen.add(href);

    libraries.push({
      key: slugify(label),
      label,
      url: href,
      host: url.host,
      kind: match.kind,
      category: match.category,
      quality: detectQuality(label, href),
      secondary: SECONDARY.test(label),
      ...(match.category === 'animation'
        ? { genres: 'animation|animated|cartoon|anime' }
        : {}),
    });
  }

  // Best copy first, so a 1080p library is searched ahead of its 720p twin.
  libraries.sort((a, b) =>
    a.category.localeCompare(b.category) ||
    Number(a.secondary) - Number(b.secondary) ||
    b.quality - a.quality ||
    a.label.localeCompare(b.label)
  );

  return libraries;
}

/**
 * Fetch a portal page and return the libraries it links to.
 * @returns {Promise<{libraries: Array, error: string|null}>}
 */
export async function discoverLibraries(entryUrl) {
  const url = entryUrl.trim();
  if (!url) return { libraries: [], error: 'Enter an address first.' };

  try {
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { libraries: [], error: body.detail || `Server returned HTTP ${res.status}.` };
    }

    const html = await res.text();
    const libraries = extractLibraries(html, url);

    if (libraries.length === 0) {
      return {
        libraries: [],
        error: 'Reached the server, but found no media library links on that page.',
      };
    }

    // A portal happily lists servers that are switched off. Checking now means
    // the UI can rank the dead ones last instead of failing at browse time.
    const checked = await checkReachability(libraries);

    const offline = checked.filter(l => !l.online).length;
    return {
      libraries: checked,
      error: null,
      warning: offline
        ? `${offline} of ${checked.length} libraries are on servers that did not respond.`
        : null,
    };
  } catch (err) {
    return {
      libraries: [],
      error: err.name === 'TimeoutError'
        ? 'The server did not respond within 20 seconds.'
        : `Could not connect: ${err.message}`,
    };
  }
}

/**
 * Probe one library per host and mark every library on that host accordingly.
 *
 * One request per host, not per library — the hosts are what can be down, and
 * a portal commonly lists a dozen libraries across four machines.
 */
async function checkReachability(libraries, timeoutMs = 6000) {
  const hosts = [...new Set(libraries.map(l => l.host))];

  const status = await Promise.all(
    hosts.map(async host => {
      const sample = libraries.find(l => l.host === host);
      try {
        const res = await fetch(`/api/parse?url=${encodeURIComponent(sample.url)}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        return [host, res.ok];
      } catch {
        return [host, false];
      }
    })
  );

  const online = Object.fromEntries(status);

  return libraries
    .map(lib => ({ ...lib, online: online[lib.host] !== false }))
    // Reachable first, so the default selection is one that works.
    .sort((a, b) =>
      Number(b.online) - Number(a.online) ||
      a.category.localeCompare(b.category) ||
      Number(a.secondary) - Number(b.secondary) ||
      b.quality - a.quality ||
      a.label.localeCompare(b.label)
    );
}
