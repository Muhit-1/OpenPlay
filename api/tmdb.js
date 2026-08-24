// api/tmdb.js — Vercel Serverless Function
//
// Query modes:
//   ?title=…&type=movie|tv&year=…&lang=…    search, ranked, then full detail
//   ?tmdbId=…&mediaType=movie|tv            detail by id
//   ?trending=1&mediaType=…&timeWindow=…    trending list
//   ?genre=…&mediaType=…&page=…             discover by genre
//   ?showId=…&season=…                      season episode list
//   ?personId=…                             person + their credits
//   ?personName=…                           resolve a name to a person id
//   ?query=…                                multi-search: films, series, people
//   ?companyId=…                            a studio's catalogue

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG       = 'https://image.tmdb.org/t/p';
const TIMEOUT   = 8000;

const poster   = p => (p ? `${IMG}/w500${p}`  : null);
const backdrop = p => (p ? `${IMG}/w1280${p}` : null);
const still    = p => (p ? `${IMG}/w300${p}`  : null);
const profile  = p => (p ? `${IMG}/w185${p}`  : null);
const round1   = n => (n ? Math.round(n * 10) / 10 : null);

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) {
    const err = new Error(`TMDB ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Title matching ────────────────────────────────────────────────────────
// Mirrors src/lib/release.js. Serverless functions are bundled separately from
// the client, so the two cannot share a module — keep these in sync.

function normaliseTitle(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleScore(candidate, wanted) {
  const a = normaliseTitle(candidate);
  const b = normaliseTitle(wanted);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b + ' ') || b.startsWith(a + ' ')) return 0.72;

  const aWords = a.split(' ');
  const bWords = new Set(b.split(' '));
  const hits   = aWords.filter(w => bWords.has(w)).length;
  const recall = hits / Math.max(aWords.length, bWords.size);
  return recall >= 0.8 ? 0.65 * recall : recall * 0.5;
}

/**
 * Rank search results instead of blindly taking the first one.
 *
 * TMDB orders by internal relevance, which frequently puts a same-named
 * documentary or short above the film the user actually wants. Title match
 * dominates; year agreement and popularity break ties.
 */
function rankResults(results, wantedTitle, wantedYear) {
  return results
    .map(item => {
      const name = item.title || item.name || '';
      const alt  = item.original_title || item.original_name || '';
      const date = item.release_date || item.first_air_date || '';
      const year = date.slice(0, 4);

      const nameScore = Math.max(titleScore(name, wantedTitle), titleScore(alt, wantedTitle));

      let yearScore = 0;
      if (wantedYear && year) {
        const gap = Math.abs(Number(year) - Number(wantedYear));
        // A year of drift between a film and its rip is normal.
        yearScore = gap === 0 ? 1 : gap === 1 ? 0.6 : gap <= 2 ? 0.2 : -0.6;
      }

      const popScore = Math.min((item.popularity || 0) / 200, 1);

      return {
        item,
        score: nameScore * 3 + yearScore * 1.5 + popScore * 0.4,
        nameScore,
      };
    })
    // A weak title match is never the right answer, however popular it is.
    .filter(r => r.nameScore >= 0.5)
    .sort((a, b) => b.score - a.score);
}

// ── Shapers ───────────────────────────────────────────────────────────────

function shapeDetail(detail, mediaType) {
  const credits = detail.credits || {};
  const crew    = credits.crew || [];
  const cast    = (credits.cast || []).slice(0, 16).map(c => ({
    id: c.id, name: c.name, character: c.character, profile: profile(c.profile_path),
  }));

  return {
    found:         true,
    id:            detail.id,
    type:          mediaType,
    title:         detail.title || detail.name,
    originalTitle: detail.original_title || detail.original_name,
    overview:      detail.overview,
    tagline:       detail.tagline || null,
    year:          (detail.release_date || detail.first_air_date || '').slice(0, 4),
    rating:        round1(detail.vote_average),
    votes:         detail.vote_count || 0,
    poster:        poster(detail.poster_path),
    backdrop:      backdrop(detail.backdrop_path),
    runtime:       detail.runtime || detail.episode_run_time?.[0] || null,
    seasons:       detail.number_of_seasons || null,
    episodes:      detail.number_of_episodes || null,
    status:        detail.status || null,
    genres:        (detail.genres || []).map(g => g.name),
    genreIds:      (detail.genres || []).map(g => g.id),
    studios:       (detail.production_companies || []).map(c => ({ id: c.id, name: c.name })),
    directors:     crew.filter(c => c.job === 'Director').map(c => c.name),
    writers:       crew.filter(c => /^(Writer|Screenplay)$/.test(c.job)).map(c => c.name),
    cast,
  };
}

function shapeListItem(item, fallbackType) {
  return {
    id:       item.id,
    type:     item.media_type || fallbackType,
    title:    item.title || item.name,
    year:     (item.release_date || item.first_air_date || '').slice(0, 4),
    rating:   round1(item.vote_average),
    poster:   poster(item.poster_path),
    backdrop: item.backdrop_path ? `${IMG}/w780${item.backdrop_path}` : null,
    overview: item.overview || '',
  };
}

// ── Handler ───────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.TMDB_API_KEY) {
    return res.status(500).json({ error: 'TMDB_API_KEY not configured' });
  }

  const {
    title, year, type = 'movie', lang = 'en-US',
    trending, mediaType = 'all', timeWindow = 'week',
    showId, season, tmdbId, genre, personId, personName,
    query, companyId,
    page = '1', sortBy = 'popularity.desc',
  } = req.query;

  // Lists change slowly; detail lookups are effectively immutable.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  try {
    // ── Detail by id ──
    if (tmdbId) {
      const mt = mediaType === 'tv' ? 'tv' : 'movie';
      const detail = await tmdb(`/${mt}/${tmdbId}`, { append_to_response: 'credits', language: lang });
      return res.status(200).json(shapeDetail(detail, mt));
    }

    // ── Multi-search: what the search box actually needs ──
    if (query) {
      const data = await tmdb('/search/multi', { query, language: lang, page });
      const results = data.results || [];

      return res.status(200).json({
        titles: results
          .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
          .map(r => shapeListItem(r, r.media_type)),
        people: results
          .filter(r => r.media_type === 'person')
          .slice(0, 12)
          .map(p => ({
            id: p.id,
            name: p.name,
            profile: profile(p.profile_path),
            knownFor: p.known_for_department || null,
            credits: (p.known_for || []).map(k => k.title || k.name).filter(Boolean).slice(0, 3),
          })),
        totalPages: data.total_pages || 1,
      });
    }

    // ── A studio's catalogue ──
    if (companyId) {
      const mt = mediaType === 'tv' ? 'tv' : 'movie';
      const data = await tmdb(`/discover/${mt}`, {
        with_companies: companyId, language: lang, sort_by: sortBy, page,
      });
      return res.status(200).json((data.results || []).map(i => shapeListItem(i, mt)));
    }

    // ── Person: name → id ──
    if (personName) {
      const data = await tmdb('/search/person', { query: personName, language: lang });
      const hit  = (data.results || [])[0];
      if (!hit) return res.status(200).json({ found: false });
      return res.status(200).json({
        found: true, id: hit.id, name: hit.name, profile: profile(hit.profile_path),
      });
    }

    // ── Person: id → credits ──
    if (personId) {
      const [person, credits] = await Promise.all([
        tmdb(`/person/${personId}`, { language: lang }),
        tmdb(`/person/${personId}/combined_credits`, { language: lang }),
      ]);
      const items = [...(credits.cast || []), ...(credits.crew || [])]
        .filter(c => c.media_type === 'movie' || c.media_type === 'tv')
        .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 60)
        .map(c => shapeListItem(c, c.media_type));

      return res.status(200).json({
        found: true,
        id: person.id,
        name: person.name,
        biography: person.biography || '',
        profile: profile(person.profile_path),
        knownFor: person.known_for_department || null,
        items,
      });
    }

    // ── Discover by genre ──
    if (genre) {
      const mt = mediaType === 'tv' ? 'tv' : 'movie';
      const data = await tmdb(`/discover/${mt}`, {
        with_genres: genre, language: lang, sort_by: sortBy, page,
        'vote_count.gte': 25,
      });
      return res.status(200).json((data.results || []).map(i => shapeListItem(i, mt)));
    }

    // ── Trending ──
    if (trending) {
      const mt = mediaType === 'all' ? 'all' : mediaType;
      const data = await tmdb(`/trending/${mt}/${timeWindow}`, { language: lang, page });
      return res.status(200).json((data.results || []).map(i => shapeListItem(i, mt)));
    }

    // ── Season episodes ──
    if (showId && season) {
      const data = await tmdb(`/tv/${showId}/season/${season}`, { language: lang });
      const episodes = (data.episodes || []).map(ep => ({
        id: ep.id,
        episode_number: ep.episode_number,
        season_number: ep.season_number,
        name: ep.name,
        overview: ep.overview,
        runtime: ep.runtime,
        vote_average: ep.vote_average,
        air_date: ep.air_date,
        still: still(ep.still_path),
      }));
      return res.status(200).json(episodes);
    }

    // ── Search + detail ──
    if (!title) return res.status(400).json({ error: 'Missing title parameter' });

    const mt      = type === 'tv' ? 'tv' : 'movie';
    const yearKey = mt === 'tv' ? 'first_air_date_year' : 'year';

    // Try with the year first; if nothing survives ranking, retry without it,
    // because a release-name year is often the rip year, not the release year.
    let ranked = [];
    if (year) {
      const withYear = await tmdb(`/search/${mt}`, { query: title, language: lang, [yearKey]: year });
      ranked = rankResults(withYear.results || [], title, year);
    }
    if (ranked.length === 0) {
      const anyYear = await tmdb(`/search/${mt}`, { query: title, language: lang });
      ranked = rankResults(anyYear.results || [], title, year);
    }

    if (ranked.length === 0) return res.status(200).json({ found: false, title });

    const best   = ranked[0];
    const detail = await tmdb(`/${mt}/${best.item.id}`, { append_to_response: 'credits', language: lang });

    return res.status(200).json({
      ...shapeDetail(detail, mt),
      matchScore: Math.round(best.nameScore * 100) / 100,
    });
  } catch (err) {
    const status = err.status && err.status < 500 ? err.status : 502;
    console.error('[tmdb]', status, err.message);
    return res.status(status).json({ error: 'TMDB request failed', detail: err.message });
  }
}
