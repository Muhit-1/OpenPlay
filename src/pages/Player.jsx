// src/pages/Player.jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import EpisodeList from '../components/EpisodeList';
import SubtitleSelector from '../components/SubtitleSelector';
import { fetchMeta, fetchDirectory } from '../lib/tmdb';
import { saveProgress, getProgress } from '../lib/firebase';

export default function Player() {
  const { encodedUrl } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const fileUrl = decodeURIComponent(encodedUrl);
  const codecWarning = detectCodecWarning(fileUrl);

  // State from navigation (optional)
  const passedFile = location.state?.file;
  const passedMeta = location.state?.meta;

  const videoRef = useRef(null);
  const playerRef = useRef(null);

  const [meta, setMeta] = useState(passedMeta || null);
  const [siblings, setSiblings] = useState([]); // other files in same folder
  const [subtitles, setSubtitles] = useState([]); // external .srt/.vtt files
  const [activeSub, setActiveSub] = useState(null);
  const [resumed, setResumed] = useState(false);
  const [resumeAt, setResumeAt] = useState(0);
  const [showResume, setShowResume] = useState(false);

  // ── Fetch metadata if not passed ──
  useEffect(() => {
    if (!passedMeta && passedFile) {
      fetchMeta(passedFile.name).then(m => { if (m?.found) setMeta(m); });
    }
  }, [passedFile, passedMeta]);

  // ── Fetch sibling files (for episode list + subtitle detection) ──
  useEffect(() => {
    const parentUrl = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
    fetchDirectory(parentUrl)
      .then(data => {
        setSiblings(data.files.filter(f => f.type === 'video'));
        // Build subtitle track list from files in same folder
        const subs = data.files
          .filter(f => f.type === 'subtitle')
          .map(f => {
            const baseName = f.name.replace(/\.[^.]+$/, '');
            const langMatch = f.name.match(/\b(english|hindi|bangla|bengali|french|german|spanish|japanese|korean|chinese)\b/i)
              || f.name.match(/\.(en|hi|bn|fr|de|es|ja|ko|zh)\./i);
            const lang = langMatch?.[1] || 'und';
            const langLabel = lang === 'und' ? 'Subtitle' : lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
            return {
              label: `${langLabel}`,
              language: lang,
              src: f.url.toLowerCase().endsWith('.srt')
                ? `/api/proxy?url=${encodeURIComponent(f.url)}`
                : f.url,
              kind: 'subtitles',
            };
          });
        setSubtitles(subs);
      })
      .catch(() => { });
  }, [fileUrl]);

  // ── Load saved progress ──
  useEffect(() => {
    getProgress(fileUrl)
      .then(secs => {
        if (secs > 10) {
          setResumeAt(secs);
          setShowResume(true);
        }
      })
      .catch(() => { });
  }, [fileUrl]);

  // ── Initialise Video.js ──
  useEffect(() => {
    if (!videoRef.current) return;
    if (playerRef.current) return; // already initialized, don't double-init

    const videoElement = videoRef.current;
    if (!videoElement.isConnected) return; // not in DOM yet, skip

    const player = videojs(videoElement, {
      controls: true,
      autoplay: true,
      preload: 'auto',
      fluid: true,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      sources: [{ src: fileUrl, type: guessType(fileUrl) }],
    });

    playerRef.current = player;

    // Save progress every 30 s
    const interval = setInterval(() => {
      if (player.paused()) return;
      const current = player.currentTime();
      const duration = player.duration() || 0;
      if (current > 5) {
        saveProgress(
          fileUrl,
          passedFile?.name || fileUrl.split('/').pop(),
          meta?.poster || null,
          current,
          duration
        ).catch(() => { });
      }
    }, 30_000);

    // Also save on pause/end
    const onPause = () => {
      const current = player.currentTime();
      const duration = player.duration() || 0;
      if (current > 5) {
        saveProgress(fileUrl, passedFile?.name || fileUrl.split('/').pop(), meta?.poster || null, current, duration).catch(() => { });
      }
    };
    player.on('pause', onPause);
    player.on('ended', onPause);

    return () => {
      clearInterval(interval);
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.off('pause', onPause);
        playerRef.current.off('ended', onPause);
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [fileUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle subtitle selection ──
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    // Remove existing text tracks
    const existing = player.remoteTextTracks();
    for (let i = existing.length - 1; i >= 0; i--) {
      player.removeRemoteTextTrack(existing[i]);
    }
    if (activeSub) {
      player.addRemoteTextTrack({
        kind: activeSub.kind,
        label: activeSub.label,
        language: activeSub.language,
        src: activeSub.src,
        default: true,
      }, false);
    }
  }, [activeSub]);

  const handleResume = useCallback(() => {
    playerRef.current?.currentTime(resumeAt);
    setShowResume(false);
    setResumed(true);
  }, [resumeAt]);

  const handleStartOver = useCallback(() => {
    playerRef.current?.currentTime(0);
    setShowResume(false);
  }, []);

  const title = meta?.title || (passedFile?.name || fileUrl.split('/').pop()).replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
  const overview = meta?.overview;
  const cast = meta?.cast?.slice(0, 6) || [];
  const genres = meta?.genres || [];

  return (
    <div className="min-h-screen bg-zinc-950 pt-16">

      {/* ── Back button ── */}
      <div className="px-6 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 px-6 pb-12">

        {/* ── Left: Player + info ── */}
        <div className="flex-1 min-w-0">

          {/* Player wrapper */}
          <div className="relative rounded-xl overflow-hidden bg-black">
            {codecWarning && (
              <div className="bg-yellow-900/80 border border-yellow-600 text-yellow-200 text-sm px-4 py-3 flex items-start gap-3">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Codec not supported in browser ({codecWarning})</p>
                  <p className="text-yellow-300 text-xs mt-1">
                    This file uses a codec your browser cannot decode. You will hear audio but see no video.
                    Use VLC or another media player to watch this file.
                  </p>
                </div>
              </div>
            )}
            <div data-vjs-player>
              <video
                ref={videoRef}
                className="video-js vjs-default-skin vjs-big-play-centered w-full"
              />
            </div>

            {/* Resume prompt overlay */}
            {showResume && (
              <div className="absolute bottom-16 left-0 right-0 flex justify-center">
                <div className="bg-black/90 backdrop-blur-sm rounded-xl px-5 py-4 flex items-center gap-4 mx-4">
                  <p className="text-white text-sm">
                    Continue from <span className="text-red-400 font-semibold">{formatTime(resumeAt)}</span>?
                  </p>
                  <button onClick={handleResume} className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors">
                    Resume
                  </button>
                  <button onClick={handleStartOver} className="text-zinc-400 hover:text-white text-sm transition-colors">
                    Start over
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Subtitle selector + VLC fallback ── */}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
            <SubtitleSelector
              tracks={subtitles}
              activeSrc={activeSub?.src}
              onSelect={setActiveSub}
            />
    <button
  onClick={() => {
    navigator.clipboard.writeText(fileUrl).then(() => {
      alert('Video URL copied! Paste it into VLC: Media → Open Network Stream (Ctrl+N)');
    });
  }}
  className={`flex items-center gap-2 text-xs transition-colors ${
    codecWarning
      ? 'bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded-lg font-medium'
      : 'bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-lg'
  }`}
>
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
  </svg>
  Copy URL for VLC
</button>

            <a
              href={fileUrl}
              download
              className="flex items-center gap-2 text-zinc-400 hover:text-white text-xs transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </a>
          </div>

          {/* ── Title + metadata ── */}
          <div className="mt-6">
            <div className="flex items-start gap-4">
              {meta?.poster && (
                <img src={meta.poster} alt={title} className="hidden md:block w-24 rounded-lg flex-shrink-0" />
              )}
              <div>
                <h1 className="text-white text-2xl font-bold">{title}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {meta?.year && <span className="text-zinc-400 text-sm">{meta.year}</span>}
                  {meta?.runtime && <span className="text-zinc-400 text-sm">{meta.runtime} min</span>}
                  {meta?.rating && (
                    <span className="bg-zinc-800 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded">
                      ★ {meta.rating}
                    </span>
                  )}
                  {genres.map(g => (
                    <button
                      key={g}
                      onClick={() => navigate(`/channel/${encodeURIComponent(g)}?type=genre`)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded transition-colors"
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {overview && (
                  <p className="text-zinc-400 text-sm mt-3 leading-relaxed max-w-2xl">{overview}</p>
                )}
              </div>
            </div>

            {/* Cast */}
            {cast.length > 0 && (
              <div className="mt-5">
                <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Cast</p>
                <div className="flex flex-wrap gap-2">
                  {cast.map(c => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/channel/${encodeURIComponent(c.name)}?type=actor`)}
                      className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-full pr-3 pl-1 py-1 transition-colors"
                    >
                      {c.profile ? (
                        <img src={c.profile} alt={c.name} className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-zinc-600 flex items-center justify-center text-xs text-zinc-300">
                          {c.name[0]}
                        </div>
                      )}
                      <span className="text-zinc-300 text-xs">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Episode list ── */}
        {siblings.length > 1 && (
          <div className="xl:w-80 flex-shrink-0">
            <p className="text-zinc-400 text-xs uppercase tracking-widest mb-3">Episodes</p>
            <EpisodeList files={siblings} currentUrl={fileUrl} />
          </div>
        )}
      </div>
    </div >
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function guessType(url) {
  const ext = url.split('.').pop().split('?')[0].toLowerCase();
  const map = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    ts: 'video/mp2t',
    m3u8: 'application/x-mpegURL',
  };
  return map[ext] || 'video/mp4';
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function detectCodecWarning(url) {
  const name = decodeURIComponent(url).toLowerCase();
  if (name.includes('x265') || name.includes('h.265') || name.includes('hevc') || name.includes('h265')) {
    return 'x265/HEVC';
  }
  if (name.includes('10bit') || name.includes('10-bit')) {
    return '10-bit';
  }
  return null;
}