// src/components/PosterCard.jsx
//
// One card for every context. The app previously had three near-identical
// implementations (VideoCard, TmdbCard, CatalogCard) that drifted apart.
//
// Two shapes:
//   <PosterCard file={...}>   a file or folder on the server
//   <PosterCard item={...}>   a TMDB title, which may or may not be on the server

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Folder, Film, Info } from 'lucide-react';
import { fetchMeta, fetchDirectory } from '../lib/tmdb';
import { describeMedia, mediaSummary } from '../lib/playback';
import { parseRelease } from '../lib/release';
import { StatusChip, Rating } from './ui';

export default function PosterCard({
  file, item, compact = false, availability, onOpen,
}) {
  return file
    ? <ServerCard file={file} compact={compact} onOpen={onOpen} />
    : <CatalogCard item={item} compact={compact} availability={availability} />;
}

/* ── A file or folder that exists on the server ──────────────────────────── */

function ServerCard({ file, compact, onOpen }) {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [videoUrl, setVideoUrl] = useState(file.type === 'video' ? file.url : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    (async () => {
      setLoading(true);
      try {
        let lookupName = file.name;

        // A folder holding exactly one video is really just that video.
        if (file.type === 'folder') {
          const data = await fetchDirectory(file.url);
          const videos = data.files.filter(f => f.type === 'video');
          if (live && videos.length === 1) {
            setVideoUrl(videos[0].url);
            lookupName = videos[0].name;
          }
        }

        const m = await fetchMeta(lookupName);
        if (live && m?.found) setMeta(m);
      } catch { /* a card without metadata still works */ }
      finally { if (live) setLoading(false); }
    })();

    return () => { live = false; };
  }, [file.url, file.name, file.type]);

  const media = describeMedia(videoUrl || file.name);
  const title = meta?.title || parseRelease(file.name).title || cleanName(file.name);

  const open = () => {
    if (onOpen) return onOpen(file);
    if (videoUrl) {
      navigate(`/watch/${encodeURIComponent(videoUrl)}`, {
        state: { file: { ...file, url: videoUrl }, meta },
      });
    } else {
      navigate(`/browse?url=${encodeURIComponent(file.url)}`);
    }
  };

  const isPlayable = !!videoUrl;

  return (
    <Frame
      compact={compact}
      onClick={open}
      title={title}
      poster={meta?.poster}
      loading={loading}
      fallbackIcon={file.type === 'folder' && !videoUrl ? Folder : Film}
      overlayIcon={isPlayable ? Play : undefined}
      overlayLabel={isPlayable ? 'Play' : 'Open'}
      topRight={<Rating value={meta?.rating} />}
      footer={
        <>
          <p className="text-[13px] font-medium leading-tight truncate">{title}</p>
          <p className="data mt-1 truncate">
            {[meta?.year, mediaSummary(media)].filter(Boolean).join(' · ') || ' '}
          </p>
        </>
      }
    />
  );
}

/* ── A TMDB title, which may or may not be on the server ─────────────────── */

function CatalogCard({ item, compact, availability }) {
  const navigate = useNavigate();
  const { id, title, name, year, rating, poster, type } = item;
  const label = title || name || '';
  const mediaType = type === 'tv' ? 'tv' : 'movie';

  const status = availability?.status || 'unknown';
  const unavailable = status === 'off';

  return (
    <Frame
      compact={compact}
      onClick={() => navigate(`/detail/${id}?type=${mediaType}`)}
      title={label}
      poster={poster}
      unavailable={unavailable}
      fallbackIcon={Film}
      overlayIcon={Info}
      overlayLabel="Details"
      topRight={<Rating value={rating} />}
      topLeft={
        mediaType === 'tv'
          ? <span className="chip chip-off" style={{ padding: '2px 6px' }}>Series</span>
          : null
      }
      bottomOverlay={
        status !== 'unknown'
          ? <StatusChip status={status} detail={availability?.detail} />
          : null
      }
      footer={
        <>
          <p className="text-[13px] font-medium leading-tight truncate">{label}</p>
          <p className="data mt-1">{year || ' '}</p>
        </>
      }
    />
  );
}

/* ── Shared frame ────────────────────────────────────────────────────────── */

function Frame({
  compact, onClick, title, poster, loading, unavailable,
  fallbackIcon: Fallback, overlayIcon: Overlay, overlayLabel,
  topLeft, topRight, bottomOverlay, footer,
}) {
  const [broken, setBroken] = useState(false);
  const ref = useRef(null);

  return (
    <button
      ref={ref}
      onClick={onClick}
      title={title}
      className={`card-link flex-shrink-0 text-left ${compact ? 'w-32' : 'video-card'} ${unavailable ? 'card-unavailable' : ''}`}
    >
      <div
        className={`poster-frame ${compact ? 'h-48' : 'video-card-poster'}`}
      >
        {poster && !broken ? (
          <img
            src={poster}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="w-full h-full object-cover"
          />
        ) : loading ? (
          <div className="skeleton w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {Fallback && <Fallback size={26} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />}
          </div>
        )}

        {topLeft  && <div className="absolute top-2 left-2">{topLeft}</div>}
        {topRight && (
          <div
            className="absolute top-2 right-2 px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(8,11,15,0.78)', backdropFilter: 'blur(6px)' }}
          >
            {topRight}
          </div>
        )}

        {bottomOverlay && (
          <div className="absolute bottom-2 left-2 right-2 flex justify-start">{bottomOverlay}</div>
        )}

        {Overlay && !unavailable && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity"
            style={{ background: 'rgba(4,6,9,0.55)' }}
          >
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'var(--accent)' }}
            >
              <Overlay size={16} style={{ color: 'var(--accent-ink)' }} aria-hidden="true" />
            </span>
            {overlayLabel && <span className="eyebrow" style={{ color: 'var(--text)' }}>{overlayLabel}</span>}
          </div>
        )}
      </div>

      <div className="pt-2.5 px-0.5">{footer}</div>
    </button>
  );
}

function cleanName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
}
