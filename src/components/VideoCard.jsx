// src/components/VideoCard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMeta } from '../lib/tmdb';

export default function VideoCard({ file, compact = false }) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMeta(file.name).then(m => { if (!cancelled) setMeta(m); });
    return () => { cancelled = true; };
  }, [file.name]);

  const title   = meta?.title || file.name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
  const poster  = meta?.poster || null;
  const year    = meta?.year || '';
  const rating  = meta?.rating || null;

  const handleClick = () => {
    navigate(`/watch/${encodeURIComponent(file.url)}`, {
      state: { file, meta },
    });
  };

  return (
    <button
      onClick={handleClick}
      className={`group relative flex-shrink-0 rounded-lg overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-red-500 transition-all duration-200 text-left ${
        compact ? 'w-32' : 'w-44'
      }`}
      title={title}
    >
      {/* Poster */}
      <div className={`relative bg-zinc-700 ${compact ? 'h-48' : 'h-64'}`}>
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Rating badge */}
        {rating && (
          <span className="absolute top-2 right-2 bg-black/70 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded">
            ★ {rating}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-white text-sm font-medium truncate leading-tight">{title}</p>
        {year && <p className="text-zinc-400 text-xs mt-0.5">{year}</p>}
      </div>
    </button>
  );
}