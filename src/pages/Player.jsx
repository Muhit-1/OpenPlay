// src/pages/Player.jsx
// Custom native HTML5 player — full design control, no Video.js clutter.
// Video.js kept as optional HLS fallback for .m3u8 streams.
import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import EpisodeList from '../components/EpisodeList';
import SubtitleSelector from '../components/SubtitleSelector';
import { fetchMeta, fetchDirectory } from '../lib/tmdb';
import { saveProgress, getProgress } from '../lib/firebase';

// Only load Video.js for HLS
let vjsLoaded = false;
async function loadVjs() {
  if (vjsLoaded) return;
  vjsLoaded = true;
  await import('video.js/dist/video-js.css');
}

export default function Player() {
  const { encodedUrl } = useParams();
  const location       = useLocation();
  const navigate       = useNavigate();
  const fileUrl        = decodeURIComponent(encodedUrl);
  const isHls          = fileUrl.toLowerCase().endsWith('.m3u8');
  const codecWarning   = detectCodecWarning(fileUrl);

  const passedFile = location.state?.file;
  const passedMeta = location.state?.meta;

  // Refs
  const videoRef     = useRef(null);
  const containerRef = useRef(null);
  const progressRef  = useRef(null);
  const hideTimer    = useRef(null);

  // Metadata + siblings
  const [meta, setMeta]         = useState(passedMeta || null);
  const [siblings, setSiblings] = useState([]);
  const [subtitles, setSubtitles] = useState([]);
  const [activeSub, setActiveSub] = useState(null);

  // Resume
  const [resumeAt, setResumeAt]     = useState(0);
  const [showResume, setShowResume] = useState(false);

  // Player state
  const [playing, setPlaying]         = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [volume, setVolume]           = useState(1);
  const [muted, setMuted]             = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered]       = useState(0);
  // Hover preview
  const [previewX, setPreviewX]       = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  // Copied URL toast
  const [copied, setCopied]           = useState(false);

  // ── Fetch metadata ──
  useEffect(() => {
    if (!passedMeta && passedFile) {
      fetchMeta(passedFile.name).then(m => { if (m?.found) setMeta(m); });
    }
  }, [passedFile, passedMeta]);

  // ── Fetch siblings + subtitles ──
  useEffect(() => {
    const parentUrl = fileUrl.substring(0, fileUrl.lastIndexOf('/') + 1);
    fetchDirectory(parentUrl)
      .then(data => {
        setSiblings(data.files.filter(f => f.type === 'video'));
        const subs = data.files
          .filter(f => f.type === 'subtitle')
          .map(f => {
            const langMatch = f.name.match(/\b(english|hindi|bangla|bengali|french|german|spanish|japanese|korean|chinese)\b/i)
              || f.name.match(/\.(en|hi|bn|fr|de|es|ja|ko|zh)\./i);
            const lang = langMatch?.[1] || 'und';
            const langLabel = lang === 'und' ? 'Subtitle' : lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
            return {
              label: langLabel,
              language: lang,
              src: f.url.toLowerCase().endsWith('.srt')
                ? `/api/proxy?url=${encodeURIComponent(f.url)}`
                : f.url,
              kind: 'subtitles',
            };
          });
        setSubtitles(subs);
      })
      .catch(() => {});
  }, [fileUrl]);

  // ── Load saved progress ──
  useEffect(() => {
    getProgress(fileUrl)
      .then(secs => {
        if (secs > 10) { setResumeAt(secs); setShowResume(true); }
      })
      .catch(() => {});
  }, [fileUrl]);

  // ── Wire native video element events ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.src = fileUrl;
    v.load();

    const onPlay    = () => setPlaying(true);
    const onPause   = () => setPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime);
      if (v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1));
      }
    };
    const onDuration = () => setDuration(v.duration || 0);
    const onEnded    = () => {
      setPlaying(false);
      saveProg(v.currentTime, v.duration);
    };
    const onVolumeChange = () => { setVolume(v.volume); setMuted(v.muted); };

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('durationchange', onDuration);
    v.addEventListener('ended', onEnded);
    v.addEventListener('volumechange', onVolumeChange);

    // Autoplay
    v.play().catch(() => {});

    // Periodic save
    const interval = setInterval(() => {
      if (!v.paused && v.currentTime > 5) {
        saveProg(v.currentTime, v.duration);
      }
    }, 30_000);

    // Save on pause
    const onPauseForSave = () => { if (v.currentTime > 5) saveProg(v.currentTime, v.duration); };
    v.addEventListener('pause', onPauseForSave);

    return () => {
      clearInterval(interval);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('durationchange', onDuration);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('volumechange', onVolumeChange);
      v.removeEventListener('pause', onPauseForSave);
    };
  }, [fileUrl]); // eslint-disable-line

  function saveProg(current, dur) {
    saveProgress(
      fileUrl,
      passedFile?.name || fileUrl.split('/').pop(),
      meta?.poster || null,
      current,
      dur || 0
    ).catch(() => {});
  }

  // ── Subtitle track management ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Clear existing tracks
    while (v.textTracks.length > 0) {
      // can't remove native tracks easily; just disable all
      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = 'disabled';
      }
      break;
    }
    if (activeSub) {
      // Create a new track element
      const existing = v.querySelector(`track[src="${activeSub.src}"]`);
      if (!existing) {
        const track = document.createElement('track');
        track.kind    = activeSub.kind;
        track.label   = activeSub.label;
        track.srclang = activeSub.language;
        track.src     = activeSub.src;
        track.default = true;
        v.appendChild(track);
      }
      for (let i = 0; i < v.textTracks.length; i++) {
        if (v.textTracks[i].label === activeSub.label) {
          v.textTracks[i].mode = 'showing';
        }
      }
    }
  }, [activeSub]);

  // ── Controls auto-hide ──
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [playing, resetHideTimer]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': v.currentTime = Math.min(v.currentTime + 10, v.duration); break;
        case 'ArrowLeft':  v.currentTime = Math.max(v.currentTime - 10, 0); break;
        case 'ArrowUp':    v.volume = Math.min(v.volume + 0.1, 1); break;
        case 'ArrowDown':  v.volume = Math.max(v.volume - 0.1, 0); break;
        case 'm': v.muted = !v.muted; break;
        case 'f': toggleFullscreen(); break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line

  // ── Fullscreen change listener ──
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Actions ──
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleProgressClick = (e) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = videoRef.current;
    if (v) v.currentTime = ratio * duration;
  };

  const handleProgressHover = (e) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPreviewX(e.clientX - rect.left);
    setPreviewTime(ratio * duration);
    setShowPreview(true);
  };

  const handleVolumeChange = (e) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = parseFloat(e.target.value);
    v.muted  = v.volume === 0;
  };

  const handleResume = () => {
    if (videoRef.current) videoRef.current.currentTime = resumeAt;
    setShowResume(false);
  };
  const handleStartOver = () => {
    if (videoRef.current) videoRef.current.currentTime = 0;
    setShowResume(false);
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(fileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const title    = meta?.title || (passedFile?.name || fileUrl.split('/').pop()).replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
  const overview = meta?.overview;
  const cast     = meta?.cast?.slice(0, 6) || [];
  const genres   = meta?.genres || [];
  const filledPct  = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-zinc-950 pt-16 page-enter">

      {/* Back */}
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

        {/* ── Left col: Player + info ── */}
        <div className="flex-1 min-w-0">

          {/* Codec warning */}
          {codecWarning && (
            <div className="mb-2 bg-yellow-900/60 border border-yellow-700/60 text-yellow-200 text-sm px-4 py-3 rounded-xl flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <p className="font-semibold">Codec not supported in browser ({codecWarning})</p>
                <p className="text-yellow-300 text-xs mt-0.5">You may hear audio but see no video. Use VLC for full playback.</p>
              </div>
            </div>
          )}

          {/* ── Video container ── */}
          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden bg-black select-none"
            onMouseMove={resetHideTimer}
            onMouseLeave={() => { if (playing) setShowControls(false); }}
            onClick={togglePlay}
            style={{ cursor: showControls ? 'default' : 'none' }}
          >
            <video
              ref={videoRef}
              className="w-full block"
              preload="auto"
              playsInline
            />

            {/* Controls overlay */}
            <div
              className={`player-controls absolute inset-x-0 bottom-0 px-4 pt-10 pb-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Progress bar */}
              <div
                ref={progressRef}
                className="progress-bar-track mb-3 relative"
                onClick={handleProgressClick}
                onMouseMove={handleProgressHover}
                onMouseLeave={() => setShowPreview(false)}
              >
                {/* Buffer fill */}
                <div
                  className="absolute inset-0 rounded bg-white/20"
                  style={{ width: `${bufferedPct}%` }}
                />
                {/* Played fill */}
                <div className="progress-bar-fill" style={{ width: `${filledPct}%` }} />

                {/* Hover preview bubble */}
                {showPreview && (
                  <div
                    className="preview-thumb absolute bottom-6 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-white text-xs font-mono"
                    style={{
                      left: Math.max(0, previewX - 24),
                      transform: 'translateX(0)',
                      pointerEvents: 'none',
                    }}
                  >
                    {formatTime(previewTime)}
                  </div>
                )}
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-3">
                {/* Play/pause */}
                <button onClick={togglePlay} className="text-white hover:text-[var(--accent-light)] transition-colors">
                  {playing ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                {/* Skip ±10s */}
                <button
                  onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, v.currentTime - 10); }}
                  className="text-zinc-300 hover:text-white text-xs font-mono transition-colors"
                  title="−10s"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/>
                  </svg>
                </button>
                <button
                  onClick={() => { const v = videoRef.current; if (v) v.currentTime = Math.min(v.duration, v.currentTime + 10); }}
                  className="text-zinc-300 hover:text-white transition-colors"
                  title="+10s"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zm8 0a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"/>
                  </svg>
                </button>

                {/* Time */}
                <span className="text-white text-xs font-mono tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <div className="flex-1" />

                {/* Volume */}
                <button
                  onClick={() => { const v = videoRef.current; if (v) v.muted = !v.muted; }}
                  className="text-zinc-300 hover:text-white transition-colors"
                >
                  {muted || volume === 0 ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 accent-[var(--accent)] cursor-pointer"
                  onClick={e => e.stopPropagation()}
                />

                {/* Playback speed */}
                <select
                  onChange={e => { const v = videoRef.current; if (v) v.playbackRate = parseFloat(e.target.value); }}
                  defaultValue="1"
                  className="bg-transparent text-zinc-300 text-xs border-none outline-none cursor-pointer"
                  onClick={e => e.stopPropagation()}
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
                    <option key={r} value={r} className="bg-zinc-900">{r}×</option>
                  ))}
                </select>

                {/* Fullscreen */}
                <button onClick={toggleFullscreen} className="text-zinc-300 hover:text-white transition-colors">
                  {fullscreen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Big play/pause indicator on click */}
            {/* Resume prompt */}
            {showResume && (
              <div className="absolute bottom-20 left-0 right-0 flex justify-center z-20" onClick={e => e.stopPropagation()}>
                <div className="bg-black/90 backdrop-blur-sm rounded-xl px-5 py-4 flex items-center gap-4 mx-4 border border-zinc-700/50">
                  <p className="text-white text-sm">
                    Resume from <span className="text-[var(--accent)] font-semibold">{formatTime(resumeAt)}</span>?
                  </p>
                  <button onClick={handleResume} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium px-4 py-1.5 rounded-full transition-colors">
                    Resume
                  </button>
                  <button onClick={handleStartOver} className="text-zinc-400 hover:text-white text-sm transition-colors">
                    Start over
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Below-player toolbar ── */}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
            <SubtitleSelector tracks={subtitles} activeSrc={activeSub?.src} onSelect={setActiveSub} />

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={copyUrl}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  codecWarning
                    ? 'bg-yellow-700 hover:bg-yellow-600 text-white font-medium'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                {copied ? (
                  <><svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg> Copied!</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg> Copy for VLC</>
                )}
              </button>

              <a
                href={fileUrl}
                download
                className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Download
              </a>
            </div>
          </div>

          {/* ── Keyboard shortcuts hint ── */}
          <p className="text-zinc-600 text-xs mt-2">
            Space/K = play · ← → = ±10s · ↑↓ = volume · M = mute · F = fullscreen
          </p>

          {/* ── Title + metadata ── */}
          <div className="mt-6">
            <div className="flex items-start gap-4">
              {meta?.poster && (
                <img src={meta.poster} alt={title} className="hidden md:block w-24 rounded-lg flex-shrink-0 shadow-lg" />
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-white text-2xl font-bold leading-tight">{title}</h1>
                <div className="flex flex-wrap items-center gap-2.5 mt-2">
                  {meta?.year && <span className="text-zinc-400 text-sm">{meta.year}</span>}
                  {meta?.runtime && <span className="text-zinc-500 text-sm">{meta.runtime} min</span>}
                  {meta?.seasons && <span className="text-zinc-500 text-sm">{meta.seasons} seasons</span>}
                  {meta?.rating && (
                    <span className="bg-zinc-800 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded">
                      ★ {meta.rating}
                    </span>
                  )}
                  {genres.map(g => (
                    <button
                      key={g}
                      onClick={() => navigate(`/channel/${encodeURIComponent(g)}?type=genre`)}
                      className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs px-2 py-0.5 rounded transition-colors"
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
                        <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-300">
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

        {/* ── Right col: Episode list ── */}
        {siblings.length > 1 && (
          <div className="xl:w-80 flex-shrink-0">
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-3">Episodes</p>
            <EpisodeList files={siblings} currentUrl={fileUrl} showMeta={meta} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function detectCodecWarning(url) {
  const name = decodeURIComponent(url).toLowerCase();
  if (name.includes('x265') || name.includes('h.265') || name.includes('hevc') || name.includes('h265')) return 'x265/HEVC';
  if (name.includes('10bit') || name.includes('10-bit')) return '10-bit';
  return null;
}