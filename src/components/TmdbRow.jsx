// src/components/TmdbRow.jsx
// Scrollable row of TMDB cards with a "View All" button → /catalog page

import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TmdbRow({ title, badge, items = [], loading = false, catalogKey }) {
  const scrollRef = useRef(null);
  const navigate  = useNavigate();

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 600, behavior: 'smooth' });
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="mb-10">
      {/* Row header */}
      <div className="flex items-center justify-between mb-3 px-6">
        <div className="flex items-center gap-2">
          <h2 className="text-white text-xl font-semibold tracking-wide">{title}</h2>
          {badge && (
            <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View All button */}
          {catalogKey && (
            <button
              onClick={() => navigate(`/catalog?cat=${encodeURIComponent(catalogKey)}`)}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
            >
              View All
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {/* Scroll arrows */}
          <button
            onClick={() => scroll(-1)}
            className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll(1)}
            className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-6 pb-2"
      >
        {loading
          ? [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
          : items.map((item, i) => (
              <TmdbCard key={item.id || i} item={item} navigate={navigate} />
            ))
        }
      </div>
    </section>
  );
}

function TmdbCard({ item, navigate }) {
  const { id, title, name, year, rating, poster, type, serverStatus } = item;
  const displayTitle = title || name || '';
  const mediaType    = type === 'tv' ? 'tv' : 'movie';
  const available    = serverStatus === 'found';
  const unavailable  = serverStatus === 'not-found';

  return (
    <button
      onClick={() => navigate(`/detail/${id}?type=${mediaType}`)}
      className="group relative flex-shrink-0 video-card rounded-xl overflow-hidden bg-zinc-900 text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-xl hover:shadow-black/50 hover:ring-2 hover:ring-[var(--accent)]"
      title={displayTitle}
    >
      <div className="relative video-card-poster bg-zinc-800">
        {poster ? (
          <img src={poster} alt={displayTitle} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-11 h-11 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <span className="text-white text-[10px] font-medium">More Info</span>
          </div>
        </div>
        {rating && (
          <span className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm text-yellow-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
            <svg className="w-2.5 h-2.5 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            {rating}
          </span>
        )}
        {mediaType === 'tv' && (
          <span className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-zinc-300 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide">
            Series
          </span>
        )}
        {available && <span className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-400/50" title="Available on server" />}
        {unavailable && <span className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-zinc-600" title="Not on server" />}
      </div>
      <div className="p-2.5">
        <p className="text-white text-xs font-medium truncate leading-tight">{displayTitle}</p>
        {year && <p className="text-zinc-500 text-[10px] mt-0.5">{year}</p>}
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="flex-shrink-0 video-card rounded-xl overflow-hidden bg-zinc-900">
      <div className="video-card-poster bg-zinc-800 animate-pulse" />
      <div className="p-2.5 space-y-1.5">
        <div className="h-3 bg-zinc-800 rounded animate-pulse" />
        <div className="h-2.5 w-1/2 bg-zinc-800 rounded animate-pulse" />
      </div>
    </div>
  );
}