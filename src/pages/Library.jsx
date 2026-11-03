// src/pages/Library.jsx
//
// Movies, Series and Animation all render through here.
//
// The point of this page is that it shows *titles*. The server organises its
// content into year buckets and alphabetical buckets, and Home used to surface
// those buckets as cards — you clicked "TV Series ♦ M — R" and got a filing
// cabinet. Here the buckets become filters (library, year or letters, sort) and
// the grid is always media.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ServerOff, FolderOpen, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import PosterCard from '../components/PosterCard';
import { PosterSkeleton, EmptyState, Notice } from '../components/ui';
import FilterMenu, { MenuItem } from '../components/FilterMenu';
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
  const [sort, setSort] = useState('server');
  const [page, setPage] = useState(1);

  // Reset paging whenever the slice being viewed changes.
  const viewKey = `${libKey}|${section?.key}|${filter}|${sort}`;
  const [lastViewKey, setLastViewKey] = useState(viewKey);
  if (viewKey !== lastViewKey) {
    setLastViewKey(viewKey);
    setPage(1);
  }

  const matching = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const found = !needle ? slice.titles : slice.titles.filter(t =>
      t.name.toLowerCase().includes(needle) ||
      parseRelease(t.name).title.toLowerCase().includes(needle)
    );
    if (sort === 'server') return found;

    const label = t => parseRelease(t.name).title || t.name;
    return [...found].sort((a, b) =>
      label(a).localeCompare(label(b), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [slice.titles, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const visible = matching.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const loading = indexLoading || titlesLoading;

  const resetFilters = () => { setParams({}); setFilter(''); setSort('server'); };
  const activeTags = [
    libraries[0] && library && library.key !== libraries[0].key
      ? { key: 'lib', label: library.label, clear: () => setParams({}) } : null,
    section && index.sections[0] && section.key !== index.sections[0].key
      ? { key: 'section', label: section.label, clear: () => setParams({ lib: libKey }) } : null,
    filter.trim()
      ? { key: 'q', label: `\u201c${filter.trim()}\u201d`, clear: () => setFilter('') } : null,
    sort !== 'server'
      ? { key: 'sort', label: SORTS.find(o => o.key === sort).label, clear: () => setSort('server') } : null,
  ].filter(Boolean);

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

      {/* Library, year (or letters) and sort are filters, not rows of buttons */}
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        {libraries.length > 1 && (
          <FilterMenu label="Library" value={library.label}>
            {({ close }) => libraries.map(lib => (
              <MenuItem
                key={lib.key}
                selected={lib.key === library.key}
                dot={lib.online !== false}
                onClick={() => { setParams({ lib: lib.key }); close(); }}
              >
                {lib.label}
                {lib.online === false && <span className="data ml-2">offline</span>}
              </MenuItem>
            ))}
          </FilterMenu>
        )}

        {index.sections.length > 1 && (
          <FilterMenu label={index.shape === 'years' ? 'Year' : 'Section'} value={section?.label || ''}>
            {({ close }) => (
              <SectionPicker
                sections={index.sections}
                activeKey={section?.key}
                onPick={key => { setParams({ lib: libKey, s: key }); close(); }}
              />
            )}
          </FilterMenu>
        )}

        <FilterMenu label="Sort" value={SORTS.find(o => o.key === sort).label}>
          {({ close }) => SORTS.map(o => (
            <MenuItem key={o.key} selected={o.key === sort} onClick={() => { setSort(o.key); close(); }}>
              {o.label}
            </MenuItem>
          ))}
        </FilterMenu>

        {!loading && !index.error && slice.titles.length > 0 && (
          <>
            <div className="control flex items-center gap-2 px-3 h-10 flex-1 min-w-[200px] max-w-sm">
              <Search size={15} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
              <input
                type="search"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter these titles"
                aria-label="Filter titles"
                className="flex-1 bg-transparent text-[14.5px] outline-none min-w-0"
              />
            </div>

            <p className="data sm:ml-auto">
              {matching.length} title{matching.length === 1 ? '' : 's'}
              {section && index.sections.length > 1 ? ` · ${section.label}` : ''}
            </p>
          </>
        )}
      </div>

      {activeTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {activeTags.map(tag => (
            <span key={tag.key} className="filter-tag">
              {tag.label}
              <button onClick={tag.clear} aria-label={`Remove filter ${tag.label}`}>
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            onClick={resetFilters}
            className="text-[13px] underline underline-offset-4"
            style={{ color: 'var(--text-dim)' }}
          >
            Reset filters
          </button>
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

const SORTS = [
  { key: 'server', label: 'Server order' },
  { key: 'az',     label: 'Title A\u2013Z' },
];

/**
 * Years and other short labels read best as a grid; a long one ("2005 & Before")
 * takes a full row. A list of mostly long labels stays a list.
 */
function SectionPicker({ sections, activeKey, onPick }) {
  const isShort = s => s.label.length <= 6;
  const compact = sections.filter(isShort).length >= sections.length * 0.6;

  if (!compact) {
    return sections.map(s => (
      <MenuItem key={s.key} selected={s.key === activeKey} onClick={() => onPick(s.key)}>
        {s.label}
      </MenuItem>
    ));
  }

  return (
    <div className="grid grid-cols-4 gap-1 p-0.5" style={{ width: 288 }}>
      {sections.map(s => (
        <button
          key={s.key}
          type="button"
          role="option"
          aria-selected={s.key === activeKey}
          onClick={() => onPick(s.key)}
          className={`h-9 rounded-lg mono text-[14px] transition-colors ${isShort(s) ? '' : 'col-span-4 text-left px-3'}`}
          style={{
            background: s.key === activeKey ? 'var(--accent)' : 'transparent',
            color: s.key === activeKey ? 'var(--accent-ink)' : 'var(--text-soft)',
            fontWeight: s.key === activeKey ? 600 : 400,
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
