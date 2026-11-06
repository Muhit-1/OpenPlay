// src/components/Nav.jsx
//
// A single source of navigation.
//
// The rail lists what you actually browse (what kind of thing, and your own
// lists). It is 256px wide, or folds to a 76px icon rail: icons never move, only
// the labels fade, and tooltips name each destination while folded. One
// highlight glides to the current destination, so moving between sections reads
// as travel rather than two things blinking.

import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Settings, Clapperboard, Tv, Sparkles,
  History, Bookmark, Menu, X, HardDrive, Home, FolderOpen, PanelLeftClose,
} from 'lucide-react';
import { getItem } from '../lib/storage';
import SearchPalette from './SearchPalette';

const SECTIONS = [
  { to: '/movies',    label: 'Movies',    icon: Clapperboard },
  { to: '/series',    label: 'Series',    icon: Tv },
  { to: '/animation', label: 'Animation', icon: Sparkles },
];

const PERSONAL = [
  { to: '/history',   label: 'History',   icon: History },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark },
];

export function Rail({ open, onClose, collapsed, onToggleCollapsed }) {
  const location = useLocation();
  const navRef = useRef(null);
  const indicatorRef = useRef(null);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => { onClose?.(); }, [location.pathname, location.search]); // eslint-disable-line

  // Park the highlight behind whichever link is current.
  const place = useCallback(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;

    const current = nav.querySelector('[aria-current="page"]');
    if (!current) {
      indicator.dataset.ready = 'false';
      return;
    }

    const y = current.getBoundingClientRect().top - nav.getBoundingClientRect().top;

    // First placement jumps into position; every later one glides.
    if (indicator.dataset.ready !== 'true') {
      indicator.style.transition = 'none';
      indicator.style.setProperty('--rail-y', `${y}px`);
      void indicator.offsetHeight;            // commit the jump before transitions return
      indicator.style.transition = '';
      indicator.dataset.ready = 'true';
    } else {
      indicator.style.setProperty('--rail-y', `${y}px`);
    }
  }, []);

  useLayoutEffect(() => { place(); }, [location.pathname, place]);

  useEffect(() => {
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [place]);

  // Folding changes the rail's height-independent layout over 380 ms; re-measure
  // once it settles so the highlight is exactly behind the link.
  const onTransitionEnd = e => { if (e.propertyName === 'width') place(); };

  // "[" folds and unfolds the rail from anywhere that is not a text field.
  useEffect(() => {
    const onKey = e => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      onToggleCollapsed?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onToggleCollapsed]);

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
        ref={navRef}
        onTransitionEnd={onTransitionEnd}
        className={`rail fixed top-0 left-0 bottom-0 z-50 flex flex-col
          ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        aria-label="Main"
      >
        {/* Behind the links, in front of the rail's own background. */}
        <span ref={indicatorRef} className="rail-indicator" data-ready="false" aria-hidden="true" />

        <div className="rail-brand">
          <Link to="/" className="flex items-center gap-3 rounded-lg min-w-0" aria-label="OpenPlay home">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              width={36}
              height={36}
              className="rounded-[11px] flex-shrink-0"
            />
            <span className="rail-lbl font-display text-[19px] leading-none">OpenPlay</span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden ml-auto p-1.5 rounded-md"
            style={{ color: 'var(--text-dim)' }}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-3 pt-[18px] pb-3">
          <div className="space-y-0.5">
            <RailLink to="/" label="Home" icon={Home} end />
            {SECTIONS.map(item => <RailLink key={item.to} {...item} />)}
          </div>

          <p className="rail-label"><span className="rail-lbl">Yours</span></p>
          <div className="space-y-0.5">
            {PERSONAL.map(item => <RailLink key={item.to} {...item} />)}
          </div>
        </div>

        <div className="px-3 pt-3 pb-3 flex-shrink-0" style={{ borderTop: '1px solid var(--line)' }}>
          <ServerCard />
          <div className="space-y-0.5">
            <RailLink to="/browse" label="Files" icon={FolderOpen} />
            <RailLink to="/settings" label="Settings" icon={Settings} />
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rail-toggle hidden lg:flex"
            data-tip={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            aria-keyshortcuts="["
          >
            <PanelLeftClose size={20} strokeWidth={1.9} className="flex-shrink-0" aria-hidden="true" />
            <span className="rail-lbl">{collapsed ? 'Expand' : 'Collapse'}</span>
            <span className="rail-lbl ml-auto"><kbd className="kbd">[</kbd></span>
          </button>
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
    <Link
      to={to}
      className="rail-link"
      data-tip={label}
      aria-current={isActive ? 'page' : undefined}
    >
      {Icon && <Icon className="rail-icon flex-shrink-0" size={20} strokeWidth={1.9} aria-hidden="true" />}
      <span className="rail-lbl">{label}</span>
    </Link>
  );
}

/** Which server this is pointed at, and a way to change it. */
function ServerCard() {
  const url = getItem('isp_url');
  const host = url ? url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';

  return (
    <Link
      to="/settings"
      className="rail-server"
      data-tip={host ? `Server ${host}` : 'Connect a server'}
      aria-label={host ? `Server ${host}, open settings` : 'Connect a server'}
    >
      <span
        className="relative w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 ml-0.5"
        style={{ background: 'var(--ink-800)', color: host ? 'var(--accent)' : 'var(--text-dim)' }}
      >
        <HardDrive size={17} strokeWidth={1.9} aria-hidden="true" />
        {host && (
          <span
            className="absolute rounded-full"
            style={{
              right: -2, top: -2, width: 9, height: 9, background: 'var(--ok)',
              border: '2px solid var(--ink-850)', boxShadow: '0 0 8px var(--ok)',
            }}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="rail-lbl min-w-0" style={{ maxWidth: 150 }}>
        <span className="block text-[12px] leading-tight" style={{ color: 'var(--text-faint)' }}>
          {host ? 'Server' : 'No server yet'}
        </span>
        <span className="block mono text-[13px] leading-tight truncate" style={{ color: 'var(--text-soft)' }}>
          {host || 'Connect one'}
        </span>
      </span>
    </Link>
  );
}

export function TopBar({ onOpenMenu }) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3.5 h-[68px] px-4 sm:px-8 flex-shrink-0"
      style={{
        background: 'color-mix(in srgb, var(--ink-950) 86%, transparent)',
        backdropFilter: 'blur(14px)',
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

      <SearchPalette />
    </header>
  );
}

