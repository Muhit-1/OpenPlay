// src/pages/Library.jsx
//
// Movies, Series and Animation all render through here.
//
// The point of this page is that it shows *titles*. The server organises its
// content into year buckets and alphabetical buckets, and Home used to surface
// those buckets as cards — you clicked "TV Series ♦ M — R" and got a filing
// cabinet. Here the buckets become a tab strip and the grid is always media.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ServerOff, FolderOpen, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import PosterCard from '../components/PosterCard';
import { PosterSkeleton, EmptyState, Notice } from '../components/ui';
import { librariesFor, libraryIndex, libraryTitles } from '../lib/server';
import { useAsync } from '../lib/useAsync';
import { parseRelease } from '../lib/release';

// Each card resolves its own TMDB metadata, so rendering a 700-title section in
// one go would fire 700 lookups. Paging keeps that to a screenful at a time.
const PER_PAGE = 60;

const HEADINGS = {
  movies:    'Movies',
  series:    'Series',
  animation: 'Animation',
};

export default function Library({ category }) {
  const [params, setParams] = useSearchParams();

  const libraries = useMemo(() => librariesFor(category), [category]);
  const libKey = params.get('lib') || libraries[0]?.key;
  const library = libraries.find(l => l.key === libKey) || libraries[0];

  // How is this library indexed? Years, letters, or not at all.
  const { data: index, loading: indexLoading } = useAsync(
    library ? library.url : null,
    () => libraryIndex(library),
    { shape: 'flat', sections: [], error: null }
  );

  const sectionKey = params.get('s');
  const section = index.sections.find(s => s.key === sectionKey) || index.sections[0];

  const { data: slice, loading: titlesLoading } = useAsync(
    section ? section.url : null,
    () => libraryTitles(section.url),
    { titles: [], error: null }
  );

  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  // Reset paging whenever the slice being viewed changes.
  const viewKey = `${libKey}|${section?.key}|${filter}`;
  const [lastViewKey, setLastViewKey] = useState(viewKey);
  if (viewKey !== lastViewKey) {
    setLastViewKey(viewKey);
    setPage(1);
  }

  const matching = useMemo(() => {
    if (!filter.trim()) return slice.titles;
    const needle = filter.trim().toLowerCase();
    return slice.titles.filter(t =>
      t.name.toLowerCase().includes(needle) ||
      parseRelease(t.name).title.toLowerCase().includes(needle)
    );
  }, [slice.titles, filter]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const visible = matching.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const loading = indexLoading || titlesLoading;

  if (libraries.length === 0) {
    return (
      <EmptyState
        icon={ServerOff}
        title={`No ${category} libraries`}
        hint="Run library discovery in Settings, or add a server address."
      />
    );
  }

  return (
    <div className="page-enter px-5 sm:px-7 py-7">
      <header className="mb-6">
        <p className="eyebrow mb-2">On your server</p>
        <h1 className="font-display text-3xl">{HEADINGS[category] || 'Library'}</h1>
      </header>

      {/* Which library */}
      {libraries.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {libraries.map(lib => (
            <Chip
              key={lib.key}
              active={lib.key === library.key}
              muted={lib.online === false}
              onClick={() => setParams({ lib: lib.key })}
            >
              {lib.label}
              {lib.online === false && <span className="data ml-1.5">offline</span>}
            </Chip>
          ))}
        </div>
      )}

      {/* Which slice of it — years or letters, never shown as folder cards */}
      {index.sections.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-4">
          {index.sections.map(s => (
            <Chip
              key={s.key}
              small
              active={s.key === section?.key}
              onClick={() => setParams({ lib: libKey, s: s.key })}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      )}

      {index.error && (
        <Notice tone="error" title="Could not read this library">
          {index.error}. That server may be switched off.
        </Notice>
      )}

      {slice.error && !index.error && (
        <Notice tone="error" title="Could not read this section">{slice.error}</Notice>
      )}

      {!loading && !index.error && slice.titles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="control flex items-center gap-2 px-3 h-9 flex-1 min-w-[180px] max-w-xs">
            <Search size={15} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
            <input
              type="search"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter these titles"
              aria-label="Filter titles"
              className="flex-1 bg-transparent text-[14px] outline-none min-w-0"
            />
            {filter && (
              <button onClick={() => setFilter('')} aria-label="Clear filter" style={{ color: 'var(--text-dim)' }}>
                <X size={14} />
              </button>
            )}
          </div>

          <p className="data">
            {matching.length} title{matching.length === 1 ? '' : 's'}
            {section && index.sections.length > 1 ? ` · ${section.label}` : ''}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 18 }, (_, i) => <PosterSkeleton key={i} />)}
        </div>
      ) : matching.length === 0 && !index.error ? (
        <EmptyState
          icon={FolderOpen}
          title={filter ? 'Nothing matches that filter' : 'Nothing here'}
          hint={filter ? 'Try fewer words.' : 'This part of the library holds no playable media.'}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            {visible.map(file => <PosterCard key={file.url} file={file} />)}
          </div>

          {pageCount > 1 && (
            <nav className="flex items-center justify-center gap-3 mt-10" aria-label="Pagination">
              <button
                onClick={() => { setPage(current - 1); window.scrollTo(0, 0); }}
                disabled={current === 1}
                className="control flex items-center gap-1.5 px-4 h-10 text-[15px] disabled:opacity-30"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                Previous
              </button>
              <span className="mono text-[13px] px-2" style={{ color: 'var(--text-dim)' }}>
                {current} / {pageCount}
              </span>
              <button
                onClick={() => { setPage(current + 1); window.scrollTo(0, 0); }}
                disabled={current === pageCount}
                className="control flex items-center gap-1.5 px-4 h-10 text-[15px] disabled:opacity-30"
              >
                Next
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ active, small, muted, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex-shrink-0 rounded-lg transition-colors ${small ? 'px-3 h-8 text-[13px]' : 'px-3.5 h-9 text-[14px]'}`}
      style={{
        background: active ? 'var(--accent)' : 'var(--ink-800)',
        color: active ? 'var(--accent-ink)' : 'var(--text-soft)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        fontWeight: active ? 600 : 400,
        fontFamily: small ? 'var(--font-mono)' : 'inherit',
        opacity: muted && !active ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}
