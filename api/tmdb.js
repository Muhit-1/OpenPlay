// api/tmdb.js — Vercel Serverless Function
// Talks to TMDB API and returns enriched metadata.
// Expects query params: ?title=Kung+Fu+Panda&year=2016&type=movie   (type: movie | tv)

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB_API_KEY not configured' });
  }

  const { title, year, type = 'movie' } = req.query;

  if (!title) {
    return res.status(400).json({ error: 'Missing title parameter' });
  }

  const endpoint = type === 'tv' ? 'search/tv' : 'search/movie';
  const yearParam = year ? (type === 'tv' ? `&first_air_date_year=${year}` : `&year=${year}`) : '';

  const searchUrl = `${TMDB_BASE}/${endpoint}?api_key=${apiKey}&query=${encodeURIComponent(title)}${yearParam}&language=en-US&page=1`;

  try {
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    if (!searchRes.ok) {
      return res.status(searchRes.status).json({ error: 'TMDB search failed' });
    }

    const searchData = await searchRes.json();
    const results = searchData.results || [];

    if (results.length === 0) {
      return res.status(200).json({ found: false, title });
    }

    // Pick the best result — first hit is usually correct with a year param
    const item = results[0];
    const id   = item.id;
    const mediaType = type === 'tv' ? 'tv' : 'movie';

    // Fetch full details + credits in one go
    const detailUrl = `${TMDB_BASE}/${mediaType}/${id}?api_key=${apiKey}&append_to_response=credits&language=en-US`;
    const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) });
    const detail = await detailRes.json();

    const cast = (detail.credits?.cast || []).slice(0, 10).map(c => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profile: c.profile_path ? `${TMDB_IMG}${c.profile_path}` : null,
    }));

    const crew = (detail.credits?.crew || []);
    const directors = crew.filter(c => c.job === 'Director').map(c => c.name);
    const studios   = (detail.production_companies || []).map(c => c.name);
    const genres    = (detail.genres || []).map(g => g.name);

    const payload = {
      found: true,
      id,
      type: mediaType,
      title: detail.title || detail.name,
      originalTitle: detail.original_title || detail.original_name,
      overview: detail.overview,
      year: (detail.release_date || detail.first_air_date || '').slice(0, 4),
      rating: detail.vote_average ? Math.round(detail.vote_average * 10) / 10 : null,
      poster: detail.poster_path  ? `${TMDB_IMG}${detail.poster_path}`  : null,
      backdrop: detail.backdrop_path ? `https://image.tmdb.org/t/p/w1280${detail.backdrop_path}` : null,
      runtime: detail.runtime || null,         // minutes (movies)
      seasons: detail.number_of_seasons || null, // tv
      genres,
      studios,
      directors,
      cast,
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[tmdb] error:', err.message);
    return res.status(502).json({ error: 'TMDB request failed', detail: err.message });
  }
}