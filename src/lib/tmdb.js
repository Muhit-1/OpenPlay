// src/lib/tmdb.js
// Frontend helpers — clean filenames and call /api/tmdb

/**
 * Strip scene-release cruft from a filename and return { title, year, type }.
 */
export function parseFilename(filename) {
  let name = filename.replace(/\.[a-z0-9]{2,4}$/i, '');
  const tvMatch = name.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
  const isTv    = !!tvMatch;
  const yearMatch = name.match(/\b(19\d{2}|20\d{2})\b/);
  const year      = yearMatch ? yearMatch[1] : null;

  let titlePart = name;
  if (tvMatch)    titlePart = name.slice(0, tvMatch.index);
  else if (year)  titlePart = name.slice(0, yearMatch.index);
  else {
    const cutMatch = titlePart.match(/\b(1080p|720p|480p|2160p|4K|BluRay|WEB-DL|HDTV|DVDRIP|HDRip)\b/i);
    if (cutMatch) titlePart = titlePart.slice(0, cutMatch.index);
  }
  const title = titlePart.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, year, type: isTv ? 'tv' : 'movie' };
}

// In-memory cache
const metaCache = new Map();

/**
 * Get the user's preferred TMDB language from localStorage.
 */
function getTmdbLang() {
  return localStorage.getItem('tmdb_lang') || 'en-US';
}

/**
 * Fetch TMDB metadata for a filename.
 */
export async function fetchMeta(filename) {
  const { title, year, type } = parseFilename(filename);
  const lang = getTmdbLang();
  const cacheKey = `${title}|${year}|${type}|${lang}`;

  if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);

  const params = new URLSearchParams({ title, type, lang });
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
 * Fetch TMDB trending titles (week).
 * Returns array of { id, title, type, poster, backdrop, year, rating, overview }
 */
export async function fetchTrending(mediaType = 'all', timeWindow = 'week') {
  const cacheKey = `trending_${mediaType}_${timeWindow}`;
  if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);
  try {
    const res = await fetch(`/api/tmdb?trending=1&mediaType=${mediaType}&timeWindow=${timeWindow}`);
    const data = await res.json();
    metaCache.set(cacheKey, data);
    return data;
  } catch {
    return [];
  }
}

/**
 * Fetch TMDB episode details for a TV show season.
 * Returns array of episode objects with name, overview, rating, runtime, still
 */
export async function fetchSeasonEpisodes(showId, season) {
  const cacheKey = `episodes_${showId}_s${season}`;
  if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);
  try {
    const res = await fetch(`/api/tmdb?showId=${showId}&season=${season}`);
    const data = await res.json();
    metaCache.set(cacheKey, data);
    return data;
  } catch {
    return [];
  }
}

/**
 * Fetch a whole directory listing from /api/parse.
 */
export async function fetchDirectory(url) {
  const res = await fetch(`/api/parse?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Directory fetch failed: ${res.status}`);
  return res.json();
}