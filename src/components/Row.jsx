// src/components/Row.jsx
// One horizontally scrolling row, used for both server content and TMDB lists.

import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight, Folder } from 'lucide-react';
import PosterCard from './PosterCard';
import { PosterSkeleton } from './ui';

export default function Row({
  title, eyebrow, files = [], folders = [], items = [],
  loading = false, moreHref, availability = {}, onFolderClick, action,
}) {
  const track = useRef(null);
  const navigate = useNavigate();
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, files.length, items.length, folders.length]);

  const scroll = dir => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' });
  };

  const isEmpty = !loading && files.length === 0 && items.length === 0 && folders.length === 0;
  if (isEmpty) return null;

  return (
    <section className="mb-9">
      <div className="flex items-end justify-between gap-4 mb-3.5 px-5 sm:px-7">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h2 className="font-display text-lg leading-none truncate">{title}</h2>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {action}
          {moreHref && (
            <button
              onClick={() => navigate(moreHref)}
              className="flex items-center gap-1 px-2.5 h-8 rounded-lg text-[13px] transition-colors control"
              style={{ color: 'var(--text-soft)' }}
            >
              All
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          )}
          <ScrollButton dir={-1} disabled={edges.start} onClick={() => scroll(-1)} />
          <ScrollButton dir={1} disabled={edges.end} onClick={() => scroll(1)} />
        </div>
      </div>

      <div ref={track} className="row-track px-5 sm:px-7 pb-1">
        {loading && Array.from({ length: 8 }, (_, i) => <PosterSkeleton key={`s${i}`} />)}

        {folders.map(folder => (
          <FolderCard key={folder.url} folder={folder} onClick={onFolderClick} />
        ))}

        {files.map(file => (
          <PosterCard key={file.url} file={file} />
        ))}

        {items.map(item => (
          <PosterCard
            key={item.id}
            item={item}
            availability={availability[item.id]}
          />
        ))}
      </div>
    </section>
  );
}

function ScrollButton({ dir, disabled, onClick }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir < 0 ? 'Scroll left' : 'Scroll right'}
      className="control w-7 h-7 rounded-lg flex items-center justify-center transition-opacity"
      style={{ color: 'var(--text-soft)', opacity: disabled ? 0.3 : 1 }}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

function FolderCard({ folder, onClick }) {
  return (
    <button
      onClick={() => onClick?.(folder)}
      className="card-link flex-shrink-0 video-card text-left"
      title={folder.name}
    >
      <div className="poster-frame video-card-poster flex flex-col items-center justify-center gap-3">
        <Folder size={30} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
        <span className="text-xs text-center px-4 leading-snug truncate-2" style={{ color: 'var(--text-soft)' }}>
          {folder.name}
        </span>
      </div>
      <div className="pt-2.5 px-0.5">
        <p className="text-[13px] font-medium truncate">{folder.name}</p>
        <p className="data mt-1">Folder</p>
      </div>
    </button>
  );
}
