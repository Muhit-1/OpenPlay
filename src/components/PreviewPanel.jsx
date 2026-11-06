// src/components/PreviewPanel.jsx
//
// A title's details in a panel beside the list, so you can read about it —
// and play it — without leaving the filters you set up. "Open full page" and
// every button here are real links, so they also work in a new tab.

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Play, ExternalLink, Clapperboard, Film, Folder } from 'lucide-react';
import { useServerTitle } from '../lib/useServerTitle';
import { titleHref } from '../lib/titleLink';
import { describeMedia, mediaSummary } from '../lib/playback';
import { parseRelease } from '../lib/release';
import { Rating, FadeImg } from './ui';

export default function PreviewPanel({ file, onClose }) {
  const { meta, videoUrl, loading } = useServerTitle(file);
  const closeRef = useRef(null);

  // Escape closes; focus moves in so a keyboard user lands in the panel.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = meta?.title || parseRelease(file.name).title || file.name;
  const href = titleHref(file, meta, videoUrl);
  const media = describeMedia(videoUrl || file.name);
  const summary = mediaSummary(media);
  const Fallback = file.type === 'folder' && !videoUrl ? Folder : Film;

  const facts = [
    meta?.year,
    meta?.runtime ? `${meta.runtime} min` : null,
    meta?.seasons ? `${meta.seasons} season${meta.seasons === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="preview-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="preview-panel" aria-label={`${title} details`}>
        <div className="preview-head">
          <span className="eyebrow">{meta?.type === 'tv' ? 'Series' : 'Details'}</span>
          <button ref={closeRef} onClick={onClose} className="preview-close" aria-label="Close details (Esc)">
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="preview-body">
          <div className="preview-hero">
            {meta?.poster ? (
              <FadeImg src={meta.poster} className="w-full h-full object-cover" />
            ) : loading ? (
              <div className="skeleton w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Fallback size={30} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
              </div>
            )}
          </div>

          <h2 className="font-display text-[24px] leading-[1.1] mt-5">{title}</h2>
          {meta?.tagline && (
            <p className="mt-1.5 text-[14px] italic" style={{ color: 'var(--text-dim)' }}>{meta.tagline}</p>
          )}

          {(facts.length > 0 || meta?.rating) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 data">
              {facts.map(f => <span key={f}>{f}</span>)}
              <Rating value={meta?.rating} size="md" />
            </div>
          )}

          <div className="flex flex-wrap gap-2.5 mt-5">
            {videoUrl && (
              <Link
                to={`/watch/${encodeURIComponent(videoUrl)}`}
                state={{ file: { ...file, url: videoUrl }, meta }}
                className="btn-accent flex items-center gap-2 px-4 h-11 rounded-[10px] text-[15px] no-underline"
              >
                <Play size={15} fill="currentColor" aria-hidden="true" />
                Play
              </Link>
            )}
            <Link
              to={{ pathname: href.pathname, search: href.search }}
              state={href.state}
              className="control flex items-center gap-2 px-4 h-11 text-[15px] font-semibold no-underline"
              style={{ color: 'var(--text)' }}
            >
              <ExternalLink size={15} aria-hidden="true" />
              Open full page
            </Link>
            {meta?.trailer?.key && (
              <a
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(meta.trailer.key)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="control flex items-center gap-2 px-4 h-11 text-[15px] font-semibold no-underline"
                style={{ color: 'var(--text)' }}
              >
                <Clapperboard size={15} aria-hidden="true" />
                Trailer
              </a>
            )}
          </div>

          {meta?.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-5">
              {meta.genres.map(g => <span key={g} className="filter-tag" style={{ paddingRight: 10 }}>{g}</span>)}
            </div>
          )}

          {meta?.overview ? (
            <p className="mt-5 text-[15px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>{meta.overview}</p>
          ) : !loading && (
            <p className="mt-5 text-[14.5px]" style={{ color: 'var(--text-dim)' }}>
              {meta
                ? 'TMDB has no summary for this title yet.'
                : 'No TMDB details were found for this title, so there is nothing more to show here.'}
            </p>
          )}

          {(meta?.directors?.length > 0 || meta?.cast?.length > 0) && (
            <dl className="mt-6 grid gap-3 text-[14px]">
              {meta.directors?.length > 0 && <Credit label="Director" value={meta.directors.join(', ')} />}
              {meta.cast?.length > 0 && <Credit label="Cast" value={meta.cast.slice(0, 6).map(c => c.name).join(', ')} />}
            </dl>
          )}

          <div className="mt-6 pt-5 data" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="truncate" title={file.name}>{file.name}</p>
            {summary && <p className="mt-1">{summary}</p>}
          </div>
        </div>
      </aside>
    </>
  );
}

function Credit({ label, value }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{label}</dt>
      <dd style={{ color: 'var(--text-soft)' }}>{value}</dd>
    </div>
  );
}
