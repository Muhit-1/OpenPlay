// src/pages/Search.jsx
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import VideoCard from '../components/VideoCard';
import { fetchDirectory } from '../lib/tmdb';

export default function Search() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const q              = searchParams.get('q') || '';

  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!q) return;
    const ispUrl = localStorage.getItem('isp_url');
    if (!ispUrl) return;

    setLoading(true);
    setSearched(true);
    setResults([]);

    // Recursive search across root folders
    searchFiles(ispUrl, q.toLowerCase(), 3)
      .then(hits => setResults(hits))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 px-6">
      <h1 className="text-white text-2xl font-bold mb-2">
        {q ? `Results for "${q}"` : 'Search'}
      </h1>
      {searched && !loading && (
        <p className="text-zinc-400 text-sm mb-8">
          {results.length} file{results.length !== 1 ? 's' : ''} found
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-zinc-400 mb-8">
          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          Searching…
        </div>
      )}

      {!loading && results.length === 0 && searched && (
        <p className="text-zinc-500 py-20 text-center">No video files matched "{q}".</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {results.map(file => (
          <VideoCard key={file.url} file={file} />
        ))}
      </div>
    </div>
  );
}

// Recursive depth-limited search
async function searchFiles(url, query, depth) {
  if (depth <= 0) return [];

  let data;
  try {
    const res = await fetch(`/api/parse?url=${encodeURIComponent(url)}`);
    data = await res.json();
  } catch {
    return [];
  }

  const hits = data.files
    .filter(f => f.type === 'video' && f.name.toLowerCase().includes(query));

  const subResults = await Promise.all(
    data.folders.map(folder => searchFiles(folder.url, query, depth - 1))
  );

  return [...hits, ...subResults.flat()];
}