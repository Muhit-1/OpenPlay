// api/tmdb.js — Vercel Serverless Function
// Supports:
//   ?title=...&type=movie|tv&year=...&lang=...       → search + detail (existing)
//   ?trending=1&mediaType=all|movie|tv&timeWindow=.. → trending list (existing)
//   ?showId=...&season=...                           → TV season episodes (existing)
//   ?tmdbId=...&mediaType=movie|tv                   → fetch detail by TMDB id (NEW)
//   ?genre=...&mediaType=movie|tv&lang=...           → fetch by genre id (NEW)

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'TMDB_API_KEY not configured' });

  const {
    title, year, type = 'movie', lang = 'en-US',
    trending, mediaType = 'all', timeWindow = 'week',
    showId, season,
    tmdbId,   // NEW: direct detail lookup
    genre,    // NEW: genre row fetch
  } = req.query;

  // ── NEW: Detail by TMDB id ────────────────────────────────────────────
  if (tmdbId) {
    const mt = mediaType === 'tv' ? 'tv' : 'movie';
    try {
      const detailUrl = `${TMDB_BASE}/${mt}/${tmdbId}?api_key=${apiKey}&append_to_response=credits&language=${lang}`;
      const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
      if (!detailRes.ok) return res.status(detailRes.status).json({ error: 'TMDB detail fetch failed' });
      const detail = await detailRes.json();

      const cast = (detail.credits?.cast || []).slice(0, 12).map(c => ({
        id:        c.id,
        name:      c.name,
        character: c.character,
        profile:   c.profile_path ? `${TMDB_IMG}${c.profile_path}` : null,
      }));
      const crew      = detail.credits?.crew || [];
      const directors = crew.filter(c => c.job === 'Director').map(c => c.name);
      const studios   = (detail.production_companies || []).map(c => c.name);
      const genres    = (detail.genres || []).map(g => g.name);

      return res.status(200).json({
        found:         true,
        id:            detail.id,
        type:          mt,
        title:         detail.title || detail.name,
        originalTitle: detail.original_title || detail.original_name,
        overview:      detail.overview,
        year:          (detail.release_date || detail.first_air_date || '').slice(0, 4),
        rating:        detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null,
        poster:        detail.poster_path   ? `${TMDB_IMG}${detail.poster_path}`              : null,
        backdrop:      detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
        runtime:       detail.runtime || null,
        seasons:       detail.number_of_seasons || null,
        genres, studios, directors, cast,
      });
    } catch (err) {
      return res.status(502).json({ error: 'TMDB detail request failed', detail: err.message });
    }
  }

  // ── NEW: Genre rows ───────────────────────────────────────────────────
  if (genre) {
    const mt = mediaType === 'tv' ? 'tv' : 'movie';
    try {
      const url = `${TMDB_BASE}/discover/${mt}?api_key=${apiKey}&with_genres=${genre}&language=${lang}&sort_by=popularity.desc&page=1`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.status(r.status).json({ error: 'TMDB genre fetch failed' });
      const d   = await r.json();
      const items = (d.results || []).slice(0, 20).map(item => ({
        id:     item.id,
        type:   mt,
        title:  item.title || item.name,
        year:   (item.release_date || item.first_air_date || '').slice(0, 4),
        rating: item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
        poster: item.poster_path  ? `${TMDB_IMG}${item.poster_path}` : null,
      }));
      return res.status(200).json(items);
    } catch (err) {
      return res.status(502).json({ error: 'Genre fetch failed', detail: err.message });
    }
  }

  // ── Trending endpoint ─────────────────────────────────────────────────
  if (trending) {
    const mt = mediaType === 'all' ? 'all' : mediaType;
    try {
      const url = `${TMDB_BASE}/trending/${mt}/${timeWindow}?api_key=${apiKey}&language=${lang}`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.status(r.status).json({ error: 'TMDB trending failed' });
      const d   = await r.json();
      const items = (d.results || []).slice(0, 20).map(item => ({
        id:       item.id,
        type:     item.media_type,
        title:    item.title || item.name,
        year:     (item.release_date || item.first_air_date || '').slice(0, 4),
        rating:   item.vote_average ? Math.round(item.vote_average * 10) / 10 : null,
        poster:   item.poster_path  ? `${TMDB_IMG}${item.poster_path}`  : null,
        backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
        overview: item.overview || '',
      }));
      return res.status(200).json(items);
    } catch (err) {
      return res.status(502).json({ error: 'Trending request failed', detail: err.message });
    }
  }

  // ── TV season episodes endpoint ───────────────────────────────────────
  if (showId && season) {
    try {
      const url = `${TMDB_BASE}/tv/${showId}/season/${season}?api_key=${apiKey}&language=${lang}`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.status(r.status).json({ error: 'TMDB season fetch failed' });
      const d   = await r.json();
      return res.status(200).json(d.episodes || []);
    } catch (err) {
      return res.status(502).json({ error: 'Season fetch failed', detail: err.message });
    }
  }

  // ── Search + detail endpoint (existing) ──────────────────────────────
  if (!title) return res.status(400).json({ error: 'Missing title parameter' });

  const endpoint  = type === 'tv' ? 'search/tv' : 'search/movie';
  const yearParam = year ? (type === 'tv' ? `&first_air_date_year=${year}` : `&year=${year}`) : '';
  const searchUrl = `${TMDB_BASE}/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(title)}${yearParam}&language=${lang}&page=1`;

  try {
    const searchRes  = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) return res.status(searchRes.status).json({ error: 'TMDB search failed' });

    const searchData = await searchRes.json();
    const results    = searchData.results || [];
    if (results.length === 0) return res.status(200).json({ found: false, title });

    const item       = results[0];
    const id         = item.id;
    const mediaType2 = type === 'tv' ? 'tv' : 'movie';

    const detailUrl  = `${TMDB_BASE}/${mediaType2}/${id}?api_key=${apiKey}&append_to_response=credits&language=${lang}`;
    const detailRes  = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
    const detail     = await detailRes.json();

    const cast = (detail.credits?.cast || []).slice(0, 10).map(c => ({
      id:        c.id,
      name:      c.name,
      character: c.character,
      profile:   c.profile_path ? `${TMDB_IMG}${c.profile_path}` : null,
    }));
    const crew      = detail.credits?.crew || [];
    const directors = crew.filter(c => c.job === 'Director').map(c => c.name);
    const studios   = (detail.production_companies || []).map(c => c.name);
    const genres    = (detail.genres || []).map(g => g.name);

    return res.status(200).json({
      found:         true,
      id,
      type:          mediaType2,
      title:         detail.title || detail.name,
      originalTitle: detail.original_title || detail.original_name,
      overview:      detail.overview,
      year:          (detail.release_date || detail.first_air_date || '').slice(0, 4),
      rating:        detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null,
      poster:        detail.poster_path   ? `${TMDB_IMG}${detail.poster_path}`              : null,
      backdrop:      detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
      runtime:       detail.runtime || null,
      seasons:       detail.number_of_seasons || null,
      genres, studios, directors, cast,
    });
  } catch (err) {
    return res.status(502).json({ error: 'TMDB request failed', detail: err.message });
  }
}