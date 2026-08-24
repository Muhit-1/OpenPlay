// src/components/Nav.jsx
//
// A single source of navigation.
//
// The rail used to list genres while the Catalog page listed the same genres
// again in its own sidebar — two dashboards, side by side, disagreeing about
// where you were. The rail is now the only navigation, and it names the things
// you actually browse: what kind of thing, and your own lists.

import { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Play, Search, Settings, Clapperboard, Tv, Sparkles,
  History, Bookmark, Menu, X, HardDrive,
} from 'lucide-react';

const SECTIONS = [
  { to: '/movies',    label: 'Movies',    icon: Clapperboard },
  { to: '/series',    label: 'Series',    icon: Tv },
  { to: '/animation', label: 'Animation', icon: Sparkles },
];

const PERSONAL = [
  { to: '/history',   label: 'History',   icon: History },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark },
  { to: '/search',    label: 'Search',    icon: Search },
];

export function Rail({ open, onClose }) {
  const location = useLocation();

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => { onClose?.(); }, [location.pathname, location.search]); // eslint-disable-line

  return (
    <>
      {open && (
        <button
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(4,6,9,0.7)' }}
          onClick={onClose}
          aria-label="Close menu"
        />
      )}

      <nav
        className={`fixed top-0 left-0 bottom-0 z-50 flex flex-col transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{
          width: 'var(--rail-width)',
          background: 'var(--ink-900)',
          borderRight: '1px solid var(--line)',
        }}
        aria-label="Main"
      >
        <div className="flex items-center justify-between px-5 h-16 flex-shrink-0">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="rounded-md flex-shrink-0"
            />
            <span className="font-display text-[18px] tracking-tight">OpenPlay</span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md"
            style={{ color: 'var(--text-dim)' }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-6">
          <div className="space-y-0.5 mb-6">
            <RailLink to="/" label="Home" icon={Play} end />
            {SECTIONS.map(item => <RailLink key={item.to} {...item} />)}
          </div>

          <p className="eyebrow px-3 mb-2">Yours</p>
          <div className="space-y-0.5 mb-6">
            {PERSONAL.map(item => <RailLink key={item.to} {...item} />)}
          </div>
        </div>

        <div className="px-3 py-3 flex-shrink-0 space-y-0.5" style={{ borderTop: '1px solid var(--line)' }}>
          <RailLink to="/browse" label="Files" icon={HardDrive} />
          <RailLink to="/settings" label="Settings" icon={Settings} />
        </div>
      </nav>
    </>
  );
}

function RailLink({ to, label, icon: Icon, end = false }) {
  const location = useLocation();
  const [path] = to.split('?');

  const isActive = end
    ? location.pathname === path
    : location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <NavLink
      to={to}
      end={end}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[15px] transition-colors"
      style={{
        color: isActive ? 'var(--text)' : 'var(--text-dim)',
        background: isActive ? 'var(--ink-800)' : 'transparent',
        fontWeight: isActive ? 600 : 400,
        boxShadow: isActive ? 'inset 2px 0 0 var(--accent)' : 'none',
      }}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export function TopBar({ onOpenMenu }) {
  const navigate = useNavigate();
  const location = useLocation();

  // The URL is the source of truth for what was searched; `typed` only holds
  // edits made since. Deriving it this way keeps the field in step with the
  // address bar without an effect that writes state on every navigation.
  const urlQuery = location.pathname === '/search'
    ? new URLSearchParams(location.search).get('q') || ''
    : '';
  const [typed, setTyped] = useState(null);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);

  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setTyped(null);
  }

  const query = typed ?? urlQuery;
  const setQuery = setTyped;

  const submit = e => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3 h-16 px-4 sm:px-6 flex-shrink-0"
      style={{
        background: 'color-mix(in srgb, var(--ink-950) 88%, transparent)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <button
        onClick={onOpenMenu}
        className="lg:hidden p-2 rounded-lg control"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <form onSubmit={submit} className="flex-1 max-w-xl">
        <div className="control flex items-center gap-2 px-3 h-10">
          <Search size={16} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search films, series, cast and your server"
            aria-label="Search"
            className="flex-1 bg-transparent text-[15px] outline-none min-w-0"
            style={{ color: 'var(--text)' }}
          />
        </div>
      </form>

      <div className="flex-1" />

      <Link
        to="/settings"
        className="p-2 rounded-lg transition-colors"
        style={{ color: 'var(--text-dim)' }}
        aria-label="Settings"
      >
        <Settings size={18} />
      </Link>
    </header>
  );
}
