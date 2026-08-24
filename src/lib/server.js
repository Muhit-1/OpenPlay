// src/lib/server.js
//
// Finds a title on an open-directory server.
//
// The previous version hardcoded the folder pattern `(YYYY)/`, which only ever
// matched one of the four libraries. The real layouts are inconsistent:
//
//   English Movies/               ->  (2025)/
//   English Movies (1080p)/       ->  (2025) 1080p/
//   Animation Movies/             ->  (2000) & Before/, (2001)/ …
//   Animation Movies (1080p)/     ->  flat, no year folders at all
//   TV-WEB-Series/                ->  alphabetical buckets with decorative glyphs
//
// So nothing is assumed: each library is listed once and its shape is read off
// the actual folder names.

import { titleScore, parseRelease } from './release.js';

const MATCH_THRESHOLD = 0.72;   // below this, treat it as "not on server"
const CONCURRENCY     = 4;

// ── Library registry ──────────────────────────────────────────────────────
// `quality` is used to prefer the better copy when a title exists in several.

export const DEFAULT_LIBRARIES = [
  {
    key: 'english-1080', label: 'English Movies (1080p)', kind: 'movie', quality: 1080,
    url: 'http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20%281080p%29/',
  },
  {
    key: 'english-720', label: 'English Movies', kind: 'movie', quality: 720,
    url: 'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/',
  },
  {
    key: 'animation-1080', label: 'Animation Movies (1080p)', kind: 'movie', quality: 1080,
    url: 'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/',
    genres: /animation|animated|cartoon|anime/i,
  },
  {
    key: 'animation-720', label: 'Animation Movies', kind: 'movie', quality: 720,
    url: 'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies/',
    genres: /animation|animated|cartoon|anime/i,
  },
  {
    key: 'hindi', label: 'Hindi Movies', kind: 'movie', quality: 720,
    url: 'http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/',
  },
  {
    key: 'tv', label: 'TV & Web Series', kind: 'tv', quality: 1080,
    url: 'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/',
  },
];

/**
 * Libraries discovered from the user's portal address, falling back to the
 * built-in DhakaFlix map when discovery has not been run.
 */
export function getLibraries() {
  try {
    const raw = localStorage.getItem('libraries');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_LIBRARIES;
}

export function saveLibraries(libraries) {
  localStorage.setItem('libraries', JSON.stringify(libraries));
  clearDirCache();
}

/** Libraries in one section of the navigation. */
export function librariesFor(category) {
  return getLibraries().filter(lib => (lib.category || inferCategory(lib)) === category);
}

/** Built-in entries predate the category field; derive it from the label. */
function inferCategory(lib) {
  const label = lib.label || '';
  if (/anime|cartoon|animation/i.test(label)) return 'animation';
  if ((lib.kind || 'movie') === 'tv') return 'series';
  return 'movies';
}

// ── Directory listing, cached ─────────────────────────────────────────────

const dirCache = new Map();   // url -> Promise<{folders, files}>

export function clearDirCache() {
  dirCache.clear();
}

export function listDir(url) {
  if (dirCache.has(url)) return dirCache.get(url);

  // Errors are returned, not thrown: a dead branch must not abort a whole
  // search. Callers that need to tell "empty" from "unreachable" read `error`.
  const promise = fetch(`/api/parse?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(15000),
  })
    .then(async res => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { folders: [], files: [], error: body.detail || `HTTP ${res.status}` };
      }
      return res.json();
    })
    .catch(err => ({
      folders: [], files: [],
      error: err.name === 'TimeoutError' ? 'Server did not respond' : err.message,
    }));

  dirCache.set(url, promise);
  return promise;
}

/** Run async work over a list with a cap on in-flight requests. */
async function mapLimit(items, limit, fn) {
  const results = [];
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

// ── Shape detection ───────────────────────────────────────────────────────

const YEAR_IN_NAME = /(19\d{2}|20\d{2})/;

/**
 * Pick the folder that holds a given year.
 * Handles "(2025)", "(2025) 1080p", "2025", and catch-alls like "(2000) & Before".
 */
function pickYearFolder(folders, year) {
  const target = Number(year);

  const exact = folders.find(f => {
    const m = f.name.match(YEAR_IN_NAME);
    return m && Number(m[1]) === target;
  });
  if (exact) return exact;

  // Catch-all buckets: "(1995) 1080p & Before", "(1960-1994)"
  const range = folders.find(f => {
    const range = f.name.match(/(19\d{2}|20\d{2})\s*[-–—]\s*(19\d{2}|20\d{2})/);
    if (range) return target >= Number(range[1]) && target <= Number(range[2]);

    const before = f.name.match(/(19\d{2}|20\d{2})[^\d]*&?\s*before/i);
    return before && target <= Number(before[1]);
  });
  return range || null;
}

/** True when a library's folders are year buckets rather than titles. */
function looksLikeYearIndex(folders) {
  if (folders.length === 0) return false;
  const yearish = folders.filter(f => /^[([]?\s*(19\d{2}|20\d{2})/.test(f.name.trim())).length;
  return yearish / folders.length > 0.5;
}

/**
 * Alphabetical buckets, e.g. "TV Series ♥  A  —  L".
 * The glyphs are decorative and change; only the letter range is read.
 */
function pickAlphaBucket(folders, title) {
  const first = (title.replace(/^(the|a|an)\s+/i, '').trim()[0] || '').toUpperCase();
  if (!first) return null;

  const isDigit = /[0-9]/.test(first);

  for (const folder of folders) {
    const range = folder.name.match(/(\d|[A-Z])\s*[—–-]\s*(\d|[A-Z])/i);
    if (!range) continue;

    const [, lo, hi] = range;
    if (isDigit && /\d/.test(lo)) return folder;
    if (!isDigit && /[A-Z]/i.test(lo)) {
      if (first >= lo.toUpperCase() && first <= hi.toUpperCase()) return folder;
    }
  }
  return null;
}

// ── Matching ──────────────────────────────────────────────────────────────

/** Score a folder or file name against a wanted title, using the release parser. */
function scoreEntry(entryName, wantedTitle, wantedYear) {
  const parsed = parseRelease(entryName);
  let score = titleScore(parsed.title, wantedTitle);

  // A year that disagrees is strong evidence this is a different film.
  if (wantedYear && parsed.year) {
    const gap = Math.abs(Number(parsed.year) - Number(wantedYear));
    if (gap === 0) score += 0.15;
    else if (gap > 1) score -= 0.35;
  }
  return { score: Math.min(score, 1), parsed };
}

function bestMatch(entries, title, year) {
  let best = null;
  for (const entry of entries) {
    const { score, parsed } = scoreEntry(entry.name, title, year);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { entry, score, parsed };
    }
  }
  return best;
}

/**
 * Resolve a folder to the video file inside it.
 * Descends one level for season folders, and prefers the largest file when a
 * folder holds both a feature and extras.
 */
export async function resolveToVideo(folderUrl, depth = 2) {
  const data = await listDir(folderUrl);

  const videos = data.files.filter(f => f.type === 'video');
  if (videos.length) {
    const sorted = [...videos].sort((a, b) => sizeBytes(b.size) - sizeBytes(a.size));
    return { url: sorted[0].url, file: sorted[0], siblings: videos };
  }

  if (depth > 0) {
    for (const sub of data.folders.slice(0, 4)) {
      const found = await resolveToVideo(sub.url, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

/** "901772 KB" / "8.1 GB" -> bytes. Unknown sizes sort last. */
function sizeBytes(size) {
  if (!size) return 0;
  const m = String(size).match(/([\d.]+)\s*(B|KB|MB|GB|TB|K|M|G|T)/i);
  if (!m) return 0;
  const units = { b: 1, k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9, t: 1e12, tb: 1e12 };
  return parseFloat(m[1]) * (units[m[2].toLowerCase()] || 1);
}

// ── Public search ─────────────────────────────────────────────────────────

/**
 * Search one library for a title.
 * @returns {Promise<{url, entry, score, library}|null>}
 */
export async function searchLibrary(library, title, year) {
  const root = await listDir(library.url);
  if (!root.folders.length && !root.files.length) return null;

  // TV libraries are split into alphabetical buckets.
  if (library.kind === 'tv') {
    const bucket = pickAlphaBucket(root.folders, title);
    const order  = bucket ? [bucket, ...root.folders.filter(f => f !== bucket)] : root.folders;

    for (const folder of order.slice(0, 8)) {
      const data  = await listDir(folder.url);
      const match = bestMatch(data.folders, title, year);
      if (match) return { url: match.entry.url, entry: match.entry, score: match.score, library };
    }
    return null;
  }

  // Movie libraries are either year-indexed or flat.
  if (looksLikeYearIndex(root.folders)) {
    const candidates = [];

    if (year) {
      const yearFolder = pickYearFolder(root.folders, year);
      if (yearFolder) candidates.push(yearFolder);
    } else {
      candidates.push(...root.folders);
    }

    const searched = await mapLimit(candidates.slice(0, 40), CONCURRENCY, async folder => {
      const data = await listDir(folder.url);
      return bestMatch([...data.folders, ...data.files.filter(f => f.type === 'video')], title, year);
    });

    const hit = searched.filter(Boolean).sort((a, b) => b.score - a.score)[0];
    return hit ? { url: hit.entry.url, entry: hit.entry, score: hit.score, library } : null;
  }

  // Flat library — titles sit directly in the root.
  const match = bestMatch(
    [...root.folders, ...root.files.filter(f => f.type === 'video')],
    title, year
  );
  return match ? { url: match.entry.url, entry: match.entry, score: match.score, library } : null;
}

/**
 * Search every relevant library and return the best copy.
 *
 * Libraries are tried highest-quality-first, but all matching libraries are
 * searched so a 1080p copy wins over a 720p one even when the 720p library
 * would have answered sooner.
 */
export async function findOnServer(title, { year = null, kind = 'movie', genres = [] } = {}) {
  const genreText = genres.join(' ');

  const relevant = getLibraries()
    .filter(lib => (lib.kind || 'movie') === kind)
    .filter(lib => {
      if (!lib.genres) return true;
      const re = lib.genres instanceof RegExp ? lib.genres : new RegExp(lib.genres, 'i');
      return re.test(genreText);
    });

  // A genre-specific library (animation) is a stronger signal than a general one.
  const ordered = [...relevant].sort((a, b) => {
    const specific = (b.genres ? 1 : 0) - (a.genres ? 1 : 0);
    return specific !== 0 ? specific : (b.quality || 0) - (a.quality || 0);
  });

  const results = await mapLimit(ordered, 2, lib =>
    searchLibrary(lib, title, year).catch(() => null)
  );

  const hits = results.filter(Boolean);
  if (!hits.length) return null;

  hits.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.05) return b.score - a.score;
    return (b.library.quality || 0) - (a.library.quality || 0);
  });

  const best = hits[0];

  // Folder hits still need resolving to an actual playable file.
  const isVideoFile = /\.(mkv|mp4|avi|mov|webm|ts|m4v|m2ts)$/i.test(best.url);
  if (isVideoFile) {
    return { ...best, videoUrl: best.url, file: best.entry, siblings: [best.entry] };
  }

  const resolved = await resolveToVideo(best.url);
  return {
    ...best,
    videoUrl: resolved?.url || null,
    file: resolved?.file || null,
    siblings: resolved?.siblings || [],
    folderUrl: best.url,
  };
}

// ── Browsing a library as titles ──────────────────────────────────────────
//
// The pages under Movies / Series / Animation must show titles, never raw
// directory buckets. A library is therefore read in two steps: work out how it
// is indexed, then list the titles inside one index section.

/**
 * Describe how a library is organised.
 * @returns {Promise<{shape:'years'|'alpha'|'flat', sections:Array, error:string|null}>}
 */
export async function libraryIndex(library) {
  const root = await listDir(library.url);
  if (root.error) return { shape: 'flat', sections: [], error: root.error };

  if (looksLikeYearIndex(root.folders)) {
    const sections = root.folders
      .map(folder => ({
        key: folder.url,
        url: folder.url,
        // "(2025) 1080p" reads better in a tab strip as just "2025".
        label: sectionLabel(folder.name),
        sort: Number((folder.name.match(YEAR_IN_NAME) || [])[1] || 0),
      }))
      .sort((a, b) => b.sort - a.sort);

    return { shape: 'years', sections, error: null };
  }

  // Alphabetical buckets look like "TV Series ♥  A — L".
  const alpha = root.folders.filter(f => /(\d|[A-Z])\s*[—–-]\s*(\d|[A-Z])/i.test(f.name));
  if (alpha.length >= 2 && alpha.length === root.folders.length) {
    return {
      shape: 'alpha',
      sections: alpha.map(folder => ({
        key: folder.url,
        url: folder.url,
        label: sectionLabel(folder.name),
        sort: 0,
      })),
      error: null,
    };
  }

  // Flat: the titles are the root's own folders.
  return {
    shape: 'flat',
    sections: [{ key: library.url, url: library.url, label: 'All', sort: 0 }],
    error: null,
  };
}

/** Strip decoration from an index folder name: "(2025) 1080p" -> "2025". */
function sectionLabel(name) {
  const year = name.match(YEAR_IN_NAME);
  if (year) {
    const before = /before/i.test(name) ? ' & earlier' : '';
    const range = name.match(/(19\d{2}|20\d{2})\s*[-–—]\s*(19\d{2}|20\d{2})/);
    if (range) return `${range[1]}–${range[2]}`;
    return year[1] + before;
  }

  // "TV Series ♥  A — L" -> "A — L"
  const alpha = name.match(/(\d|[A-Z])\s*[—–-]\s*(\d|[A-Z])/i);
  if (alpha) return `${alpha[1].toUpperCase()} – ${alpha[2].toUpperCase()}`;

  return name;
}

/**
 * List the titles in one section of a library.
 *
 * Both sub-folders (a title in its own folder) and loose video files count as
 * titles; either way the card gets something playable to resolve.
 */
export async function libraryTitles(sectionUrl) {
  const data = await listDir(sectionUrl);
  if (data.error) return { titles: [], error: data.error };

  const titles = [
    ...data.folders.map(f => ({ ...f, type: 'folder' })),
    ...data.files.filter(f => f.type === 'video'),
  ];

  return { titles, error: null };
}
