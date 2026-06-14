// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar      from './components/Navbar';
import Home        from './pages/Home';
import Browse      from './pages/Browse';
import Channel     from './pages/Channel';
import Player      from './pages/Player';
import Search      from './pages/Search';
import Settings    from './pages/Settings';
import MovieDetail from './pages/MovieDetail';
import { applyTheme } from './pages/Settings';

export default function App() {
  useEffect(() => { applyTheme(); }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-zinc-950 text-white">
        <Navbar />
        <Routes>
          <Route path="/"                    element={<Home />} />
          <Route path="/browse"              element={<Browse />} />
          <Route path="/channel/:id"         element={<Channel />} />
          <Route path="/watch/:encodedUrl"   element={<Player />} />
          <Route path="/search"              element={<Search />} />
          <Route path="/settings"            element={<Settings />} />
          {/* Movie / Series detail page */}
          <Route path="/detail/:id"          element={<MovieDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}