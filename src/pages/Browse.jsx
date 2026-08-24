// src/pages/Browse.jsx
// The directory browser — the closest OpenPlay gets to showing the raw filesystem.

import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Folder, ChevronRight, FolderOpen, ServerOff, Settings } from 'lucide-react';
import PosterCard from '../components/PosterCard';
import { EmptyState, PosterSkeleton, Notice } from '../components/ui';
import { fetchDirectory } from '../lib/tmdb';
import { useAsync } from '../lib/useAsync';
import { safeDecode } from '../lib/text';

export default function Browse() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const ispUrl = localStorage.getItem('isp_url');
  const target = params.get('url') || ispUrl;

  const { data, loading } = useAsync(target || null, () => fetchDirectory(target));

  const crumbs = useMemo(() => buildCrumbs(ispUrl, target), [ispUrl, target]);
  const videos = data?.files.filter(f => f.type === 'video') || [];

  if (!target) {
    return (
      <EmptyState
        icon={ServerOff}
        title="No server configured"
        hint="Add your ISP's directory address to start browsing."
        action={
          <button
            onClick={() => navigate('/settings')}
            className="btn-accent inline-flex items-center gap-2 px-4 h-10 rounded-[10px] text-sm"
          >
            <Settings size={14} aria-hidden="true" />
            Open settings
          </button>
        }
      />
    );
  }

  return (
    <div className="page-enter px-5 sm:px-7 py-7">
      <nav aria-label="Breadcrumb" className="mb-7">
        <ol className="flex items-center flex-wrap gap-1 mono text-xs">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={crumb.url} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight size={12} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
                )}
                {last ? (
                  <span aria-current="page" style={{ color: 'var(--text)' }}>{crumb.name}</span>
                ) : (
                  <button
                    onClick={() => navigate(`/browse?url=${encodeURIComponent(crumb.url)}`)}
                    className="hover:underline transition-colors"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {crumb.name}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {loading && (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 12 }, (_, i) => <PosterSkeleton key={i} />)}
        </div>
      )}

      {!loading && data?.error && (
        <Notice tone="error" title="Could not read this folder">{data.error}</Notice>
      )}

      {!loading && data && !data.error && (
        <>
          {data.folders.length > 0 && (
            <section className="mb-10">
              <h2 className="eyebrow mb-3.5">
                {data.folders.length} folder{data.folders.length === 1 ? '' : 's'}
              </h2>
              <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {data.folders.map(folder => (
                  <button
                    key={folder.url}
                    onClick={() => navigate(`/browse?url=${encodeURIComponent(folder.url)}`)}
                    className="control flex items-center gap-3 px-3.5 h-14 text-left group"
                  >
                    <Folder
                      size={17}
                      style={{ color: 'var(--accent)', flexShrink: 0 }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{folder.name}</span>
                      {folder.date && <span className="block data mt-0.5">{folder.date}</span>}
                    </span>
                    <ChevronRight
                      size={15}
                      style={{ color: 'var(--text-faint)', flexShrink: 0 }}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </section>
          )}

          {videos.length > 0 && (
            <section>
              <h2 className="eyebrow mb-3.5">
                {videos.length} file{videos.length === 1 ? '' : 's'}
              </h2>
              <div className="flex flex-wrap gap-4">
                {videos.map(file => <PosterCard key={file.url} file={file} />)}
              </div>
            </section>
          )}

          {data.folders.length === 0 && videos.length === 0 && (
            <EmptyState
              icon={FolderOpen}
              title="Nothing here"
              hint="This folder holds no sub-folders or playable media."
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Build a trail from the configured root down to the current folder.
 * Falls back to the URL's own path when browsing outside the configured root.
 */
function buildCrumbs(rootUrl, currentUrl) {
  if (!currentUrl) return [];

  const decode = safeDecode;

  if (rootUrl && currentUrl.startsWith(rootUrl)) {
    const base = rootUrl.replace(/\/$/, '');
    const rest = currentUrl.slice(base.length).replace(/^\/|\/$/g, '');
    const crumbs = [{ name: 'Root', url: rootUrl }];

    let acc = base;
    for (const part of rest.split('/').filter(Boolean)) {
      acc += '/' + part;
      crumbs.push({ name: decode(part), url: acc + '/' });
    }
    return crumbs;
  }

  try {
    const parsed = new URL(currentUrl);
    const crumbs = [{ name: parsed.host, url: parsed.origin + '/' }];
    let acc = parsed.origin;
    for (const part of parsed.pathname.split('/').filter(Boolean)) {
      acc += '/' + part;
      crumbs.push({ name: decode(part), url: acc + '/' });
    }
    return crumbs;
  } catch {
    return [{ name: 'Root', url: currentUrl }];
  }
}
