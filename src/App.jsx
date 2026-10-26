// src/App.jsx
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { Spinner } from './components/ui';

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

function Shell() {
  const [menuOpen, setMenuOpen] = useState(false);
  useTheme();

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink-950)' }}>
      <Rail open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-[var(--rail-width)] flex flex-col min-h-screen">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />

        <main className="flex-1" id="main">
          <TmdbBanner />
          <ErrorBoundary>
          <Suspense fallback={<div className="flex justify-center py-24"><Spinner /></div>}>
          <Routes>
            <Route path="/"          element={<Home />} />

            <Route path="/movies"    element={<Library category="movies" />} />
            <Route path="/series"    element={<Library category="series" />} />
            <Route path="/animation" element={<Library category="animation" />} />

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
