// src/pages/Channel.jsx
// Shows a grid of all videos tagged with a specific studio, actor, or genre.
// The "channel" concept is built by scanning localStorage-cached TMDB metadata.

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import VideoCard from '../components/VideoCard';

export default function Channel() {
  const { id }             = useParams();         // e.g. "DreamWorks" or "Action"
  const [searchParams]     = useSearchParams();
  const type               = searchParams.get('type') || 'genre'; // genre | studio | actor | director
  const navigate           = useNavigate();

  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    // We gather previously-fetched TMDB metadata stored in memory via tmdb.js module cache.
    // Since we can't access the module cache directly, we use sessionStorage as a simple
    // persistence layer. VideoCard writes to sessionStorage when it fetches meta.
    const all = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith('tmdb:')) continue;
      try {
        const meta = JSON.parse(sessionStorage.getItem(key));
        if (!meta?.found) continue;

        let match = false;
        if (type === 'genre')    match = meta.genres?.includes(id);
        if (type === 'studio')   match = meta.studios?.includes(id);
        if (type === 'actor')    match = meta.cast?.some(c => c.name === id);
        if (type === 'director') match = meta.directors?.includes(id);

        if (match) {
          all.push({ url: key.replace('tmdb:', ''), meta });
        }
      } catch { /* skip */ }
    }
    setItems(all);
  }, [id, type]);

  const filtered = items.filter(item => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      item.meta.title?.toLowerCase().includes(f) ||
      item.meta.year?.includes(f)
    );
  });

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 px-6">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-red-400 text-xs uppercase tracking-widest mb-1">{type}</p>
          <h1 className="text-white text-4xl font-bold">{decodeURIComponent(id)}</h1>
          <p className="text-zinc-400 mt-1">{items.length} title{items.length !== 1 ? 's' : ''}</p>
        </div>
        <input
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-zinc-800 text-white text-sm rounded-full px-4 py-2 border border-zinc-700 focus:outline-none focus:ring-1 focus:ring-red-500 placeholder-zinc-500 w-48"
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-zinc-500">
          {items.length === 0
            ? 'Browse some titles first — channel pages populate as you browse.'
            : 'No results for that filter.'}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {filtered.map(({ url, meta }) => (
          <VideoCard
            key={url}
            file={{ url, name: meta.title || url, type: 'video' }}
          />
        ))}
      </div>
    </div>
  );
}