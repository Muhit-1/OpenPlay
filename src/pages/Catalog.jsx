// src/pages/Catalog.jsx
// Browse ALL DhakaFlix categories in one page.
// Filters: category, genre, year, rating.
// Each card links to TMDB detail page; shows server availability.

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

// ── Category definitions ──────────────────────────────────────────────────
// Each category maps to a TMDB endpoint + optional ISP server URL
const CATEGORIES = [
  // TMDB-backed categories
  { key: 'trending-movies', label: 'Trending Movies', source: 'tmdb-trending', mediaType: 'movie', timeWindow: 'week' },
  { key: 'trending-series', label: 'Trending Series', source: 'tmdb-trending', mediaType: 'tv', timeWindow: 'week' },
  { key: 'top-animation', label: 'Top Animation', source: 'tmdb-genre', mediaType: 'movie', genreId: 16 },
  { key: 'action', label: 'Action Movies', source: 'tmdb-genre', mediaType: 'movie', genreId: 28 },
  { key: 'comedy', label: 'Comedy', source: 'tmdb-genre', mediaType: 'movie', genreId: 35 },
  { key: 'horror', label: 'Horror', source: 'tmdb-genre', mediaType: 'movie', genreId: 27 },
  { key: 'romance', label: 'Romance', source: 'tmdb-genre', mediaType: 'movie', genreId: 10749 },
  { key: 'scifi', label: 'Sci-Fi', source: 'tmdb-genre', mediaType: 'movie', genreId: 878 },
  { key: 'drama', label: 'Drama', source: 'tmdb-genre', mediaType: 'movie', genreId: 18 },
  { key: 'thriller', label: 'Thriller', source: 'tmdb-genre', mediaType: 'movie', genreId: 53 },
  { key: 'documentary', label: 'Documentary', source: 'tmdb-genre', mediaType: 'movie', genreId: 99 },
  { key: 'crime', label: 'Crime', source: 'tmdb-genre', mediaType: 'movie', genreId: 80 },
  { key: 'fantasy', label: 'Fantasy', source: 'tmdb-genre', mediaType: 'movie', genreId: 14 },
  { key: 'action-tv', label: 'Action & Adventure (TV)', source: 'tmdb-genre', mediaType: 'tv', genreId: 10759 },
  { key: 'scifi-tv', label: 'Sci-Fi & Fantasy (TV)', source: 'tmdb-genre', mediaType: 'tv', genreId: 10765 },
  { key: 'drama-tv', label: 'Drama (TV)', source: 'tmdb-genre', mediaType: 'tv', genreId: 18 },
  { key: 'comedy-tv', label: 'Comedy (TV)', source: 'tmdb-genre', mediaType: 'tv', genreId: 35 },
  { key: 'crime-tv', label: 'Crime (TV)', source: 'tmdb-genre', mediaType: 'tv', genreId: 80 },
  { key: 'animation-tv', label: 'Animation (TV)', source: 'tmdb-genre', mediaType: 'tv', genreId: 16 },
  { key: 'reality-tv', label: 'Reality TV', source: 'tmdb-genre', mediaType: 'tv', genreId: 10764 },
];

const CATEGORY_GROUPS = [
  { label: 'Trending', keys: ['trending-movies', 'trending-series'] },
  { label: 'Movies', keys: ['top-animation', 'action', 'comedy', 'horror', 'romance', 'scifi', 'drama', 'thriller', 'documentary', 'crime', 'fantasy'] },
  { label: 'TV Series', keys: ['action-tv', 'scifi-tv', 'drama-tv', 'comedy-tv', 'crime-tv', 'animation-tv', 'reality-tv'] },
];

const RATING_OPTIONS = [
  { label: 'Any Rating', value: 0 },
  { label: '7+ ★', value: 7 },
  { label: '7.5+ ★', value: 7.5 },
  { label: '8+ ★', value: 8 },
  { label: '8.5+ ★', value: 8.5 },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [
  { label: 'Any Year', value: '' },
  ...Array.from({ length: 30 }, (_, i) => {
    const y = CURRENT_YEAR - i;
    return { label: String(y), value: String(y) };
  }),
];

// ── Fetch helpers ─────────────────────────────────────────────────────────
async function fetchCategoryItems(cat, lang, page = 1) {
  const base = `/api/tmdb`;
  let url;
  if (cat.source === 'tmdb-trending') {
    url = `${base}?trending=1&mediaType=${cat.mediaType}&timeWindow=${cat.timeWindow}&lang=${lang}`;
  } else {
    url = `${base}?genre=${cat.genreId}&mediaType=${cat.mediaType}&lang=${lang}&page=${page}`;
  }
  const res = await fetch(url);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [];
  return arr.map(item => ({
    id: item.id,
    title: item.title || item.name || '',
    year: (item.year || item.release_date || item.first_air_date || '').slice(0, 4),
    rating: item.rating ?? (item.vote_average ? Math.round(item.vote_average * 10) / 10 : null),
    poster: item.poster || (item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null),
    type: item.type || cat.mediaType,
    overview: item.overview || '',
  }));
}

// ── Main component ────────────────────────────────────────────────────────
export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initCat = searchParams.get('cat') || 'trending-movies';

  const [selectedCat, setSelectedCat] = useState(initCat);
  const [minRating, setMinRating] = useState(0);
  const [filterYear, setFilterYear] = useState('');
  const [searchQ, setSearchQ] = useState('');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);


  const lang = localStorage.getItem('tmdb_lang') || 'en-US';
  const cat = CATEGORIES.find(c => c.key === selectedCat) || CATEGORIES[0];

  // Load items when category / page changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchCategoryItems(cat, lang, page)
      .then(newItems => {
        if (cancelled) return;
        setItems(newItems);
        setHasMore(newItems.length > 0);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedCat, page]); // eslint-disable-line

  // Reset page when category changes
  const changeCategory = (key) => {
    setSelectedCat(key);
    setPage(1);
    setItems([]);
    setSearchParams({ cat: key });
  };



  // Filter locally
  const visible = items.filter(item => {
    if (minRating > 0 && (item.rating || 0) < minRating) return false;
    if (filterYear && item.year !== filterYear) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!item.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 page-enter">
      <div className="max-w-screen-2xl mx-auto px-6">

        {/* ── Page header ── */}
        <div className="mb-8">
          <h1 className="text-white text-3xl font-bold mb-1">Browse Library</h1>
          <p className="text-zinc-500 text-sm">All categories from TMDB · click any title to check your server</p>
        </div>

        {/* ── Sidebar + content layout ── */}
        <div className="flex gap-8">

          {/* ── Sidebar: category list ── */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-24 space-y-6">
              {CATEGORY_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold mb-2 px-1">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.keys.map(key => {
                      const c = CATEGORIES.find(x => x.key === key);
                      if (!c) return null;
                      return (
                        <button
                          key={key}
                          onClick={() => changeCategory(key)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedCat === key
                              ? 'bg-[var(--accent)] text-white font-medium'
                              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                            }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0">

            {/* Mobile category selector */}
            <div className="lg:hidden mb-4">
              <select
                value={selectedCat}
                onChange={e => changeCategory(e.target.value)}
                className="w-full bg-zinc-800 text-white text-sm rounded-xl px-4 py-3 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {CATEGORY_GROUPS.map(group => (
                  <optgroup key={group.label} label={group.label}>
                    {group.keys.map(key => {
                      const c = CATEGORIES.find(x => x.key === key);
                      return c ? <option key={key} value={key}>{c.label}</option> : null;
                    })}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* ── Filters bar ── */}
            <div className="flex flex-wrap gap-3 mb-6 items-center">
              {/* Search within category */}
              <div className="relative flex-1 min-w-[160px] max-w-xs">
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Search titles…"
                  className="w-full bg-zinc-800 text-white text-sm rounded-xl px-4 py-2.5 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder-zinc-500 pr-8"
                />
                {searchQ && (
                  <button onClick={() => setSearchQ('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Year filter */}
              <select
                value={filterYear}
                onChange={e => setFilterYear(e.target.value)}
                className="bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {YEAR_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Rating filter */}
              <select
                value={minRating}
                onChange={e => setMinRating(Number(e.target.value))}
                className="bg-zinc-800 text-white text-sm rounded-xl px-3 py-2.5 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {RATING_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Active filter count */}
              {(minRating > 0 || filterYear || searchQ) && (
                <button
                  onClick={() => { setMinRating(0); setFilterYear(''); setSearchQ(''); }}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-2 rounded-xl transition-colors"
                >
                  Clear filters
                </button>
              )}

              <span className="ml-auto text-zinc-600 text-xs tabular-nums">
                {visible.length} title{visible.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Category title ── */}
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-white text-xl font-semibold">{cat.label}</h2>
              <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                TMDB
              </span>
              <span className="text-[10px] text-zinc-600 capitalize">{cat.mediaType}</span>
            </div>

            {/* ── Grid ── */}
            {loading && items.length === 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
                {[...Array(21)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="text-center py-20 text-zinc-500">
                <p className="text-lg mb-2">No titles match your filters</p>
                <p className="text-sm">Try relaxing the rating or year filter</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
                  {visible.map(item => (
                    <CatalogCard key={item.id} item={item} navigate={navigate} />
                  ))}
                </div>

                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => { setPage(p => p - 1); setItems([]); window.scrollTo(0, 0); }}
                    disabled={page === 1 || loading}
                    className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm disabled:opacity-30 transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-zinc-500 text-sm">Page {page}</span>
                  <button
                    onClick={() => { setPage(p => p + 1); setItems([]); window.scrollTo(0, 0); }}
                    disabled={!hasMore || loading}
                    className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm disabled:opacity-30 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Catalog card ──────────────────────────────────────────────────────────
function CatalogCard({ item, navigate }) {
  const { id, title, year, rating, poster, type } = item;
  const mediaType = type === 'tv' ? 'tv' : 'movie';

  return (
    <button
      onClick={() => navigate(`/detail/${id}?type=${mediaType}`)}
      className="group relative flex flex-col rounded-xl overflow-hidden bg-zinc-900 text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-xl hover:shadow-black/50 hover:ring-2 hover:ring-[var(--accent)]"
      title={title}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] bg-zinc-800 w-full">
        {poster ? (
          <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        {/* Rating badge */}
        {rating && (
          <span className="absolute top-1.5 right-1.5 bg-black/80 text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <svg className="w-2 h-2 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            {rating}
          </span>
        )}
        {/* TV badge */}
        {mediaType === 'tv' && (
          <span className="absolute top-1.5 left-1.5 bg-black/70 text-zinc-300 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
            TV
          </span>
        )}
      </div>
      {/* Info */}
      <div className="p-2 flex-1">
        <p className="text-white text-xs font-medium leading-tight line-clamp-2">{title}</p>
        {year && <p className="text-zinc-500 text-[10px] mt-0.5">{year}</p>}
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden bg-zinc-900">
      <div className="aspect-[2/3] bg-zinc-800 animate-pulse" />
      <div className="p-2 space-y-1.5">
        <div className="h-3 bg-zinc-800 rounded animate-pulse" />
        <div className="h-2.5 w-1/2 bg-zinc-800 rounded animate-pulse" />
      </div>
    </div>
  );
}