// src/pages/MovieDetail.jsx
//
// A TMDB title, plus the honest answer to the only question that matters here:
// is it on your server, and will it play?
//
// The lookup itself lives in lib/server.js, which discovers each library's
// folder layout instead of assuming one. The old hardcoded `(YYYY)/` pattern
// missed every 1080p release on the server.

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Download, Copy, Check, FolderOpen, Loader2, SearchX,
  Bookmark, BookmarkCheck, Building2,
} from 'lucide-react';
import { StatusChip, Rating, Notice, EmptyState } from '../components/ui';
import { fetchDetail } from '../lib/tmdb';
import { findOnServer } from '../lib/server';
import { describeMedia, mediaSummary, inspectPlayback } from '../lib/playback';
import VlcButton from '../components/VlcButton';
import { addBookmark, removeBookmark, isBookmarked } from '../lib/firebase';
import { useAsync } from '../lib/useAsync';

export default function MovieDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mediaType = params.get('type') === 'tv' ? 'tv' : 'movie';

  const { data: detail, loading } = useAsync(
    `${id}|${mediaType}`,
    () => fetchDetail(id, mediaType)
  );

  // The server lookup only starts once the title is known.
  const lookupKey = detail?.found ? `${detail.id}|${mediaType}` : null;
  const { data: lookup } = useAsync(
    lookupKey,
    () => searchServer(detail, mediaType),
    { status: 'searching', hit: null }
  );

  // Only probe once a real file has been located.
  const { data: playback } = useAsync(
    lookup?.hit?.videoUrl || null,
    () => inspectPlayback(lookup.hit.videoUrl)
  );

  if (loading) return <DetailSkeleton />;
  if (!detail?.found) {
    return (
      <EmptyState
        icon={SearchX}
        title="Could not load this title"
        hint="TMDB did not return details for it."
        action={
          <button onClick={() => navigate(-1)} className="control px-4 h-10 rounded-[10px] text-sm">
            Go back
          </button>
        }
      />
    );
  }

  const {
    title, overview, tagline, year, rating, runtime, seasons, episodes,
    poster, backdrop, genres = [], cast = [], directors = [], writers = [], studios = [],
  } = detail;

  return (
    <div className="page-enter">
      {/* Backdrop */}
      <div className="relative h-[38vw] max-h-[430px] min-h-[220px] overflow-hidden">
        {backdrop ? (
          <img src={backdrop} alt="" className="w-full h-full object-cover object-top" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--ink-900)' }} />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, var(--ink-950) 4%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, var(--ink-950) 2%, transparent 55%)' }}
        />

        <button
          onClick={() => navigate(-1)}
          className="absolute top-5 left-5 control flex items-center gap-2 px-3 h-9 text-sm"
          style={{ color: 'var(--text-soft)' }}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back
        </button>
      </div>

      <div className="relative -mt-24 sm:-mt-28 px-5 sm:px-7 pb-16 max-w-6xl">
        <div className="flex flex-col sm:flex-row gap-7">
          {poster && (
            <img
              src={poster}
              alt=""
              className="hidden sm:block w-40 md:w-48 rounded-xl flex-shrink-0 self-start"
              style={{ border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)' }}
            />
          )}

          <div className="flex-1 min-w-0 sm:pt-20">
            <p className="eyebrow mb-2">{mediaType === 'tv' ? 'Series' : 'Film'}</p>
            <h1 className="font-display text-3xl md:text-4xl leading-[1.05] mb-3">{title}</h1>
            {tagline && (
              <p className="text-sm italic mb-4" style={{ color: 'var(--text-dim)' }}>{tagline}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 data">
              {year && <span>{year}</span>}
              {runtime && <span>{formatRuntime(runtime)}</span>}
              {seasons && <span>{seasons} season{seasons === 1 ? '' : 's'}</span>}
              {episodes && <span>{episodes} episodes</span>}
              <Rating value={rating} size="md" />
            </div>

            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {genres.map(g => (
                  <button
                    key={g}
                    onClick={() => navigate(`/channel/${encodeURIComponent(g)}?type=genre`)}
                    className="control px-2.5 h-7 text-xs"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {overview && (
              <p className="text-sm leading-relaxed max-w-2xl mb-7" style={{ color: 'var(--text-soft)' }}>
                {overview}
              </p>
            )}

            <ServerPanel
              lookup={lookup}
              playback={playback}
              detail={detail}
              navigate={navigate}
              mediaType={mediaType}
            />

            <dl className="mt-7 space-y-2 text-sm">
              <Credit label="Director" people={directors} navigate={navigate} />
              <Credit label="Writer" people={writers.slice(0, 3)} navigate={navigate} />
              {studios.length > 0 && (
                <div className="flex gap-3">
                  <dt className="w-20 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>Studio</dt>
                  <dd className="flex flex-wrap gap-x-1.5" style={{ color: 'var(--text-soft)' }}>
                    {studios.slice(0, 3).map((studio, i) => (
                      <span key={studio.id || studio.name}>
                        <button
                          onClick={() => navigate(`/channel/${studio.id}?type=studio&name=${encodeURIComponent(studio.name)}`)}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Building2 size={12} aria-hidden="true" />
                          {studio.name}
                        </button>
                        {i < Math.min(studios.length, 3) - 1 && ','}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {cast.length > 0 && (
          <section className="mt-14">
            <h2 className="eyebrow mb-4">Cast</h2>
            <div className="row-track pb-2">
              {cast.map(person => (
                <button
                  key={person.id}
                  onClick={() => navigate(`/channel/${person.id}?type=person&name=${encodeURIComponent(person.name)}`)}
                  className="flex-shrink-0 w-24 text-center group"
                >
                  <div
                    className="w-16 h-16 mx-auto rounded-full overflow-hidden mb-2 transition-all"
                    style={{ background: 'var(--ink-850)', border: '1px solid var(--line)' }}
                  >
                    {person.profile ? (
                      <img src={person.profile} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span
                        className="w-full h-full flex items-center justify-center font-display text-lg"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        {person.name[0]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight truncate-2">{person.name}</p>
                  {person.character && (
                    <p className="data mt-1 truncate">{person.character}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ── The answer panel ────────────────────────────────────────────────────── */

function ServerPanel({ lookup, playback, detail, navigate, mediaType }) {
  const [copied, setCopied] = useState(false);
  const { status, hit } = lookup;

  if (status === 'no-server') {
    return (
      <Notice tone="info" title="No server connected">
        Add your ISP's directory address in Settings to check availability.
      </Notice>
    );
  }

  if (status === 'idle' || status === 'searching') {
    return (
      <div className="control inline-flex items-center gap-2.5 px-4 h-11 text-sm" style={{ color: 'var(--text-dim)' }}>
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        Searching your server
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <div className="flex flex-col gap-2 items-start">
        <StatusChip status="off" />
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          This {mediaType === 'tv' ? 'series' : 'film'} is not in your server's library yet.
        </p>
      </div>
    );
  }

  if (status === 'folder-only') {
    return (
      <div className="flex flex-col gap-3 items-start">
        <StatusChip status="on" detail={hit.library.label} />
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Found the folder, but no playable file inside it.
        </p>
        <button
          onClick={() => navigate(`/browse?url=${encodeURIComponent(hit.url)}`)}
          className="control flex items-center gap-2 px-4 h-10 text-sm"
        >
          <FolderOpen size={15} aria-hidden="true" />
          Open folder
        </button>
      </div>
    );
  }

  // status === 'found'
  const media = describeMedia(hit.videoUrl);
  const summary = mediaSummary(media);
  const chipStatus = playback ? playback.status : 'checking';

  const copyUrl = () => {
    navigator.clipboard.writeText(hit.videoUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const play = () =>
    navigate(`/watch/${encodeURIComponent(hit.videoUrl)}`, {
      state: { file: hit.file, meta: detail },
    });

  const blocked = playback?.status === 'blocked';

  return (
    <div className="flex flex-col gap-3.5 items-start">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={chipStatus === 'ok' ? 'on' : chipStatus} detail={summary} />
        <span className="data">{hit.library.label}</span>
        {media.dualAudio && <span className="data">Dual audio</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!blocked && (
          <button
            onClick={play}
            className="btn-accent flex items-center gap-2 px-5 h-11 rounded-[10px] text-[15px]"
          >
            <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            Play here
          </button>
        )}

        {/* VLC leads when the browser cannot handle the file at all. */}
        <VlcButton url={hit.videoUrl} title={detail.title} prominent={blocked} />

        <WatchlistButton
          fileUrl={hit.videoUrl}
          title={detail.title}
          poster={detail.poster}
        />

        <button
          onClick={copyUrl}
          className="control flex items-center gap-2 px-3.5 h-11 text-[15px]"
          style={{ color: 'var(--text-soft)' }}
        >
          {copied ? <Check size={15} style={{ color: 'var(--ok)' }} /> : <Copy size={15} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>

        <a
          href={hit.videoUrl}
          download
          className="control flex items-center gap-2 px-3.5 h-11 text-[15px]"
          style={{ color: 'var(--text-soft)' }}
        >
          <Download size={15} aria-hidden="true" />
          Download
        </a>
      </div>

      {blocked && (
        <Notice tone="error" title="This file will not play in your browser">
          {reasonText(playback.reason)} VLC handles it.
        </Notice>
      )}

      {playback?.status === 'no-audio' && (
        <Notice tone="warn" title="Video plays, audio will not">
          The audio track is {media.audioCodec?.toUpperCase()}, which no browser can decode.
          Play in VLC for sound.
        </Notice>
      )}

      {media.dualAudio && !blocked && (
        <Notice tone="info" title="Two audio tracks in this file">
          Browsers cannot switch between them and will use whichever the file marks as
          default, often the Hindi dub. Play in VLC to choose the English track, and to turn
          on the subtitles built into the file.
        </Notice>
      )}
    </div>
  );
}

/** Save a title for later. Firebase auth is anonymous, so this needs no sign-in. */
function WatchlistButton({ fileUrl, title, poster }) {
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    let live = true;
    isBookmarked(fileUrl).then(v => live && setSaved(v)).catch(() => live && setSaved(false));
    return () => { live = false; };
  }, [fileUrl]);

  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    try {
      if (next) await addBookmark(fileUrl, title, poster);
      else await removeBookmark(fileUrl);
    } catch {
      setSaved(!next);   // put it back if the write failed
    }
  };

  return (
    <button
      onClick={toggle}
      aria-pressed={!!saved}
      className="control flex items-center gap-2 px-3.5 h-11 text-[15px]"
      style={{ color: saved ? 'var(--accent)' : 'var(--text-soft)' }}
    >
      {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
      {saved ? 'Saved' : 'Watchlist'}
    </button>
  );
}

/** Locate a title on the server, distinguishing "missing" from "no file inside". */
async function searchServer(detail, mediaType) {
  if (!localStorage.getItem('isp_url')) return { status: 'no-server', hit: null };

  try {
    const hit = await findOnServer(detail.title, {
      year: detail.year,
      kind: mediaType,
      genres: detail.genres || [],
    });
    if (!hit) return { status: 'missing', hit: null };
    if (!hit.videoUrl) return { status: 'folder-only', hit };
    return { status: 'found', hit };
  } catch {
    return { status: 'missing', hit: null };
  }
}

function Credit({ label, people, navigate }) {
  if (!people?.length) return null;
  return (
    <div className="flex gap-3">
      <dt className="w-20 flex-shrink-0" style={{ color: 'var(--text-dim)' }}>{label}</dt>
      <dd className="flex flex-wrap gap-x-1.5" style={{ color: 'var(--text-soft)' }}>
        {people.map((name, i) => (
          <span key={name}>
            <button
              onClick={() => navigate(`/channel/${encodeURIComponent(name)}?type=person-name`)}
              className="hover:underline"
            >
              {name}
            </button>
            {i < people.length - 1 && ','}
          </span>
        ))}
      </dd>
    </div>
  );
}

function reasonText(reason) {
  switch (reason) {
    case 'unsupported':    return 'The container or codec is not supported here.';
    case 'no-video-track': return 'No decodable video track was found.';
    case 'network':        return 'The file could not be read from the server.';
    case 'timeout':        return 'The server did not respond in time.';
    default:               return 'The browser could not decode it.';
  }
}

function formatRuntime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function DetailSkeleton() {
  return (
    <div className="page-enter">
      <div className="skeleton h-[38vw] max-h-[430px] min-h-[220px]" />
      <div className="relative -mt-24 px-5 sm:px-7 max-w-6xl">
        <div className="flex gap-7">
          <div className="skeleton hidden sm:block w-40 md:w-48 aspect-[2/3] rounded-xl flex-shrink-0" />
          <div className="flex-1 sm:pt-20 space-y-4">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-10 w-2/3 rounded" />
            <div className="skeleton h-3 w-1/3 rounded" />
            <div className="space-y-2 max-w-2xl pt-3">
              <div className="skeleton h-3 rounded" />
              <div className="skeleton h-3 rounded" />
              <div className="skeleton h-3 w-4/5 rounded" />
            </div>
            <div className="skeleton h-11 w-40 rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
