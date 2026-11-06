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
import { useCatalog } from '../lib/useCatalog';
import { queryCatalog, facets, needsIndex, RATINGS, YEARS, SORTS } from '../lib/catalog-query';
import { languageName } from '../lib/genres';

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
  const [sort, setSort] = useState(() => {
    const wanted = params.get('sort');
    return SORTS.some(o => o.key === wanted) ? wanted : 'server';
  });
  const [genre, setGenre] = useState(null);
  const [minRating, setMinRating] = useState(0);
  const [year, setYear] = useState('all');
  const [language, setLanguage] = useState(null);
  const [page, setPage] = useState(1);

  // What TMDB says about every title here: genres, rating, year, language.
  const catalog = useCatalog(library);
  const facet = useMemo(() => facets(catalog.records), [catalog.records]);
  const catalogFilters = { genre, minRating, year, language, sort, text: filter };
  const wholeLibrary = needsIndex(catalogFilters);

  // Reset paging whenever the slice being viewed changes.
  const viewKey = `${libKey}|${section?.key}|${filter}|${sort}|${genre}|${minRating}|${year}|${language}`;
  const [lastViewKey, setLastViewKey] = useState(viewKey);
  if (viewKey !== lastViewKey) {
    setLastViewKey(viewKey);
    setPage(1);
  }

  const matching = useMemo(() => {
    // Genre, rating, year, language and the rating/date sorts need to know about
    // every title, so they read the whole-library index instead of one section.
    if (wholeLibrary) {
      return queryCatalog(catalog.records, catalogFilters).map(r => ({
        name: r.name, url: r.url, type: r.fileType,
      }));
    }

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
    // catalogFilters is rebuilt every render from the values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholeLibrary, catalog.records, slice.titles, filter, sort, genre, minRating, year, language]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const visible = matching.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const indexingNow = catalog.state.running;
  const loading = wholeLibrary
    ? catalog.records.length === 0 && indexingNow
    : indexLoading || titlesLoading;

  const resetFilters = () => {
    setParams({}); setFilter(''); setSort('server');
    setGenre(null); setMinRating(0); setYear('all'); setLanguage(null);
  };
  const activeTags = [
    libraries[0] && library && library.key !== libraries[0].key
      ? { key: 'lib', label: library.label, clear: () => setParams({}) } : null,
    section && index.sections[0] && section.key !== index.sections[0].key
      ? { key: 'section', label: section.label, clear: () => setParams({ lib: libKey }) } : null,
    filter.trim()
      ? { key: 'q', label: `\u201c${filter.trim()}\u201d`, clear: () => setFilter('') } : null,
    sort !== 'server'
      ? { key: 'sort', label: SORTS.find(o => o.key === sort).label, clear: () => setSort('server') } : null,
    genre ? { key: 'genre', label: genre, clear: () => setGenre(null) } : null,
    minRating ? { key: 'rating', label: `${minRating}+ rating`, clear: () => setMinRating(0) } : null,
    year !== 'all' ? { key: 'year', label: YEARS.find(y => y.key === year).label, clear: () => setYear('all') } : null,
    language ? { key: 'lang', label: languageName(language), clear: () => setLanguage(null) } : null,
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

        {!wholeLibrary && index.sections.length > 1 && (
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

        <FilterMenu label="Genre" value={genre || 'Any'}>
          {({ close }) => (
            <>
              <MenuItem selected={!genre} onClick={() => { setGenre(null); close(); }}>Any genre</MenuItem>
              {facet.genres.map(([name, count]) => (
                <MenuItem key={name} selected={genre === name} hint={count} onClick={() => { setGenre(name); close(); }}>
                  {name}
                </MenuItem>
              ))}
              {facet.genres.length === 0 && <IndexingHint state={catalog.state} />}
            </>
          )}
        </FilterMenu>

        <FilterMenu label="Rating" value={RATINGS.find(r => r.key === minRating).label}>
          {({ close }) => RATINGS.map(r => (
            <MenuItem key={r.key} selected={r.key === minRating} onClick={() => { setMinRating(r.key); close(); }}>
              {r.label}
            </MenuItem>
          ))}
        </FilterMenu>

        <FilterMenu label="Released" value={YEARS.find(y => y.key === year).label}>
          {({ close }) => YEARS.map(y => (
            <MenuItem key={y.key} selected={y.key === year} onClick={() => { setYear(y.key); close(); }}>
              {y.label}
            </MenuItem>
          ))}
        </FilterMenu>

        {facet.languages.length > 1 && (
          <FilterMenu label="Language" value={language ? languageName(language) : 'Any'}>
            {({ close }) => (
              <>
                <MenuItem selected={!language} onClick={() => { setLanguage(null); close(); }}>Any language</MenuItem>
                {facet.languages.slice(0, 14).map(([code, count]) => (
                  <MenuItem key={code} selected={language === code} hint={count} onClick={() => { setLanguage(code); close(); }}>
                    {languageName(code)}
                  </MenuItem>
                ))}
              </>
            )}
          </FilterMenu>
        )}

        {!loading && !index.error && (wholeLibrary || slice.titles.length > 0) && (
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
              {wholeLibrary ? ' \u00b7 whole library' : section && index.sections.length > 1 ? ` \u00b7 ${section.label}` : ''}
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

      {(indexingNow || catalog.state.error) && (
        <IndexProgress state={catalog.state} filtering={wholeLibrary} />
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
          title={filter || wholeLibrary ? 'Nothing matches those filters' : 'Nothing here'}
          hint={wholeLibrary
            ? (indexingNow ? 'Still reading your library \u2014 more titles may appear.' : 'Try loosening a filter.')
            : filter ? 'Try fewer words.' : 'This part of the library holds no playable media.'}
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

function IndexingHint({ state }) {
  return (
    <p className="px-3 py-2 text-[13px]" style={{ color: 'var(--text-dim)', maxWidth: 260 }}>
      {state.running
        ? 'Genres appear as your titles are matched.'
        : 'No genres yet. Titles TMDB cannot match have none.'}
    </p>
  );
}

/** The background job's progress, under the filters. */
function IndexProgress({ state, filtering }) {
  if (state.error && !state.running) {
    return (
      <div className="mb-5">
        <Notice tone="warn" title="Could not read your library for filters">
          {state.error}. Genre, rating, year and language filters need it.
        </Notice>
      </div>
    );
  }

  const pct = state.total ? Math.min(100, Math.round((state.done / state.total) * 100)) : 0;
  return (
    <div className="mb-5 control px-4 py-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4 text-[14px]">
        <span>
          Reading your library for filters
          <span className="mono ml-2" style={{ color: 'var(--text-dim)' }}>
            {state.done.toLocaleString()} / {state.total.toLocaleString()}
          </span>
        </span>
        <span className="data">{filtering ? 'results fill in as it goes' : 'you can keep browsing'}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ink-700)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}
