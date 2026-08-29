// src/App.jsx
import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Rail, TopBar } from './components/Nav';
import Home        from './pages/Home';
import Library     from './pages/Library';
import MyList      from './pages/MyList';
import Browse      from './pages/Browse';
import Channel     from './pages/Channel';
import Player      from './pages/Player';
import Search      from './pages/Search';
import Settings    from './pages/Settings';
import MovieDetail from './pages/MovieDetail';
import { useTheme } from './lib/theme';

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
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

        <main className="flex-1">
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
          </Routes>
        </main>
      </div>
    </div>
  );
}
