// src/components/Navbar.jsx
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Navbar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/90 to-transparent backdrop-blur-sm">
      <div className="flex items-center gap-6 px-6 py-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-white text-xl font-bold tracking-tight">
            open<span className="text-red-500">play</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          <Link to="/"
            className="text-zinc-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
            Home
          </Link>

          {/* Browse dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1 text-zinc-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
              Browse
              <svg className="w-3.5 h-3.5 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown panel */}
            <div className="absolute left-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl shadow-black/60 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 p-2">
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold px-3 py-1.5">Trending</p>
              <Link to="/catalog?cat=trending-movies" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">🎬</span> Trending Movies
              </Link>
              <Link to="/catalog?cat=trending-series" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">📺</span> Trending Series
              </Link>

              <div className="border-t border-zinc-800 my-1.5" />
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold px-3 py-1.5">Movies</p>
              <Link to="/catalog?cat=action" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">💥</span> Action
              </Link>
              <Link to="/catalog?cat=top-animation" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">✨</span> Animation
              </Link>
              <Link to="/catalog?cat=horror" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">👻</span> Horror
              </Link>
              <Link to="/catalog?cat=comedy" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">😂</span> Comedy
              </Link>
              <Link to="/catalog?cat=scifi" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">🚀</span> Sci-Fi
              </Link>

              <div className="border-t border-zinc-800 my-1.5" />
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold px-3 py-1.5">TV Series</p>
              <Link to="/catalog?cat=drama-tv" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">🎭</span> Drama
              </Link>
              <Link to="/catalog?cat=crime-tv" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">🔍</span> Crime
              </Link>
              <Link to="/catalog?cat=animation-tv" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors">
                <span className="text-base">🎨</span> Animation
              </Link>

              <div className="border-t border-zinc-800 my-1.5" />
              <Link to="/catalog" className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-[var(--accent)] hover:bg-zinc-800 transition-colors font-medium">
                View All Categories
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>

          <Link to="/browse"
            className="text-zinc-300 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
            My Server
          </Link>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <form onSubmit={handleSearch} className="relative hidden sm:block">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search titles…"
            className="bg-zinc-800/80 text-white text-sm rounded-full px-4 py-1.5 w-48 md:w-64 border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-red-500 placeholder-zinc-500"
          />
          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </form>

        {/* Settings */}
        <Link to="/settings" className="p-2 text-zinc-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </div>
    </nav>
  );
}