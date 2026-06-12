// src/lib/tmdb.js
// Frontend helpers — clean filenames and call /api/tmdb

/**
 * Strip scene-release cruft from a filename and return { title, year, type }.
 * Examples:
 *   "Kung.Fu.Panda.3.2016.1080p.BluRay.mkv" → { title: "Kung Fu Panda 3", year: "2016", type: "movie" }
 *   "Breaking.Bad.S01E01.1080p.mkv"          → { title: "Breaking Bad", year: null, type: "tv" }
 */
export function parseFilename(filename) {
  // Remove extension
  let name = filename.replace(/\.[a-z0-9]{2,4}$/i, '');

  // Detect TV series: SxxExx or x x
  const tvMatch = name.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
  const isTv    = !!tvMatch;

  // Pull year (4-digit number between 1900-2099)
  const yearMatch = name.match(/\b(19\d{2}|20\d{2})\b/);
  const year      = yearMatch ? yearMatch[1] : null;

  // Everything before the year / episode marker / quality tag is the title
  let titlePart = name;
  if (tvMatch)    titlePart = name.slice(0, tvMatch.index);
  else if (year)  titlePart = name.slice(0, yearMatch.index);
  else {
    // Fallback: cut at common quality tags
    const cutMatch = titlePart.match(/\b(1080p|720p|480p|2160p|4K|BluRay|WEB-DL|HDTV|DVDRIP|HDRip)\b/i);
    if (cutMatch) titlePart = titlePart.slice(0, cutMatch.index);
  }

  // Replace dots/underscores with spaces, trim
  const title = titlePart.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

  return { title, year, type: isTv ? 'tv' : 'movie' };
}

// In-memory cache so we don't hammer the API for the same title
const metaCache = new Map();

/**
 * Fetch TMDB metadata for a filename.
 * Returns the API response object (with `found` bool).
 */
export async function fetchMeta(filename) {
  const { title, year, type } = parseFilename(filename);
  const cacheKey = `${title}|${year}|${type}`;

  if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);

  const params = new URLSearchParams({ title, type });
  if (year) params.set('year', year);

  try {
    const res  = await fetch(`/api/tmdb?${params}`);
    const data = await res.json();
    metaCache.set(cacheKey, data);
    return data;
  } catch {
    const fallback = { found: false, title };
    metaCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Fetch a whole directory listing from /api/parse.
 */
export async function fetchDirectory(url) {
  const res  = await fetch(`/api/parse?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Directory fetch failed: ${res.status}`);
  return res.json(); // { folders: [], files: [] }
}