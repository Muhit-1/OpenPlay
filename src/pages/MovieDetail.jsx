// src/pages/MovieDetail.jsx
// Full info page for a TMDB movie or series.
// On load, searches the ISP server using the known DhakaFlix folder structure:
//
// MOVIES (English):
//   172.16.50.7/DHAKA-FLIX-7/English Movies/(YEAR)/Movie Title (YEAR) 720p.../movie.mkv
//   172.16.50.14/DHAKA-FLIX-14/English Movies (1080p)/(YEAR)/...
//
// TV SERIES:
//   172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/TV Series ♥  A  —  L/Show Name/Season X/ep.mkv
//   Alpha buckets: ★ 0—9 | ♥ A—L | ♦ M—R | ♦ S—Z

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';

// ── DhakaFlix server map ──────────────────────────────────────────────────
const SERVERS = {
  englishMovies:     'http://172.16.50.7/DHAKA-FLIX-7/English%20Movies/',
  englishMovies1080: 'http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20%281080p%29/',
  hindiMovies:       'http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/',
  animationMovies:   'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies/',
  animation1080:     'http://172.16.50.14/DHAKA-FLIX-14/Animation%20Movies%20%281080p%29/',
  tvSeries:          'http://172.16.50.12/DHAKA-FLIX-12/TV-WEB-Series/',
};

// TV alpha buckets on the server
const TV_BUCKETS = [
  { label: 'TV Series ★  0  —  9', chars: /^[0-9]/ },
  { label: 'TV Series ♥  A  —  L', chars: /^[A-La-l]/ },
  { label: 'TV Series ♦  M  —  R', chars: /^[M-Rm-r]/ },
  { label: 'TV Series ♦  S  —  Z', chars: /^[S-Zs-z]/ },
];

// ── Fuzzy title matching ──────────────────────────────────────────────────
/**
 * Normalise a string for comparison:
 * lowercase, strip punctuation & common noise words, collapse spaces.
 */
function normalise(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[''`]/g, '')          // smart quotes
    .replace(/[^a-z0-9 ]/g, ' ')   // strip special chars
    .replace(/\b(the|a|an)\b/g, '') // strip articles
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check whether a folder name is a plausible match for `title`.
 * The folder name typically looks like:
 *   "Black Adam (2022) 720p WEBRip x264"
 * We strip the year and quality tags then compare normalised strings.
 */
function folderMatchesTitle(folderName, title) {
  // Strip year + everything after from folder name
  const clean = folderName
    .replace(/\s*\(\d{4}\).*/i, '')   // "(2022) 720p ..."
    .replace(/\s*\d{4}\s.*/i, '')     // "2022 ..."
    .trim();

  const normFolder = normalise(clean);
  const normTitle  = normalise(title);

  if (!normFolder || !normTitle) return false;

  // Exact match after normalisation
  if (normFolder === normTitle) return true;

  // One starts with the other (handles subtitle differences)
  if (normFolder.startsWith(normTitle) || normTitle.startsWith(normFolder)) return true;

  // Word-overlap score: ≥75% of title words present in folder name
  const titleWords  = normTitle.split(' ').filter(Boolean);
  const folderWords = new Set(normFolder.split(' ').filter(Boolean));
  const hits = titleWords.filter(w => folderWords.has(w)).length;
  return titleWords.length > 0 && hits / titleWords.length >= 0.75;
}

// ── Directory fetch helper ────────────────────────────────────────────────
async function fetchDir(url) {
  const res = await fetch(`/api/parse?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // { folders: [...], files: [...] }
}

// ── Main search function ──────────────────────────────────────────────────
/**
 * Search the DhakaFlix ISP server for a matching video file.
 * Returns the direct video URL string, or null if not found.
 *
 * @param {string} title      – TMDB title (English)
 * @param {string|null} year  – 4-digit year string or null
 * @param {'movie'|'tv'} type
 * @param {string[]} genres   – TMDB genre names (used to pick category)
 */
async function searchIspServer(title, year, type, genres = []) {
  try {
    if (type === 'tv') {
      return await searchTvSeries(title);
    } else {
      return await searchMovies(title, year, genres);
    }
  } catch {
    return null;
  }
}

// ── Movie search ──────────────────────────────────────────────────────────
async function searchMovies(title, year, genres) {
  const isAnimation = genres.some(g =>
    /animation|animated|cartoon/i.test(g)
  );

  // Build ordered list of base URLs to try
  const bases = isAnimation
    ? [SERVERS.animationMovies, SERVERS.animation1080, SERVERS.englishMovies, SERVERS.englishMovies1080]
    : [SERVERS.englishMovies, SERVERS.englishMovies1080];

  for (const base of bases) {
    const result = await searchMovieInBase(base, title, year);
    if (result) return result;
  }
  return null;
}

async function searchMovieInBase(baseUrl, title, year) {
  // Strategy 1: try the year folder directly (fast path)
  if (year) {
    const yearUrl = `${baseUrl}(${year})/`;
    try {
      const data = await fetchDir(yearUrl);
      const match = findMovieInYear(data, title);
      if (match) return match;
    } catch { /* year folder may not exist */ }
  }

  // Strategy 2: scan all year folders (slow path — only if no year)
  if (!year) {
    try {
      const root = await fetchDir(baseUrl);
      for (const folder of root.folders) {
        try {
          const data  = await fetchDir(folder.url);
          const match = findMovieInYear(data, title);
          if (match) return match;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return null;
}

/**
 * Given the contents of a year folder, find the first video file
 * inside a sub-folder whose name matches `title`.
 */
function findMovieInYear(data, title) {
  // Check if there are direct video files (flat structure)
  const directVideo = data.files.find(f => f.type === 'video');
  if (directVideo && folderMatchesTitle(
    decodeURIComponent(directVideo.name).replace(/\.[^.]+$/, ''), title
  )) {
    return directVideo.url;
  }

  // Look through sub-folders for a title match
  const matched = data.folders.find(f =>
    folderMatchesTitle(decodeURIComponent(f.name), title)
  );
  return matched ? matched.url : null; // caller will navigate to this folder URL
}

// ── TV search ─────────────────────────────────────────────────────────────
async function searchTvSeries(title) {
  // Determine which alpha bucket to look in
  const firstChar = normalise(title).replace(/^(the|a|an) /, '')[0] || '';
  const bucket = TV_BUCKETS.find(b => b.chars.test(firstChar)) || TV_BUCKETS[1];

  const bucketUrl = `${SERVERS.tvSeries}${encodeURIComponent(bucket.label)}/`;

  try {
    const data = await fetchDir(bucketUrl);
    const matched = data.folders.find(f =>
      folderMatchesTitle(decodeURIComponent(f.name), title)
    );
    if (matched) return matched.url;
  } catch { /* skip */ }

  // Fallback: try all buckets
  for (const b of TV_BUCKETS) {
    if (b === bucket) continue; // already tried
    const url = `${SERVERS.tvSeries}${encodeURIComponent(b.label)}/`;
    try {
      const data = await fetchDir(url);
      const matched = data.folders.find(f =>
        folderMatchesTitle(decodeURIComponent(f.name), title)
      );
      if (matched) return matched.url;
    } catch { /* skip */ }
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function MovieDetail() {
  const { id }         = useParams();
  const [searchParams] = useSearchParams();
  const mediaType      = searchParams.get('type') || 'movie';
  const navigate       = useNavigate();

  const [detail,       setDetail]       = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [serverStatus, setServerStatus] = useState('searching');
  const [foundUrl,     setFoundUrl]     = useState(null);

  // ── Fetch TMDB detail then kick off ISP search ─────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setServerStatus('searching');
    setFoundUrl(null);

    const lang = localStorage.getItem('tmdb_lang') || 'en-US';

    fetch(`/api/tmdb?tmdbId=${id}&mediaType=${mediaType}&lang=${lang}`)
      .then(r => r.json())
      .then(async data => {
        setDetail(data);
        setLoading(false);

        if (!data?.found) {
          setServerStatus('not-found');
          return;
        }

        // ISP server search — run in background after render
        const ispUrl = localStorage.getItem('isp_url');
        if (!ispUrl) {
          setServerStatus('not-found');
          return;
        }

        try {
          const url = await searchIspServer(
            data.title,
            data.year,
            mediaType === 'tv' ? 'tv' : 'movie',
            data.genres || []
          );

          if (url) {
            setFoundUrl(url);
            setServerStatus('found');
          } else {
            setServerStatus('not-found');
          }
        } catch {
          setServerStatus('not-found');
        }
      })
      .catch(() => {
        setLoading(false);
        setServerStatus('not-found');
      });
  }, [id, mediaType]);

  if (loading) return <LoadingSkeleton />;
  if (!detail || detail.error) return <NotFound navigate={navigate} />;

  const {
    title, overview, year, rating, runtime, seasons,
    poster, backdrop, genres = [], cast = [], directors = [], studios = [],
  } = detail;

  return (
    <div className="min-h-screen bg-zinc-950 page-enter">

      {/* ── Backdrop hero ── */}
      <div className="relative h-[56vw] max-h-[520px] min-h-[280px] overflow-hidden">
        {backdrop ? (
          <img src={backdrop} alt="" className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full bg-zinc-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-black/30" />

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 flex items-center gap-2 text-zinc-300 hover:text-white text-sm transition-colors bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      {/* ── Main content ── */}
      <div className="relative -mt-32 px-6 pb-16 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-8 items-start">

          {/* Poster */}
          <div className="flex-shrink-0 w-44 md:w-52 rounded-xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/10 self-start hidden sm:block">
            {poster ? (
              <img src={poster} alt={title} className="w-full block" />
            ) : (
              <div className="w-full aspect-[2/3] bg-zinc-800 flex items-center justify-center">
                <svg className="w-14 h-14 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-2 md:pt-6">

            <span className="inline-block text-[var(--accent)] text-xs font-semibold uppercase tracking-widest mb-2">
              {mediaType === 'tv' ? 'Series' : 'Movie'}
            </span>

            <h1 className="text-white text-3xl md:text-4xl font-bold leading-tight mb-3">
              {title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {year && <span className="text-zinc-300 text-sm font-medium">{year}</span>}
              {runtime && <span className="text-zinc-500 text-sm">{runtime} min</span>}
              {seasons && (
                <span className="text-zinc-500 text-sm">
                  {seasons} season{seasons !== 1 ? 's' : ''}
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-1 bg-zinc-800 text-yellow-400 text-xs font-bold px-2.5 py-1 rounded-full">
                  <svg className="w-3 h-3 fill-yellow-400" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  {rating}
                </span>
              )}
            </div>

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {genres.map(g => (
                  <button
                    key={g}
                    onClick={() => navigate(`/channel/${encodeURIComponent(g)}?type=genre`)}
                    className="text-xs px-3 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-all"
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {/* Overview */}
            {overview && (
              <p className="text-zinc-300 text-sm leading-relaxed mb-6 max-w-2xl">
                {overview}
              </p>
            )}

            {/* ── Watch / server status button ── */}
            <ServerStatusButton
              status={serverStatus}
              foundUrl={foundUrl}
              title={title}
              poster={poster}
              navigate={navigate}
              mediaType={mediaType}
              detail={detail}
            />

            {/* Director / Studios */}
            <div className="mt-6 space-y-2">
              {directors.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500 w-20 flex-shrink-0">Director</span>
                  <span className="text-zinc-200">{directors.join(', ')}</span>
                </div>
              )}
              {studios.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500 w-20 flex-shrink-0">Studio</span>
                  <span className="text-zinc-200">{studios.slice(0, 2).join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Cast ── */}
        {cast.length > 0 && (
          <div className="mt-12">
            <h2 className="text-zinc-400 text-xs uppercase tracking-widest mb-4">Cast</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {cast.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/channel/${encodeURIComponent(c.name)}?type=actor`)}
                  className="flex-shrink-0 w-24 text-center group"
                >
                  <div className="w-16 h-16 mx-auto rounded-full overflow-hidden bg-zinc-800 ring-2 ring-transparent group-hover:ring-[var(--accent)] transition-all mb-2">
                    {c.profile ? (
                      <img src={c.profile} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold text-zinc-400">
                        {c.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="text-zinc-200 text-xs font-medium leading-tight group-hover:text-white transition-colors">
                    {c.name}
                  </p>
                  {c.character && (
                    <p className="text-zinc-500 text-[10px] mt-0.5 leading-tight truncate">
                      {c.character}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Server status button ──────────────────────────────────────────────────
function ServerStatusButton({ status, foundUrl, title, poster, navigate, mediaType, detail }) {

  if (status === 'searching') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 bg-zinc-800/80 text-zinc-300 text-sm px-5 py-3 rounded-xl border border-zinc-700/50">
          <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Searching your server…
        </div>
      </div>
    );
  }

  if (status === 'found' && foundUrl) {
    // Determine if it's a folder URL or a direct file URL
    const isFolder = !foundUrl.match(/\.(mkv|mp4|avi|mov|webm|ts|m4v)$/i);

    if (isFolder) {
      // Navigate to Browse so user can pick the episode/quality
      return (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate(`/browse?url=${encodeURIComponent(foundUrl)}`)}
            className="flex items-center gap-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-[var(--accent)]/25"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
            </svg>
            Browse on Server
          </button>
          <span className="text-green-400 text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Found on your server
          </span>
        </div>
      );
    }

    // Direct video file — go straight to player
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate(`/watch/${encodeURIComponent(foundUrl)}`, {
            state: {
              file: { url: foundUrl, name: title, type: 'video' },
              meta: detail,
            },
          })}
          className="flex items-center gap-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-[var(--accent)]/25"
        >
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          Watch Now
        </button>
        <span className="text-green-400 text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          Found on your server
        </span>
      </div>
    );
  }

  // not-found
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2.5 bg-zinc-900 border border-zinc-700 text-zinc-400 text-sm px-5 py-3 rounded-xl">
        <svg className="w-4 h-4 text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
        </svg>
        Not yet on server
      </div>
      <span className="text-zinc-600 text-xs">
        {mediaType === 'tv' ? 'Series' : 'Movie'} not found in your ISP library
      </span>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-950 page-enter">
      <div className="h-[400px] bg-zinc-900 animate-pulse" />
      <div className="px-6 -mt-32 max-w-6xl mx-auto">
        <div className="flex gap-8">
          <div className="w-52 aspect-[2/3] bg-zinc-800 rounded-xl animate-pulse flex-shrink-0 hidden sm:block" />
          <div className="flex-1 pt-8 space-y-4">
            <div className="h-3 w-16 bg-zinc-800 rounded animate-pulse" />
            <div className="h-9 w-2/3 bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-1/3 bg-zinc-800 rounded animate-pulse" />
            <div className="flex gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-6 w-16 bg-zinc-800 rounded-full animate-pulse" />
              ))}
            </div>
            <div className="space-y-2 max-w-2xl">
              <div className="h-3 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 bg-zinc-800 rounded animate-pulse" />
              <div className="h-3 w-4/5 bg-zinc-800 rounded animate-pulse" />
            </div>
            <div className="h-12 w-48 bg-zinc-800 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFound({ navigate }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-6">
      <p className="text-zinc-400 text-lg mb-4">Could not load title info</p>
      <button
        onClick={() => navigate(-1)}
        className="text-[var(--accent)] hover:underline text-sm"
      >
        Go back
      </button>
    </div>
  );
}