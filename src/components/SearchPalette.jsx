// src/components/SearchPalette.jsx
//
// The top bar's search: a field that opens into a palette. Empty, it offers
// recent searches and places to jump to. Typed into, the first row is always
// "search everything for …" (so Enter does what it always did), followed by
// matching pages and live suggestions from TMDB.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Clock, ArrowRight, Home, Clapperboard, Tv, Sparkles, History, Bookmark,
  HardDrive, Settings, User, CornerDownLeft,
} from 'lucide-react';
import { searchTmdb } from '../lib/tmdb';
import { getItem, setItem } from '../lib/storage';
import { FadeImg } from './ui';

const PAGES = [
  { label: 'Home',      sub: 'Your server at a glance',  to: '/',          icon: Home },
  { label: 'Movies',    sub: 'Browse the film libraries', to: '/movies',    icon: Clapperboard },
  { label: 'Series',    sub: 'Browse the series libraries', to: '/series',  icon: Tv },
  { label: 'Animation', sub: 'Cartoons and animated films', to: '/animation', icon: Sparkles },
  { label: 'History',   sub: 'What you have played',      to: '/history',   icon: History },
  { label: 'Watchlist', sub: 'Titles you saved',          to: '/watchlist', icon: Bookmark },
  { label: 'Files',     sub: 'The raw directory browser', to: '/browse',    icon: HardDrive },
  { label: 'Settings',  sub: 'Server, playback, subtitles, look', to: '/settings', icon: Settings },
];

const RECENT_KEY = 'recent_searches';
const readRecent = () => { try { return JSON.parse(getItem(RECENT_KEY) || '[]'); } catch { return []; } };

function remember(query) {
  const next = [query, ...readRecent().filter(q => q.toLowerCase() !== query.toLowerCase())].slice(0, 5);
  setItem(RECENT_KEY, JSON.stringify(next));
}

/** Wrap the part of `text` that matches `query` in <mark>. */
function Highlight({ text, query }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

export default function SearchPalette() {
  const navigate = useNavigate();
  const location = useLocation();
  const root = useRef(null);
  const input = useRef(null);

  // The address bar is the source of truth for what was searched; `typed` only
  // holds edits made since, so the field follows navigation without an effect.
  const urlQuery = location.pathname === '/search'
    ? new URLSearchParams(location.search).get('q') || ''
    : '';
  const [typed, setTyped] = useState(null);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) { setLastUrlQuery(urlQuery); setTyped(null); }

  const query = typed ?? urlQuery;
  const needle = query.trim();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [remote, setRemote] = useState({ q: '', titles: [], people: [] });
  const [recent, setRecent] = useState(readRecent);

  // Live suggestions, a beat after typing stops.
  useEffect(() => {
    if (!open || needle.length < 2) return;
    const timer = setTimeout(() => {
      searchTmdb(needle).then(r => setRemote({ q: needle, titles: r.titles || [], people: r.people || [] }));
    }, 250);
    return () => clearTimeout(timer);
  }, [needle, open]);

  // "/" jumps to search from anywhere that is not already a text field.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const sections = useMemo(() => {
    const out = [];
    const live = remote.q === needle;

    if (!needle) {
      if (recent.length) {
        out.push({
          name: 'Recent',
          items: recent.map(q => ({ kind: 'search', label: q, sub: 'Search again', icon: Clock, run: () => runSearch(q) })),
        });
      }
      out.push({
        name: 'Jump to',
        items: PAGES.map(p => ({ kind: 'page', label: p.label, sub: p.sub, icon: p.icon, run: () => go(p.to) })),
      });
      return out;
    }

    out.push({
      name: null,
      items: [{ kind: 'search', label: `Search for “${needle}”`, sub: 'Films, series, people and every file on your server', icon: Search, run: () => runSearch(needle), plain: true }],
    });

    const pages = PAGES.filter(p => p.label.toLowerCase().includes(needle.toLowerCase())).slice(0, 3);
    if (pages.length) {
      out.push({ name: 'Jump to', items: pages.map(p => ({ kind: 'page', label: p.label, sub: p.sub, icon: p.icon, run: () => go(p.to) })) });
    }

    if (live && remote.titles.length) {
      out.push({
        name: 'Films and series',
        items: remote.titles.slice(0, 4).map(t => {
          const label = t.title || t.name || '';
          return {
            kind: 'title', label,
            sub: [t.type === 'tv' ? 'Series' : 'Film', t.year].filter(Boolean).join(' · '),
            image: t.poster,
            run: () => go(`/detail/${t.id}?type=${t.type === 'tv' ? 'tv' : 'movie'}`),
          };
        }),
      });
    }
    if (live && remote.people.length) {
      out.push({
        name: 'People and studios',
        items: remote.people.slice(0, 3).map(p => ({
          kind: 'person', label: p.name, sub: p.knownFor || 'Person', icon: User, image: p.profile,
          run: () => go(`/channel/${p.id}?type=person`),
        })),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, remote, recent]);

  const flat = sections.flatMap(s => s.items);
  const searching = needle.length >= 2 && remote.q !== needle;

  function close() { setOpen(false); input.current?.blur(); }
  function go(to) { close(); navigate(to); }
  function runSearch(q) {
    const text = q.trim();
    if (!text) return;
    remember(text);
    setRecent(readRecent());
    close();
    navigate(`/search?q=${encodeURIComponent(text)}`);
  }

  const onKeyDown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setSelected(i => Math.max(0, Math.min(flat.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = open ? flat[selected] : null;
      if (item) item.run(); else runSearch(query);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  let index = -1;

  return (
    <div ref={root} className="relative flex-1 min-w-0 max-w-[560px]" role="search">
      <label className={`well ${open ? 'is-open' : ''}`}>
        <Search size={18} className="well-icon" aria-hidden="true" />
        <input
          ref={input}
          type="text"
          value={query}
          onChange={e => { setTyped(e.target.value); setSelected(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search films, series, cast and your server"
          aria-label="Search"
          aria-keyshortcuts="/"
          aria-expanded={open}
          aria-controls="search-palette"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
        />
        {!query && <kbd className="kbd hidden sm:inline-grid" aria-hidden="true">/</kbd>}
      </label>

      {open && (
        <div id="search-palette" className="palette" role="listbox" aria-label="Search suggestions">
          {sections.map((section, si) => (
            <div key={section.name || si}>
              {section.name && <p className="palette-head">{section.name}</p>}
              {section.items.map(item => {
                index += 1;
                const i = index;
                const Icon = item.icon;
                return (
                  <button
                    key={`${item.kind}-${item.label}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === selected}
                    className="palette-item"
                    onMouseDown={e => e.preventDefault()}
                    onMouseEnter={() => setSelected(i)}
                    onClick={item.run}
                  >
                    {item.image ? (
                      <span
                        className="flex-shrink-0 overflow-hidden"
                        style={{
                          width: item.kind === 'person' ? 36 : 32, height: item.kind === 'person' ? 36 : 46,
                          borderRadius: item.kind === 'person' ? 999 : 6,
                          background: 'var(--ink-800)', border: '1px solid var(--line)',
                        }}
                      >
                        <FadeImg src={item.image} className="w-full h-full object-cover" />
                      </span>
                    ) : (
                      <span
                        className="w-8 h-8 rounded-[9px] flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--ink-800)', color: 'var(--text-dim)' }}
                      >
                        {Icon && <Icon size={16} aria-hidden="true" />}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold truncate">
                        {item.plain ? item.label : <Highlight text={item.label} query={needle} />}
                      </span>
                      {item.sub && <span className="block text-[12.5px] truncate" style={{ color: 'var(--text-dim)' }}>{item.sub}</span>}
                    </span>
                    <ArrowRight size={16} className="palette-go" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ))}

          {searching && (
            <div className="px-2 pt-2 space-y-1.5" role="status" aria-label="Looking for suggestions">
              {[0, 1].map(n => <div key={n} className="skeleton h-12 rounded-lg" />)}
            </div>
          )}

          <div className="palette-foot">
            <span className="flex items-center gap-1.5"><kbd className="kbd">{'↑'}</kbd><kbd className="kbd">{'↓'}</kbd> move</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd"><CornerDownLeft size={11} /></kbd> open</span>
            <span className="flex items-center gap-1.5"><kbd className="kbd">esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
