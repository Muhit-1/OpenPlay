// src/components/VideoCard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMeta, fetchDirectory } from '../lib/tmdb';

/**
 * Renders a single video card — or a smart "folder card" when the folder
 * contains exactly one video file (e.g. a movie in its own sub-folder).
 *
 * Props:
 *   file     — { url, name, type: 'video'|'folder' }
 *   compact  — smaller card variant
 *   unavailable — grey-out overlay (for trending items not on server)
 */
export default function VideoCard({ file, compact = false, unavailable = false }) {
  const navigate = useNavigate();
  const [meta, setMeta]         = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(file.type === 'video' ? file.url : null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (file.type === 'folder') {
          // Try to resolve a single-video folder to its lone file
          const data = await fetchDirectory(file.url);
          const videos = data.files.filter(f => f.type === 'video');
          if (!cancelled && videos.length === 1) {
            setResolvedUrl(videos[0].url);
            const m = await fetchMeta(videos[0].name);
            if (!cancelled && m?.found) setMeta(m);
          } else if (!cancelled) {
            // Multi-video folder: use folder name for TMDB lookup
            const m = await fetchMeta(file.name);
            if (!cancelled && m?.found) setMeta(m);
          }
        } else {
          const m = await fetchMeta(file.name);
          if (!cancelled && m?.found) setMeta(m);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [file.url, file.name, file.type]);

  const title  = meta?.title  || file.name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
  const poster = meta?.poster || null;
  const year   = meta?.year   || '';
  const rating = meta?.rating || null;

  const handleClick = () => {
    if (unavailable) return; // can't play what's not on the server
    if (resolvedUrl) {
      navigate(`/watch/${encodeURIComponent(resolvedUrl)}`, {
        state: { file: { ...file, url: resolvedUrl }, meta },
      });
    } else if (file.type === 'folder') {
      navigate(`/browse?url=${encodeURIComponent(file.url)}`);
    }
  };

  const w = compact ? 'w-32' : 'video-card';
  const h = compact ? 'h-48' : 'video-card-poster';

  return (
    <button
      onClick={handleClick}
      className={`group relative flex-shrink-0 rounded-lg overflow-hidden bg-zinc-800
        hover:ring-2 hover:ring-[var(--accent)] transition-all duration-200 text-left
        ${w} ${unavailable ? 'card-unavailable cursor-default' : ''}`}
      title={title}
    >
      {/* Poster */}
      <div className={`relative bg-zinc-700 ${h}`}>
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : loading ? (
          <div className="w-full h-full bg-zinc-800 animate-pulse" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            {file.type === 'folder' ? (
              <svg className="w-12 h-12 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            ) : (
              <svg className="w-12 h-12 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            )}
          </div>
        )}

        {/* Play/browse overlay */}
        {!unavailable && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
            <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center shadow-lg">
              {resolvedUrl || file.type === 'video' ? (
                <svg className="w-5 h-5 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          </div>
        )}

        {/* Rating badge */}
        {rating && (
          <span className="absolute top-2 right-2 bg-black/75 text-yellow-400 text-xs font-bold px-1.5 py-0.5 rounded">
            ★ {rating}
          </span>
        )}

        {/* Folder indicator badge */}
        {file.type === 'folder' && !resolvedUrl && (
          <span className="absolute top-2 left-2 bg-black/75 text-zinc-300 text-xs px-1.5 py-0.5 rounded">
            📁
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-white text-xs font-medium truncate leading-tight">{title}</p>
        {year && <p className="text-zinc-400 text-xs mt-0.5">{year}</p>}
      </div>
    </button>
  );
}