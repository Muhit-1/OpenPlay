// src/lib/tmdb.js
// Frontend helpers — turn filenames into TMDB metadata and read directories.

import { parseRelease } from './release.js';
import { listDir, clearDirCache } from './server.js';

export { parseRelease };

/** Kept for callers that only need title/year/type. */
export function parseFilename(filename) {
  const r = parseRelease(filename);
  return { title: r.title, year: r.year, type: r.kind };
}

// ── Caching ───────────────────────────────────────────────────────────────
// Promises are cached, not results, so N cards asking for the same title
// during one render produce exactly one request.

const metaCache = new Map();

export function clearMetaCache() {
  metaCache.clear();
  clearDirCache();
}

function getLang() {
  return localStorage.getItem('tmdb_lang') || 'en-US';
}

async function getJSON(path) {
  const res = await fetch(path, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function cached(key, produce) {
  if (metaCache.has(key)) return metaCache.get(key);
  const promise = produce().catch(err => {
    metaCache.delete(key);      // don't cache a transient failure forever
    throw err;
  });
  metaCache.set(key, promise);
  return promise;
}

// ── Metadata ──────────────────────────────────────────────────────────────

/** TMDB metadata for a release name (file or folder). */
export async function fetchMeta(filename) {
  const { title, year, kind } = parseRelease(filename);
  const lang = getLang();

  if (!title) return { found: false, title: filename };

  return cached(`meta|${title}|${year}|${kind}|${lang}`, async () => {
    const params = new URLSearchParams({ title, type: kind, lang });
    if (year) params.set('year', year);
    try {
      return await getJSON(`/api/tmdb?${params}`);
    } catch {
      return { found: false, title };
    }
  });
}

/** TMDB detail by id. */
export function fetchDetail(tmdbId, mediaType = 'movie') {
  const lang = getLang();
  return cached(`detail|${tmdbId}|${mediaType}|${lang}`, () =>
    getJSON(`/api/tmdb?tmdbId=${tmdbId}&mediaType=${mediaType}&lang=${lang}`)
  );
}

export function fetchTrending(mediaType = 'all', timeWindow = 'week', page = 1) {
  const lang = getLang();
  return cached(`trending|${mediaType}|${timeWindow}|${page}|${lang}`, () =>
    getJSON(`/api/tmdb?trending=1&mediaType=${mediaType}&timeWindow=${timeWindow}&page=${page}&lang=${lang}`)
      .then(d => (Array.isArray(d) ? d : []))
      .catch(() => [])
  );
}

export function fetchByGenre(genreId, mediaType = 'movie', page = 1, sortBy = 'popularity.desc') {
  const lang = getLang();
  return cached(`genre|${genreId}|${mediaType}|${page}|${sortBy}|${lang}`, () =>
    getJSON(`/api/tmdb?genre=${genreId}&mediaType=${mediaType}&page=${page}&sortBy=${sortBy}&lang=${lang}`)
      .then(d => (Array.isArray(d) ? d : []))
      .catch(() => [])
  );
}

export function fetchSeasonEpisodes(showId, season) {
  const lang = getLang();
  return cached(`season|${showId}|${season}|${lang}`, () =>
    getJSON(`/api/tmdb?showId=${showId}&season=${season}&lang=${lang}`)
      .then(d => (Array.isArray(d) ? d : []))
      .catch(() => [])
  );
}

/** A person and everything they are credited on. */
export function fetchPerson(personId) {
  const lang = getLang();
  return cached(`person|${personId}|${lang}`, () =>
    getJSON(`/api/tmdb?personId=${personId}&lang=${lang}`).catch(() => ({ found: false }))
  );
}

/** Resolve a person's name to a TMDB id. */
export function fetchPersonByName(name) {
  const lang = getLang();
  return cached(`personName|${name}|${lang}`, () =>
    getJSON(`/api/tmdb?personName=${encodeURIComponent(name)}&lang=${lang}`)
      .catch(() => ({ found: false }))
  );
}

// ── Directory ─────────────────────────────────────────────────────────────

/** Read a directory listing. Shared cache with the server resolver. */
export function fetchDirectory(url) {
  return listDir(url);
}

/** Multi-search: films, series and people in one call. */
export function searchTmdb(query, page = 1) {
  const lang = getLang();
  const q = query.trim();
  if (!q) return Promise.resolve({ titles: [], people: [] });

  return cached(`search|${q}|${page}|${lang}`, () =>
    getJSON(`/api/tmdb?query=${encodeURIComponent(q)}&page=${page}&lang=${lang}`)
      .catch(() => ({ titles: [], people: [] }))
  );
}

/** Everything a studio produced. */
export function fetchCompany(companyId, mediaType = 'movie', page = 1) {
  const lang = getLang();
  return cached(`company|${companyId}|${mediaType}|${page}|${lang}`, () =>
    getJSON(`/api/tmdb?companyId=${companyId}&mediaType=${mediaType}&page=${page}&lang=${lang}`)
      .then(d => (Array.isArray(d) ? d : []))
      .catch(() => [])
  );
}
