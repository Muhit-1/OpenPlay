// src/pages/Search.jsx
//
// One search box, two sources.
//
// The old page only walked the server's directory tree, so searching for a film
// you knew existed returned nothing unless its filename happened to contain
// your words. It now asks TMDB as well, which means you can search the way you
// think — by title, by actor — and still see what is actually on the server.

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SearchX, Square, Search as SearchIcon, HardDrive, Clapperboard, Users } from 'lucide-react';
import PosterCard from '../components/PosterCard';
import { EmptyState, Spinner, PosterSkeleton } from '../components/ui';
import { listDir } from '../lib/server';
import { searchTmdb } from '../lib/tmdb';
import { useAsync } from '../lib/useAsync';

const MAX_DEPTH   = 3;
const MAX_RESULTS = 120;
const CONCURRENCY = 6;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') || '').trim();
  // `typed` holds edits since the last committed search; null means "show the
  // query from the URL". Avoids an effect that resets state on every change.
  const [typed, setTyped] = useState(null);
  const [lastQuery, setLastQuery] = useState(query);

  if (query !== lastQuery) {
    setLastQuery(query);
    setTyped(null);
  }

  const draft = typed ?? query;
  const setDraft = setTyped;

  // ── TMDB ──
  const { data: tmdb, loading: tmdbLoading } = useAsync(
    query || null,
    () => searchTmdb(query),
    { titles: [], people: [] }
  );

  // ── Server ──
  const [run, setRun] = useState({ query: null, results: [], scanned: 0, running: false });
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    const root = localStorage.getItem('isp_url');
    if (!query || !root) return;

    const token = { cancelled: false };
    cancelRef.current = token;
    const extra = safeParse(localStorage.getItem('extra_urls'), []);

    walk([root, ...extra], query.toLowerCase(), token, {
      onHit: hits => setRun(prev => ({
        ...prev,
        query,
        running: true,
        results: dedupe([...(prev.query === query ? prev.results : []), ...hits]).slice(0, MAX_RESULTS),
      })),
      onProgress: n => setRun(prev => ({ ...prev, query, running: true, scanned: n })),
    }).finally(() => {
      if (!token.cancelled) setRun(prev => ({ ...prev, query, running: false }));
    });

    return () => { token.cancelled = true; };
  }, [query]);

  const server = run.query === query ? run : { results: [], scanned: 0, running: !!query };

  const stop = () => {
    cancelRef.current.cancelled = true;
    setRun(prev => ({ ...prev, running: false }));
  };

  const submit = e => {
    e.preventDefault();
    const q = draft.trim();
    if (q) setParams({ q });
  };

  const nothing =
    !!query && !tmdbLoading && !server.running &&
    tmdb.titles.length === 0 && tmdb.people.length === 0 && server.results.length === 0;

  return (
    <div className="page-enter px-5 sm:px-7 py-7">
      <header className="mb-8">
        <p className="eyebrow mb-2">Search</p>
        <h1 className="font-display text-3xl mb-5">
          {query ? <>Results for &ldquo;{query}&rdquo;</> : 'Find something to watch'}
        </h1>

        <form onSubmit={submit} className="max-w-xl">
          <div className="control flex items-center gap-2 px-3.5 h-12">
            <SearchIcon size={17} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
            <input
              type="search"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Title, actor, director, or a filename"
              aria-label="Search"
              autoFocus={!query}
              className="flex-1 bg-transparent text-[15px] outline-none min-w-0"
            />
          </div>
        </form>
      </header>

      {!query && (
        <EmptyState
          icon={SearchIcon}
          title="Search TMDB and your server at once"
          hint="Type a title to see what exists and whether your server has it, or a name to open that person's channel."
        />
      )}

      {/* People — routes into the channel pages */}
      {tmdb.people.length > 0 && (
        <Section icon={Users} title="People" count={tmdb.people.length}>
          <div className="row-track pb-2" style={{ paddingInline: 0 }}>
            {tmdb.people.map(person => <PersonCard key={person.id} person={person} />)}
          </div>
        </Section>
      )}

      {/* TMDB titles */}
      {(tmdbLoading || tmdb.titles.length > 0) && (
        <Section icon={Clapperboard} title="Films and series" count={tmdb.titles.length}>
          <div className="flex flex-wrap gap-4">
            {tmdbLoading
              ? Array.from({ length: 8 }, (_, i) => <PosterSkeleton key={i} />)
              : tmdb.titles.map(item => <PosterCard key={`${item.type}-${item.id}`} item={item} />)}
          </div>
        </Section>
      )}

      {/* Server hits */}
      {(server.running || server.results.length > 0) && (
        <Section
          icon={HardDrive}
          title="Files on your server"
          count={server.results.length}
          aside={
            server.running && (
              <div className="flex items-center gap-3">
                <span className="data">{server.scanned} folders scanned</span>
                <Spinner size={13} />
                <button
                  onClick={stop}
                  className="control flex items-center gap-1.5 px-2.5 h-7 text-xs"
                  style={{ color: 'var(--text-dim)' }}
                >
                  <Square size={11} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  Stop
                </button>
              </div>
            )
          }
        >
          <div className="flex flex-wrap gap-4">
            {server.results.map(file => <PosterCard key={file.url} file={file} />)}
          </div>
        </Section>
      )}

      {nothing && (
        <EmptyState
          icon={SearchX}
          title="Nothing found"
          hint={`Neither TMDB nor your server has anything matching "${query}".`}
        />
      )}
    </div>
  );
}

function Section({ icon: Icon, title, count, aside, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="flex items-center gap-2 font-display text-lg">
          {Icon && <Icon size={16} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />}
          {title}
          {count > 0 && <span className="data">{count}</span>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function PersonCard({ person }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/channel/${person.id}?type=person`)}
      className="flex-shrink-0 w-28 text-center group"
    >
      <div
        className="w-20 h-20 mx-auto rounded-full overflow-hidden mb-2.5 transition-all"
        style={{ background: 'var(--ink-850)', border: '1px solid var(--line)' }}
      >
        {person.profile ? (
          <img src={person.profile} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span
            className="w-full h-full flex items-center justify-center font-display text-xl"
            style={{ color: 'var(--text-faint)' }}
          >
            {person.name[0]}
          </span>
        )}
      </div>
      <p className="text-[13px] font-medium leading-tight truncate-2">{person.name}</p>
      {person.knownFor && <p className="data mt-1">{person.knownFor}</p>}
    </button>
  );
}

/**
 * Breadth-first walk with a fixed number of in-flight requests.
 * Matches are reported as they are found rather than at the end.
 */
async function walk(roots, needle, token, { onHit, onProgress }) {
  let frontier = roots.map(url => ({ url, depth: 0 }));
  let scanned = 0;
  let found = 0;

  while (frontier.length && !token.cancelled && found < MAX_RESULTS) {
    const batch = frontier.splice(0, CONCURRENCY);

    const listings = await Promise.all(
      batch.map(node => listDir(node.url).then(data => ({ node, data })))
    );
    if (token.cancelled) return;

    const next = [];
    const hits = [];

    for (const { node, data } of listings) {
      scanned++;

      for (const file of data.files) {
        if (file.type === 'video' && file.name.toLowerCase().includes(needle)) hits.push(file);
      }

      if (node.depth < MAX_DEPTH) {
        for (const folder of data.folders) {
          // A folder whose own name matches is a title folder; its contents are
          // what was asked for, so it is worth one extra level.
          const matched = folder.name.toLowerCase().includes(needle);
          next.push({ url: folder.url, depth: matched ? node.depth : node.depth + 1 });
        }
      }
    }

    if (hits.length) { found += hits.length; onHit(hits); }
    onProgress(scanned);

    frontier = frontier.concat(next);
  }
}

function dedupe(files) {
  const seen = new Set();
  return files.filter(f => (seen.has(f.url) ? false : (seen.add(f.url), true)));
}

function safeParse(raw, fallback) {
  try { return JSON.parse(raw || '') ?? fallback; } catch { return fallback; }
}
