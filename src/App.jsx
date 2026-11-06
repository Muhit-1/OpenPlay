// src/App.jsx
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import { Rail, TopBar } from './components/Nav';
import Home        from './pages/Home';
const Library = lazy(() => import('./pages/Library'));
const MyList = lazy(() => import('./pages/MyList'));
const Browse = lazy(() => import('./pages/Browse'));
const Channel = lazy(() => import('./pages/Channel'));
const Player = lazy(() => import('./pages/Player'));
const Search = lazy(() => import('./pages/Search'));
const Settings = lazy(() => import('./pages/Settings'));
const MovieDetail = lazy(() => import('./pages/MovieDetail'));
import { useTheme } from './lib/theme';
import ErrorBoundary from './components/ErrorBoundary';
import TmdbBanner from './components/TmdbBanner';
import { PageSkeleton } from './components/ui';
import { getItem, setItem } from './lib/storage';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Shell />
    </BrowserRouter>
  );
}

/**
 * A new page opens at its top. (Back/Forward are left alone: the Library
 * restores its own scroll position, and the browser handles the rest.)
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const lastPath = useRef(pathname);

  // Only a change of page counts: opening the Library's side panel or changing a
  // filter is a navigation too, and must not throw the list back to the top.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);

  return null;
}

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => getItem('rail_collapsed') === '1');
  useTheme();

  // The rail's width is a CSS variable on <html>, so the page can follow it.
  useEffect(() => {
    document.documentElement.dataset.rail = collapsed ? 'collapsed' : 'expanded';
  }, [collapsed]);

  const toggleCollapsed = () => setCollapsed(prev => {
    setItem('rail_collapsed', prev ? '0' : '1');
    return !prev;
  });

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink-950)' }}>
      <ScrollToTop />
      <Rail
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className="shell-main flex flex-col min-h-screen">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />

        <main className="flex-1" id="main">
          <TmdbBanner />
          <ErrorBoundary>
          <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/"          element={<Home />} />

            <Route path="/movies"    element={<Library key="movies" category="movies" />} />
            <Route path="/series"    element={<Library key="series" category="series" />} />
            <Route path="/animation" element={<Library key="animation" category="animation" />} />

            <Route path="/history"   element={<MyList mode="history" />} />
            <Route path="/watchlist" element={<MyList mode="watchlist" />} />

            <Route path="/search"    element={<Search />} />
            <Route path="/browse"    element={<Browse />} />
            <Route path="/settings"  element={<Settings />} />

            <Route path="/channel/:id"       element={<Channel />} />
            <Route path="/detail/:id"        element={<MovieDetail />} />
            <Route path="/watch/:encodedUrl" element={<Player />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-dim)' }}>
        That address doesn&apos;t lead anywhere in OpenPlay.
      </p>
    </div>
  );
}
