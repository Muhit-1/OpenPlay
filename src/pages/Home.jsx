// src/pages/Home.jsx
//
// The hero is the server itself — you are browsing a machine on your ISP's
// network, and whether it is answering is the first thing worth knowing.
//
// Below that, every row is media. The previous version rendered the server's
// own directory buckets as cards, so the page offered you "TV Series ♦ M — R"
// as though it were something to watch. Rows now reach through the buckets and
// show titles; the buckets live in the Movies / Series / Animation pages as a
// tab strip, where an index belongs.

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HardDrive, ArrowRight, Settings as SettingsIcon, Play } from 'lucide-react';
import Row from '../components/Row';
import { Spinner, Notice } from '../components/ui';
import { fetchDirectory, fetchTrending, fetchByGenre } from '../lib/tmdb';
import { getContinueWatching } from '../lib/firebase';
import { librariesFor, libraryIndex, libraryTitles } from '../lib/server';

const GENRE_ROWS = [
  { id: 28,  label: 'Action',          key: 'action' },
  { id: 35,  label: 'Comedy',          key: 'comedy' },
  { id: 27,  label: 'Horror',          key: 'horror' },
  { id: 878, label: 'Science Fiction', key: 'scifi' },
];

export default function Home() {
  const navigate = useNavigate();
  const ispUrl = localStorage.getItem('isp_url');

  const [server, setServer] = useState({ state: 'loading', folders: [], files: [], ms: null, error: null });
  const [continueList, setContinueList] = useState([]);

  const [trendingMovies, setTrendingMovies] = useState([]);
  const [trendingSeries, setTrendingSeries] = useState([]);
  const [genreRows, setGenreRows] = useState([]);
  const [tmdbLoading, setTmdbLoading] = useState(true);

  // Newest slice of each library, resolved to titles.
  const shelves = useMemo(
    () => [...librariesFor('movies'), ...librariesFor('series'), ...librariesFor('animation')]
      .filter(lib => !lib.secondary && lib.online !== false)
      .slice(0, 6),
    []
  );

  useEffect(() => {
    if (!ispUrl) return;
    let live = true;

    const started = performance.now();
    const extra = safeParse(localStorage.getItem('extra_urls'), []);

    Promise.all([ispUrl, ...extra].map(url => fetchDirectory(url))).then(results => {
      if (!live) return;
      const ms = Math.round(performance.now() - started);
      setServer({
        state: results.some(r => (r.folders?.length || r.files?.length)) ? 'online' : 'offline',
        folders: results.flatMap(r => r.folders || []),
        files: results.flatMap(r => r.files || []),
        ms,
        error: results.map(r => r.error).filter(Boolean)[0] || null,
      });
    });

    getContinueWatching(12).then(list => live && setContinueList(list)).catch(() => {});
    return () => { live = false; };
  }, [ispUrl]);

  useEffect(() => {
    let live = true;

    (async () => {
      const [movies, series] = await Promise.all([
        fetchTrending('movie', 'week'),
        fetchTrending('tv', 'week'),
      ]);
      if (!live) return;
      setTrendingMovies(movies);
      setTrendingSeries(series);
      setTmdbLoading(false);

      const rows = await Promise.all(
        GENRE_ROWS.map(async g => ({ ...g, items: await fetchByGenre(g.id, 'movie') }))
      );
      if (live) setGenreRows(rows.filter(r => r.items.length));
    })();

    return () => { live = false; };
  }, []);

  if (!ispUrl) return <FirstRun navigate={navigate} />;

  return (
    <div className="page-enter py-7">
      <ServerHeader server={server} url={ispUrl} navigate={navigate} />

      {continueList.length > 0 && (
        <Row
          eyebrow="Where you left off"
          title="Continue watching"
          files={continueList.map(item => ({ name: item.title, url: item.fileUrl, type: 'video' }))}
        />
      )}

      {server.state === 'offline' && server.error && (
        <div className="px-5 sm:px-7 mb-9">
          <Notice tone="error" title="Could not read the server">
            {server.error}. Check the address in Settings, and that you are on your ISP's network.
          </Notice>
        </div>
      )}

      {server.state === 'loading' ? (
        <div className="px-5 sm:px-7 mb-9"><Spinner label="Reading directory" /></div>
      ) : (
        shelves.map((lib, i) => (
          <LibraryShelf key={lib.key} library={lib} navigate={navigate} eager={i < 2} />
        ))
      )}

      <Row
        eyebrow="TMDB"
        title="Trending films this week"
        items={trendingMovies}
        loading={tmdbLoading}
      />

      <Row
        eyebrow="TMDB"
        title="Trending series this week"
        items={trendingSeries}
        loading={tmdbLoading}
      />

      {genreRows.map(row => (
        <Row
          key={row.key}
          eyebrow="TMDB"
          title={row.label}
          items={row.items}
          moreHref={`/channel/${encodeURIComponent(row.label)}?type=genre`}
        />
      ))}
    </div>
  );
}

/* ── Server instrument panel ─────────────────────────────────────────────── */

function ServerHeader({ server, url, navigate }) {
  const host = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const videoCount = server.files.filter(f => f.type === 'video').length;

  const state = {
    loading: { color: 'var(--text-dim)', label: 'Connecting' },
    online:  { color: 'var(--ok)',       label: 'Online' },
    offline: { color: 'var(--error)',    label: 'Unreachable' },
  }[server.state];

  return (
    <header className="px-5 sm:px-7 mb-9">
      <div className="panel px-5 sm:px-6 py-5 flex flex-wrap items-center gap-x-8 gap-y-4">
        {/* min-width keeps the address readable; below it the block wraps */}
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`chip-dot ${server.state === 'loading' ? 'pulse' : ''}`}
              style={{
                color: state.color,
                boxShadow: server.state === 'online' ? `0 0 8px ${state.color}` : 'none',
              }}
              aria-hidden="true"
            />
            <span className="eyebrow" style={{ color: state.color }}>{state.label}</span>
          </div>
          <h1 className="mono text-[17px] sm:text-lg truncate">{host}</h1>
        </div>

        <dl className="flex items-center gap-7">
          <Stat label="Folders" value={server.state === 'loading' ? '—' : server.folders.length} />
          <Stat label="Files" value={server.state === 'loading' ? '—' : videoCount} />
          {/* A repeat visit is served from the directory cache, which is not a
              network measurement — say so rather than reporting a bogus 0 ms. */}
          <Stat
            label="Latency"
            value={server.ms == null ? '—' : server.ms < 2 ? 'cached' : `${server.ms} ms`}
          />
        </dl>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/movies')}
            className="btn-accent flex items-center gap-2 px-4 h-10 rounded-[10px] text-[15px]"
          >
            <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            Browse library
          </button>
          <button
            onClick={() => navigate('/browse')}
            className="control flex items-center gap-1.5 px-3.5 h-10 text-[15px]"
            style={{ color: 'var(--text-soft)' }}
          >
            <HardDrive size={14} aria-hidden="true" />
            Files
          </button>
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="mono text-[15px] tabular-nums" style={{ color: 'var(--text-soft)' }}>{value}</dd>
    </div>
  );
}

/* ── One row per library, showing its newest titles ──────────────────────── */

function LibraryShelf({ library, navigate, eager = false }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  const [titles, setTitles] = useState(null);

  // A shelf costs two directory reads, so the ones further down wait until they
  // are scrolled near. The first few load immediately: they are above the fold,
  // and an observer that never fires (background tab, embedded webview) would
  // otherwise leave the page permanently empty.
  const visible = eager || seen;

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setSeen(true); },
      { rootMargin: '500px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;

    (async () => {
      const index = await libraryIndex(library);
      if (!live) return;

      // sections are newest-first, so the head is the current year / first letter
      const section = index.sections[0];
      if (!section) { setTitles([]); return; }

      const { titles: found } = await libraryTitles(section.url);
      if (live) setTitles(found.slice(0, 24));
    })();

    return () => { live = false; };
  }, [visible, library]);

  const section = library.category === 'series' ? 'series'
    : library.category === 'animation' ? 'animation' : 'movies';

  if (!visible) {
    return <div ref={ref} style={{ height: 'calc(var(--card-height) + 96px)' }} aria-hidden="true" />;
  }

  if (titles === null) {
    return <div ref={ref}><Row eyebrow="On your server" title={library.label} loading /></div>;
  }

  if (titles.length === 0) return <div ref={ref} />;

  return (
    <div ref={ref}>
      <Row
        eyebrow="On your server"
        title={library.label}
        files={titles}
        action={
          <button
            onClick={() => navigate(`/${section}?lib=${encodeURIComponent(library.key)}`)}
            className="control flex items-center gap-1 px-2.5 h-8 text-[13px]"
            style={{ color: 'var(--text-soft)' }}
          >
            All
            <ArrowRight size={12} aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}

/* ── First run ───────────────────────────────────────────────────────────── */

function FirstRun({ navigate }) {
  return (
    <div className="page-enter min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <img src="/logo.png" alt="" width={72} height={72} className="mx-auto mb-6" />

        <h1 className="font-display text-3xl mb-3">Connect your server</h1>
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'var(--text-soft)' }}>
          Give OpenPlay your ISP's portal address and it will find every library on it —
          across all of their servers — and turn them into a browsable catalogue.
        </p>

        <button
          onClick={() => navigate('/settings')}
          className="btn-accent inline-flex items-center gap-2 px-5 h-11 rounded-[10px] text-[15px]"
        >
          <SettingsIcon size={15} aria-hidden="true" />
          Open settings
        </button>
      </div>
    </div>
  );
}

function safeParse(raw, fallback) {
  try { return JSON.parse(raw || '') ?? fallback; } catch { return fallback; }
}
