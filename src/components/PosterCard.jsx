// src/components/PosterCard.jsx
//
// One card for every context. The app previously had three near-identical
// implementations (VideoCard, TmdbCard, CatalogCard) that drifted apart.
//
// Two shapes:
//   <PosterCard file={...}>   a file or folder on the server
//   <PosterCard item={...}>   a TMDB title, which may or may not be on the server

import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Play, Folder, Film, Info, GripVertical } from 'lucide-react';
import { useServerTitle } from '../lib/useServerTitle';
import { titleHref } from '../lib/titleLink';
import { describeMedia, mediaSummary } from '../lib/playback';
import { parseRelease } from '../lib/release';
import { StatusChip, Rating, FadeImg } from './ui';
import { dragLinkProps } from '../lib/drag';

/**
 * `onOpen(file)` replaces what a plain left-click does (the Library opens a side
 * panel). Ctrl/Cmd/Shift/middle-click and "open in new tab" still follow the
 * card's real address.
 */
export default function PosterCard({
  file, item, compact = false, availability, onOpen, selected = false,
}) {
  return file
    ? <ServerCard file={file} compact={compact} onOpen={onOpen} selected={selected} />
    : <CatalogCard item={item} compact={compact} availability={availability} />;
}

/* ── A file or folder that exists on the server ──────────────────────────── */

function ServerCard({ file, compact, onOpen, selected }) {
  const { meta, videoUrl, loading } = useServerTitle(file);

  const media = describeMedia(videoUrl || file.name);
  const title = meta?.title || parseRelease(file.name).title || cleanName(file.name);

  const href = titleHref(file, meta, videoUrl);

  const isPlayable = !!videoUrl;

  return (
    <Frame
      compact={compact}
      href={href}
      onActivate={onOpen ? () => onOpen(file) : undefined}
      selected={selected}
      title={title}
      poster={meta?.poster}
      loading={loading}
      dragUrl={videoUrl}
      dragLabel={file.name}
      fallbackIcon={file.type === 'folder' && !videoUrl ? Folder : Film}
      overlayIcon={isPlayable ? Play : undefined}
      overlayLabel={meta?.id ? 'Details' : isPlayable ? 'Play' : 'Open'}
      topRight={<Rating value={meta?.rating} />}
      footer={
        <>
          <p className="text-[14px] font-medium leading-tight truncate">{title}</p>
          <p className="data mt-1 truncate">
            {[meta?.year, mediaSummary(media)].filter(Boolean).join(' · ') || ' '}
          </p>
        </>
      }
    />
  );
}

/* ── A TMDB title, which may or may not be on the server ─────────────────── */

function CatalogCard({ item, compact, availability }) {  const { id, title, name, year, rating, poster, type } = item;
  const label = title || name || '';
  const mediaType = type === 'tv' ? 'tv' : 'movie';

  const status = availability?.status || 'unknown';
  const unavailable = status === 'off';

  return (
    <Frame
      compact={compact}
      href={{ pathname: `/detail/${id}`, search: `?type=${mediaType}` }}
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
          <p className="text-[14px] font-medium leading-tight truncate">{label}</p>
          <p className="data mt-1">{year || ' '}</p>
        </>
      }
    />
  );
}

/* ── Shared frame ────────────────────────────────────────────────────────── */

function Frame({
  compact, href, onActivate, selected, title, poster, loading, unavailable, dragUrl, dragLabel,
  fallbackIcon: Fallback, overlayIcon: Overlay, overlayLabel,
  topLeft, topRight, bottomOverlay, footer,
}) {
  const [broken, setBroken] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const ref = useRef(null);

  // A plain left-click can be taken over (the Library opens a side panel);
  // anything else — Ctrl/Cmd/Shift/middle-click, "open in new tab" — is left to
  // the browser, which follows the real address.
  const handleClick = e => {
    if (!onActivate || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onActivate();
  };

  return (
    <Link
      ref={ref}
      to={href}
      state={href.state}
      onClick={handleClick}
      title={title}
      aria-current={selected ? 'true' : undefined}
      className={`card-link block no-underline flex-shrink-0 text-left cursor-pointer ${compact ? 'w-32' : 'video-card'} ${unavailable ? 'card-unavailable' : ''} ${selected ? 'card-selected' : ''}`}
      style={{ color: 'inherit' }}
      {...dragLinkProps(dragUrl, dragLabel)}
    >
      <div
        className={`poster-frame ${compact ? 'h-48' : 'video-card-poster'}`}
      >
        {poster && !broken ? (
          <>
            {!imgLoaded && <div className="skeleton absolute inset-0" aria-hidden="true" />}
            <FadeImg
              src={poster}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setBroken(true)}
              className="relative w-full h-full object-cover"
            />
          </>
        ) : loading ? (
          <div className="skeleton w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {Fallback && <Fallback size={26} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />}
          </div>
        )}

        {dragUrl && (
          <span className="grab-label">
            <GripVertical size={11} aria-hidden="true" />
            Drag to VLC
          </span>
        )}
        {topLeft  &&<div className="absolute top-2 left-2">{topLeft}</div>}
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
    </Link>
  );
}

function cleanName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
}
