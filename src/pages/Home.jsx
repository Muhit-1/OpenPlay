// src/pages/Home.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CategoryRow from '../components/CategoryRow';
import { fetchDirectory } from '../lib/tmdb';
import { getContinueWatching } from '../lib/firebase';

export default function Home() {
  const navigate = useNavigate();
  const ispUrl   = localStorage.getItem('isp_url');

  const [rootFolders, setRootFolders] = useState([]);
  const [rootFiles,   setRootFiles]   = useState([]);
  const [continueList, setContinueList] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [error,   setError]    = useState(null);

  // Hero backdrop (first video with metadata)
  const [hero, setHero] = useState(null);

  useEffect(() => {
    if (!ispUrl) {
      setLoading(false);
      return;
    }

    fetchDirectory(ispUrl)
      .then(data => {
        setRootFolders(data.folders || []);
        setRootFiles(data.files || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

    getContinueWatching(10)
      .then(items => setContinueList(items))
      .catch(() => {}); // Firebase optional
  }, [ispUrl]);

  // ── No ISP URL set ──
  if (!ispUrl) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <h1 className="text-white text-3xl font-bold mb-3">Welcome to OpenPlay</h1>
        <p className="text-zinc-400 text-lg mb-8 max-w-md">
          Enter your ISP's open directory server URL to start streaming — no downloads, no logins.
        </p>
        <button
          onClick={() => navigate('/settings')}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-full transition-colors"
        >
          Set up your server →
        </button>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Loading directory…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-6">
        <p className="text-red-400 text-lg mb-4">Could not reach the server</p>
        <p className="text-zinc-500 text-sm mb-6">{error}</p>
        <button
          onClick={() => navigate('/settings')}
          className="bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-2 rounded-lg transition-colors"
        >
          Check settings
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12">

      {/* ── Hero banner (first root folder as a teaser) ── */}
      {rootFolders.length > 0 && (
        <div className="relative h-48 md:h-64 mb-10 mx-6 rounded-2xl overflow-hidden bg-gradient-to-r from-red-900/60 via-zinc-900 to-zinc-900 flex items-end">
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="relative px-8 pb-8">
            <p className="text-red-400 text-sm font-semibold uppercase tracking-widest mb-1">Your Server</p>
            <h1 className="text-white text-3xl font-bold">{ispUrl.replace(/https?:\/\//, '')}</h1>
            <p className="text-zinc-300 text-sm mt-1">{rootFolders.length} categories · {rootFiles.length} files at root</p>
          </div>
        </div>
      )}

      {/* ── Continue Watching ── */}
      {continueList.length > 0 && (
        <CategoryRow
          title="Continue Watching"
          files={continueList.map(item => ({
            name: item.title,
            url: item.fileUrl,
            type: 'video',
          }))}
        />
      )}

      {/* ── Root-level video files ── */}
      {rootFiles.length > 0 && (
        <CategoryRow
          title="Files at Root"
          files={rootFiles}
        />
      )}

      {/* ── One row per root folder ── */}
      {rootFolders.map(folder => (
        <FolderRow
          key={folder.url}
          folder={folder}
          onFolderClick={(sub) => navigate(`/browse?url=${encodeURIComponent(sub.url)}`)}
        />
      ))}
    </div>
  );
}

// ── FolderRow: lazy-loads directory contents when visible ──
function FolderRow({ folder, onFolderClick }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate            = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetchDirectory(folder.url)
      .then(d => setData(d))
      .catch(() => setData({ folders: [], files: [] }))
      .finally(() => setLoading(false));
  }, [folder.url]);

  if (loading) {
    return (
      <div className="mb-10 px-6">
        <div className="text-zinc-400 text-lg font-semibold mb-3">{folder.name}</div>
        <div className="flex gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-44 h-64 rounded-lg bg-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <CategoryRow
      title={folder.name}
      files={data.files}
      folders={data.folders}
      onFolderClick={(sub) => navigate(`/browse?url=${encodeURIComponent(sub.url)}`)}
    />
  );
}