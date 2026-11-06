// src/pages/Library.jsx
//
// Movies, Series and Animation all render through here.
//
// The point of this page is that it shows *titles*. The server organises its
// content into year buckets and alphabetical buckets, and Home used to surface
// those buckets as cards — you clicked "TV Series ♦ M — R" and got a filing
// cabinet. Here the buckets become filters (library, year or letters, sort) and
// the grid is always media.
//
// The whole view lives in the address (see lib/libraryParams.js): filters, sort,
// page and the open title. Back, reload and a copied link all return to it, and
// scroll position is restored too. Left-click opens a side panel; Ctrl/Cmd or
// middle-click opens the title's page in a new tab.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { readView, patchParams, scrollKey } from '../lib/libraryParams';
import { useScrollMemory } from '../lib/useScrollMemory';
import { safeDecode } from '../lib/text';
import PreviewPanel from '../components/PreviewPanel';

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

  // The view comes from the address; every change writes back to it (replacing the
  // history entry, so Back leaves the page instead of stepping through filters).
  const view = readView(params);
  const { filter, sort, quals, genre, minRating, year, language, page } = view;

  const update = useCallback(
    patch => setParams(prev => patchParams(prev, patch), { replace: true }),
    [setParams]
  );
  const setFilter    = v => update({ q: v });
  const setSort      = v => update({ sort: v });
  const setGenre     = v => update({ g: v });
  const setMinRating = v => update({ r: v });
  const setYear      = v => update({ y: v });
  const setLanguage  = v => update({ l: v });
  const setQuals     = v => update({ qual: typeof v === 'function' ? v(quals) : v });
  const setPage      = v => update({ p: v });

  // Typing edits a local draft and reaches the address a moment later, so the
  // input never fights the router for the caret.
  const [draft, setDraft] = useState(null);
  const draftTimer = useRef(0);
  const onTextChange = e => {
    const value = e.target.value;
    setDraft(value);
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => { update({ q: value }); setDraft(null); }, 220);
  };
  useEffect(() => () => clearTimeout(draftTimer.current), []);
  const shownText = draft ?? filter;

  const filterInput = useRef(null);

  // What TMDB says about every title here: genres, rating, year, language.
  const catalog = useCatalog(library);
  const facet = useMemo(() => facets(catalog.records), [catalog.records]);
  const catalogFilters = { genre, minRating, year, language, sort, text: filter };
  const wholeLibrary = needsIndex(catalogFilters);

  // "F" jumps to the title filter.
  useEffect(() => {
    const onKey = e => {
      if ((e.key !== 'f' && e.key !== 'F') || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      filterInput.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Resolutions present in what is being shown, read from the release names.
  const resolutionSource = wholeLibrary ? catalog.records : slice.titles;
  const resolutions = useMemo(() => {
    const found = new Set();
    for (const t of resolutionSource) { const r = resolutionOf(t.name); if (r) found.add(r); }
    return [...found].sort((a, b) => RESOLUTION_ORDER.indexOf(a) - RESOLUTION_ORDER.indexOf(b));
  }, [resolutionSource]);

  const matching = useMemo(() => {
    // Genre, rating, year, language and the rating/date sorts need to know about
    // every title, so they read the whole-library index instead of one section.
    if (wholeLibrary) {
      let all = queryCatalog(catalog.records, catalogFilters).map(r => ({
        name: r.name, url: r.url, type: r.fileType,
      }));
      if (quals.size) all = all.filter(t => quals.has(resolutionOf(t.name)));
      return all;
    }

    const needle = filter.trim().toLowerCase();
    let found = !needle ? slice.titles : slice.titles.filter(t =>
      t.name.toLowerCase().includes(needle) ||
      parseRelease(t.name).title.toLowerCase().includes(needle)
    );
    if (quals.size) found = found.filter(t => quals.has(resolutionOf(t.name)));
    if (sort === 'server') return found;

    const label = t => parseRelease(t.name).title || t.name;
    return [...found].sort((a, b) =>
      label(a).localeCompare(label(b), undefined, { numeric: true, sensitivity: 'base' })
    );
    // catalogFilters is rebuilt every render from the values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholeLibrary, catalog.records, slice.titles, filter, sort, quals, genre, minRating, year, language]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const visible = matching.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const indexingNow = catalog.state.running;
  const loading = wholeLibrary
    ? catalog.records.length === 0 && indexingNow
    : indexLoading || titlesLoading;

  const resetFilters = () => { setParams({}, { replace: true }); setDraft(null); };
  const activeTags = [
    libraries[0] && library && library.key !== libraries[0].key
      ? { key: 'lib', label: library.label, clear: () => setParams({}, { replace: true }) } : null,
    section && index.sections[0] && section.key !== index.sections[0].key
      ? { key: 'section', label: section.label, clear: () => setParams({ lib: libKey }, { replace: true }) } : null,
    filter.trim()
      ? { key: 'q', label: `\u201c${filter.trim()}\u201d`, clear: () => setFilter('') } : null,
    sort !== 'server'
      ? { key: 'sort', label: SORTS.find(o => o.key === sort).label, clear: () => setSort('server') } : null,
    genre ? { key: 'genre', label: genre, clear: () => setGenre(null) } : null,
    minRating ? { key: 'rating', label: `${minRating}+ rating`, clear: () => setMinRating(0) } : null,
    year !== 'all' ? { key: 'year', label: YEARS.find(y => y.key === year).label, clear: () => setYear('all') } : null,
    language ? { key: 'lang', label: languageName(language), clear: () => setLanguage(null) } : null,
    ...[...quals].map(q => ({
      key: `q-${q}`, label: q,
      clear: () => setQuals(prev => { const next = new Set(prev); next.delete(q); return next; }),
    })),
  ].filter(Boolean);

  const toggleQual = q => setQuals(prev => {
    const next = new Set(prev);
    if (next.has(q)) next.delete(q); else next.add(q);
    return next;
  });

  // ── The title panel ──
  const navigate = useNavigate();
  const location = useLocation();

  // A plain lookup each render: the list is small and this runs once per change.
  let selectedFile = null;
  if (view.item) {
    const known = matching.find(f => f.url === view.item)
      || slice.titles.find(f => f.url === view.item)
      || catalog.records.find(r => r.url === view.item);
    selectedFile = known
      ? { name: known.name, url: known.url, type: known.fileType || known.type }
      // a copied link to a title the current list does not show
      : { name: safeDecode(view.item.replace(/\/+$/, '').split('/').pop() || ''),
          url: view.item, type: view.item.endsWith('/') ? 'folder' : 'video' };
  }

  const openItem = useCallback(file => {
    // Opening pushes an entry, so Back closes the panel; switching titles replaces it.
    setParams(
      prev => patchParams(prev, { item: file.url }),
      { replace: !!params.get('item'), state: { panel: true } }
    );
  }, [setParams, params]);

  const closeItem = useCallback(() => {
    if (location.state?.panel) navigate(-1);       // undo the entry we pushed
    else update({ item: null });
  }, [location.state, navigate, update]);

  // Back to the same place on the page, not the top of the list.
  useScrollMemory(scrollKey(location.pathname, params), !loading && visible.length > 0);

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
    <div className={`page-enter px-5 sm:px-7 py-7 ${selectedFile ? 'has-preview' : ''}`}>
      <header className="mb-6">
        <h1 className="font-display text-[34px] leading-[1.1]">{HEADINGS[category] || 'Library'}</h1>
        <p className="mt-1.5" style={{ color: 'var(--text-dim)' }}>
          {library.label}
          {!loading && !index.error ? ` \u00b7 ${matching.length} title${matching.length === 1 ? '' : 's'}` : ''}
          {wholeLibrary ? ' \u00b7 whole library' : section && index.sections.length > 1 ? ` \u00b7 ${section.label}` : ''}
        </p>
      </header>

      {/* Library, year (or letters) and sort are filters, not rows of buttons */}
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        {!loading && !index.error && (wholeLibrary || slice.titles.length > 0) && (
          <label className="well flex-1 min-w-[220px] max-w-[380px]">
            <Search size={17} className="well-icon" aria-hidden="true" />
            <input
              ref={filterInput}
              type="search"
              value={shownText}
              onChange={onTextChange}
              placeholder="Filter these titles"
              aria-label="Filter titles"
              aria-keyshortcuts="F"
            />
            {!shownText && <kbd className="kbd hidden sm:inline-grid" aria-hidden="true">F</kbd>}
          </label>
        )}

        {libraries.length > 1 && (
          <FilterMenu
            label="Library"
            value={library.label}
            active={libraries[0] && library.key !== libraries[0].key}
            searchable={libraries.length > 8 ? 'Find a library' : undefined}
          >
            {({ close, query }) => libraries
              .filter(lib => !query || lib.label.toLowerCase().includes(query.toLowerCase()))
              .map(lib => (
                <MenuItem
                  key={lib.key}
                  selected={lib.key === library.key}
                  dot={lib.online !== false}
                  onClick={() => { setParams({ lib: lib.key }, { replace: true }); close(); }}
                >
                  {lib.label}
                  {lib.online === false && <span className="data ml-2">offline</span>}
                </MenuItem>
              ))}
          </FilterMenu>
        )}

        {!wholeLibrary && index.sections.length > 1 && (
          <FilterMenu
            label={index.shape === 'years' ? 'Year' : 'Section'}
            value={section?.label || ''}
            active={section && index.sections[0] && section.key !== index.sections[0].key}
          >
            {({ close }) => (
              <SectionPicker
                sections={index.sections}
                activeKey={section?.key}
                onPick={key => { setParams({ lib: libKey, s: key }, { replace: true }); close(); }}
              />
            )}
          </FilterMenu>
        )}

        {resolutions.length > 1 && (
          <FilterMenu
            label="Quality"
            value={quals.size === 0 ? 'Any' : quals.size > 2 ? `${quals.size} selected` : [...quals].join(', ')}
            active={quals.size > 0}
            footer="Pick as many as you like"
            onClear={() => setQuals(new Set())}
          >
            {() => resolutions.map(r => (
              <MenuItem key={r} check selected={quals.has(r)} onClick={() => toggleQual(r)}>{r}</MenuItem>
            ))}
          </FilterMenu>
        )}

        <FilterMenu label="Genre" value={genre || 'Any'} active={!!genre}>
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

        <FilterMenu label="Rating" value={RATINGS.find(r => r.key === minRating).label} active={minRating > 0}>
          {({ close }) => RATINGS.map(r => (
            <MenuItem key={r.key} selected={r.key === minRating} onClick={() => { setMinRating(r.key); close(); }}>
              {r.label}
            </MenuItem>
          ))}
        </FilterMenu>

        <FilterMenu label="Released" value={YEARS.find(y => y.key === year).label} active={year !== 'all'}>
          {({ close }) => YEARS.map(y => (
            <MenuItem key={y.key} selected={y.key === year} onClick={() => { setYear(y.key); close(); }}>
              {y.label}
            </MenuItem>
          ))}
        </FilterMenu>

        {facet.languages.length > 1 && (
          <FilterMenu label="Language" value={language ? languageName(language) : 'Any'} active={!!language}>
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

        <div className="sm:ml-auto">
          <FilterMenu label="Sort" value={SORTS.find(o => o.key === sort).label} active={sort !== 'server'} right>
            {({ close }) => SORTS.map(o => (
              <MenuItem key={o.key} selected={o.key === sort} onClick={() => { setSort(o.key); close(); }}>
                {o.label}
              </MenuItem>
            ))}
          </FilterMenu>
        </div>
      </div>

      {activeTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-4 mb-6">
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
        <div className="reveal-list flex flex-wrap gap-4">
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
          <div className="reveal-list flex flex-wrap gap-4">
            {visible.map(file => (
              <PosterCard
                key={file.url}
                file={file}
                selected={file.url === view.item}
                onOpen={openItem}
              />
            ))}
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
      {selectedFile && (
        <PreviewPanel key={selectedFile.url} file={selectedFile} onClose={closeItem} />
      )}
    </div>
  );
}

const RESOLUTION_ORDER = ['4K', '1080p', '720p', '576p', '480p'];

/** "1080p" | "720p" | "4K" | null, from the release name. */
function resolutionOf(name) {
  const r = (parseRelease(name).resolution || '').toLowerCase();
  if (!r) return null;
  if (r === '2160p' || r === '4k' || r === 'uhd') return '4K';
  if (r === '1080i') return '1080p';
  if (r === 'fhd') return '1080p';
  return r;
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
    <div className="year-grid">
      {sections.map(s => (
        <button
          key={s.key}
          type="button"
          role="option"
          aria-selected={s.key === activeKey}
          onClick={() => onPick(s.key)}
          className={isShort(s) ? '' : 'is-wide'}
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
