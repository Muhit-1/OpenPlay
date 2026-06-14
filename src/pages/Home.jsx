// src/pages/Home.jsx
// Home page with TMDB-powered category rows + ISP server rows.

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import CategoryRow from '../components/CategoryRow';
import TmdbRow    from '../components/TmdbRow';
import { fetchDirectory, fetchTrending } from '../lib/tmdb';
import { getContinueWatching } from '../lib/firebase';

// TMDB genre IDs
const GENRE_ROWS = [
  { id: 28,    label: 'Action',       type: 'movie' },
  { id: 35,    label: 'Comedy',       type: 'movie' },
  { id: 27,    label: 'Horror',       type: 'movie' },
  { id: 10749, label: 'Romance',      type: 'movie' },
  { id: 878,   label: 'Sci-Fi',       type: 'movie' },
  { id: 18,    label: 'Drama',        type: 'movie' },
  { id: 10759, label: 'Action & Adventure', type: 'tv' },
  { id: 10765, label: 'Sci-Fi & Fantasy',   type: 'tv' },
];

export default function Home() {
  const navigate = useNavigate();
  const ispUrl   = localStorage.getItem('isp_url');

  // ISP data
  const [rootFolders,  setRootFolders]  = useState([]);
  const [rootFiles,    setRootFiles]    = useState([]);
  const [continueList, setContinueList] = useState([]);
  const [ispLoading,   setIspLoading]   = useState(true);
  const [ispError,     setIspError]     = useState(null);

  // TMDB rows
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingSeries, setTrendingSeries] = useState([]);
  const [topAnimation,   setTopAnimation]   = useState([]);
  const [genreRows,      setGenreRows]      = useState({}); // { genreLabel: items[] }
  const [tmdbLoading,    setTmdbLoading]    = useState(true);

  // ── Load ISP directory ─────────────────────────────────────────────────
  useEffect(() => {
    if (!ispUrl) { setIspLoading(false); return; }

    const extraUrls = JSON.parse(localStorage.getItem('extra_urls') || '[]');
    const allUrls   = [ispUrl, ...extraUrls];

    Promise.all(allUrls.map(url => fetchDirectory(url).catch(() => ({ folders: [], files: [] }))))
      .then(results => {
        setRootFolders(results.flatMap(r => r.folders || []));
        setRootFiles(results.flatMap(r => r.files   || []));
      })
      .catch(err => setIspError(err.message))
      .finally(() => setIspLoading(false));

    getContinueWatching(10).then(setContinueList).catch(() => {});
  }, [ispUrl]);

  // ── Load TMDB rows ─────────────────────────────────────────────────────
  useEffect(() => {
    const lang = localStorage.getItem('tmdb_lang') || 'en-US';

    async function loadTmdb() {
      setTmdbLoading(true);
      try {
        const [movies, series, anim] = await Promise.all([
          fetchTrending('movie', 'week'),
          fetchTrending('tv',    'week'),
          fetchGenreItems(16, 'movie', lang),   // Animation genre id = 16
        ]);
        setTrendingMovies(normalise(movies));
        setTrendingSeries(normalise(series));
        setTopAnimation(normalise(anim));

        // Load genre rows in background (don't block)
        const genreResults = await Promise.allSettled(
          GENRE_ROWS.slice(0, 4).map(g =>
            fetchGenreItems(g.id, g.type, lang).then(items => ({ label: g.label, items: normalise(items) }))
          )
        );
        const built = {};
        genreResults.forEach(r => {
          if (r.status === 'fulfilled' && r.value.items.length > 0) {
            built[r.value.label] = r.value.items;
          }
        });
        setGenreRows(built);
      } catch { /* silent */ } finally {
        setTmdbLoading(false);
      }
    }

    loadTmdb();
  }, []);

  // ── No server configured ───────────────────────────────────────────────
  if (!ispUrl) {
    return <SetupScreen navigate={navigate} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 page-enter">

      {/* ── Hero banner ── */}
      <HeroBanner ispUrl={ispUrl} rootFolders={rootFolders} rootFiles={rootFiles} ispLoading={ispLoading} />

      {/* ── Continue Watching (ISP) ── */}
      {continueList.length > 0 && (
        <CategoryRow
          title="Continue Watching"
          files={continueList.map(item => ({
            name: item.title,
            url:  item.fileUrl,
            type: 'video',
          }))}
        />
      )}

      {/* ── Trending Movies (TMDB) ── */}
      <TmdbRow
        title="Trending Movies"
        badge="TMDB"
        items={trendingMovies}
        loading={tmdbLoading}
      />

      {/* ── Trending Series (TMDB) ── */}
      <TmdbRow
        title="Trending Series"
        badge="TMDB"
        items={trendingSeries}
        loading={tmdbLoading}
      />

      {/* ── Top Animation (TMDB) ── */}
      <TmdbRow
        title="Top Animation"
        badge="TMDB"
        items={topAnimation}
        loading={tmdbLoading}
      />

      {/* ── ISP server rows: root files ── */}
      {ispError ? (
        <div className="px-6 mb-10">
          <div className="bg-red-900/20 border border-red-800/40 text-red-300 rounded-xl px-5 py-4 text-sm flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            Could not reach server — {ispError}
          </div>
        </div>
      ) : ispLoading ? (
        <IspSkeletonRows />
      ) : (
        <>
          {rootFiles.length > 0 && (
            <CategoryRow title="Files at Root" files={rootFiles} />
          )}
          {rootFolders.map(folder => (
            <FolderRow key={folder.url} folder={folder} />
          ))}
        </>
      )}

      {/* ── Genre rows (TMDB) ── */}
      {Object.entries(genreRows).map(([label, items]) => (
        <TmdbRow
          key={label}
          title={label}
          badge="TMDB"
          items={items}
        />
      ))}
    </div>
  );
}

// ── Hero Banner ───────────────────────────────────────────────────────────
function HeroBanner({ ispUrl, rootFolders, rootFiles, ispLoading }) {
  const cleanUrl = ispUrl?.replace(/https?:\/\//, '') || '';

  return (
    <div className="relative h-44 md:h-56 mb-10 mx-6 rounded-2xl overflow-hidden bg-zinc-900 flex items-end">
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-dim)] via-transparent to-transparent opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {/* Decorative grid pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 40px)',
        }}
      />

      <div className="relative px-8 pb-7 flex items-end justify-between w-full">
        <div>
          <p className="text-[var(--accent)] text-xs font-semibold uppercase tracking-widest mb-1">
            Your Server
          </p>
          <h1 className="text-white text-2xl font-bold truncate max-w-lg">{cleanUrl}</h1>
          {!ispLoading && (
            <p className="text-zinc-400 text-sm mt-1">
              {rootFolders.length} categories · {rootFiles.length} files at root
            </p>
          )}
          {ispLoading && (
            <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
              <span className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin inline-block" />
              Loading directory…
            </p>
          )}
        </div>

        {/* Play icon decoration */}
        <div className="hidden md:flex w-14 h-14 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/30 items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-[var(--accent)] ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton rows while ISP loads ─────────────────────────────────────────
function IspSkeletonRows() {
  return (
    <div className="mb-10 px-6">
      <div className="h-6 w-40 bg-zinc-800 rounded animate-pulse mb-4" />
      <div className="flex gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex-shrink-0 video-card rounded-xl overflow-hidden bg-zinc-900">
            <div className="video-card-poster bg-zinc-800 animate-pulse" />
            <div className="p-2.5 space-y-1.5">
              <div className="h-3 bg-zinc-800 rounded animate-pulse" />
              <div className="h-2.5 w-1/2 bg-zinc-800 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FolderRow: lazy-loads a root folder's contents ────────────────────────
function FolderRow({ folder }) {
  const navigate    = useNavigate();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchDirectory(folder.url)
      .then(d => setData(d))
      .catch(() => setData({ folders: [], files: [] }))
      .finally(() => setLoading(false));
  }, [folder.url]);

  if (loading) {
    return (
      <div className="mb-10 px-6">
        <div className="text-zinc-300 text-xl font-semibold mb-3">{folder.name}</div>
        <div className="flex gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-shrink-0 video-card video-card-poster rounded-xl bg-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <CategoryRow
      title={folder.name}
      files={data.files}
      folders={data.folders}
      onFolderClick={(sub) => navigate(`/browse?url=${encodeURIComponent(sub.url)}`)}
    />
  );
}

// ── Setup screen ──────────────────────────────────────────────────────────
function SetupScreen({ navigate }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-6">
      <div className="w-16 h-16 bg-[var(--accent)] rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_var(--accent-dim)]">
        <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <h1 className="text-white text-3xl font-bold mb-3">Welcome to OpenPlay</h1>
      <p className="text-zinc-400 text-lg mb-8 max-w-md">
        Enter your ISP's open directory server URL to start streaming — no downloads, no logins.
      </p>
      <button
        onClick={() => navigate('/settings')}
        className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold px-8 py-3 rounded-full transition-colors"
      >
        Set up your server →
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Normalise TMDB items into a consistent shape for TmdbCard */
function normalise(items = []) {
  return items.map(item => ({
    id:     item.id,
    title:  item.title || item.name,
    year:   (item.year || item.release_date || item.first_air_date || '').slice(0, 4),
    rating: item.rating || (item.vote_average ? Math.round(item.vote_average * 10) / 10 : null),
    poster: item.poster || (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null),
    type:   item.type   || item.media_type || 'movie',
    serverStatus: null, // will be resolved on detail page
  }));
}

/** Fetch movies/series by TMDB genre id */
async function fetchGenreItems(genreId, mediaType = 'movie', lang = 'en-US') {
  try {
    const res  = await fetch(`/api/tmdb?genre=${genreId}&mediaType=${mediaType}&lang=${lang}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}