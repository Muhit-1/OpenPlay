// src/pages/Browse.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import VideoCard from '../components/VideoCard';
import { fetchDirectory } from '../lib/tmdb';

export default function Browse() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const ispUrl = localStorage.getItem('isp_url');
  const targetUrl = searchParams.get('url') || ispUrl;

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Breadcrumb stack: array of { name, url }
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  useEffect(() => {
    if (!targetUrl) { setLoading(false); return; }

    setLoading(true);
    setError(null);
    fetchDirectory(targetUrl)
      .then(d => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [targetUrl]);

  // Build breadcrumbs from URL path
  useEffect(() => {
    if (!ispUrl || !targetUrl) return;
    if (targetUrl === ispUrl) {
      setBreadcrumbs([{ name: 'Root', url: ispUrl }]);
      return;
    }
    // Extract path segments between base and current
    const base = ispUrl.replace(/\/$/, '');
    const rest = targetUrl.replace(base, '').replace(/^\//, '');
    const parts = rest.split('/').filter(Boolean);
    const crumbs = [{ name: 'Root', url: ispUrl }];
    let acc = base;
    for (const part of parts) {
      acc += '/' + part;
      crumbs.push({ name: decodeURIComponent(part), url: acc + '/' });
    }
    setBreadcrumbs(crumbs);
  }, [targetUrl, ispUrl]);

  if (!targetUrl) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 flex flex-col items-center justify-center text-center px-6">
        <p className="text-zinc-400">No server URL configured.</p>
        <button onClick={() => navigate('/settings')} className="mt-4 text-red-400 underline">
          Go to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 px-6">

      {/* ── Breadcrumbs ── */}
      <nav className="flex items-center flex-wrap gap-1 mb-6 text-sm" aria-label="breadcrumb">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.url} className="flex items-center gap-1">
            {i > 0 && <span className="text-zinc-600">/</span>}
            {i === breadcrumbs.length - 1 ? (
              <span className="text-white font-medium">{crumb.name}</span>
            ) : (
              <button
                onClick={() => navigate(`/browse?url=${encodeURIComponent(crumb.url)}`)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                {crumb.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      {/* ── Loading ── */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-64 rounded-lg bg-zinc-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="text-center py-20">
          <p className="text-red-400 mb-2">Failed to load directory</p>
          <p className="text-zinc-500 text-sm">{error}</p>
        </div>
      )}

      {/* ── Content ── */}
      {!loading && data && (
        <>
          {/* Sub-folders */}
          {data.folders.length > 0 && (
            <section className="mb-10">
              <h2 className="text-zinc-300 text-sm uppercase tracking-wider mb-4">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {data.folders.map(folder => (
                  <button
                    key={folder.url}
                    onClick={() => navigate(`/browse?url=${encodeURIComponent(folder.url)}`)}
                    className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:ring-2 hover:ring-red-500 transition-all text-white p-3"
                  >
                    <svg className="w-10 h-10 text-yellow-500/70" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                    </svg>
                    <span className="text-xs text-center leading-tight line-clamp-2">{folder.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Video files */}
          {data.files.filter(f => f.type === 'video').length > 0 && (
            <section>
              <h2 className="text-zinc-300 text-sm uppercase tracking-wider mb-4">Videos</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {data.files
                  .filter(f => f.type === 'video')
                  .map(file => (
                    <VideoCard key={file.url} file={file} />
                  ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {data.folders.length === 0 && data.files.length === 0 && (
            <div className="text-center py-20 text-zinc-500">
              <p>This folder is empty.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}