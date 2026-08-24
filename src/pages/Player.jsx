// src/pages/Player.jsx
//
// A native <video> element with custom controls.
//
// Two things changed from the original beyond styling:
//   1. The codec warning is now the result of a real load probe, not a guess
//      from the filename. "x265" in a name is not evidence a browser can't
//      play it — most can.
//   2. Subtitle tracks are properly added and removed. The old cleanup loop
//      broke on its first iteration, so switching languages stacked tracks up.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, Copy, Check, Download, Subtitles,
} from 'lucide-react';
import EpisodeList from '../components/EpisodeList';
import { StatusChip, Rating, Notice } from '../components/ui';
import { fetchMeta, fetchDirectory } from '../lib/tmdb';
import { saveProgress, getProgress } from '../lib/firebase';
import { describeMedia, mediaSummary, inspectPlayback } from '../lib/playback';
import VlcButton from '../components/VlcButton';
import { safeDecode, basename } from '../lib/text';
import { useAsync } from '../lib/useAsync';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function Player() {
  const { encodedUrl } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const fileUrl = safeDecode(encodedUrl);
  const passedFile = location.state?.file;
  const passedMeta = location.state?.meta;

  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const scrubRef = useRef(null);
  const hideTimer = useRef(null);

  const [meta, setMeta] = useState(passedMeta || null);
  const [siblings, setSiblings] = useState([]);
  const [subtitles, setSubtitles] = useState([]);
  const [activeSub, setActiveSub] = useState(null);

  const [resumeAt, setResumeAt] = useState(0);
  const [showResume, setShowResume] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrub, setScrub] = useState(null);
  const [copied, setCopied] = useState(false);

  const media = describeMedia(fileUrl);

  // Whether this browser can decode this exact file — a real load probe, not a
  // guess from the filename.
  const { data: playback } = useAsync(fileUrl, () => inspectPlayback(fileUrl));

  // Progress saving reads through a ref so the interval never captures a stale
  // `meta` — the original closed over the first render's value.
  const saveRef = useRef(() => {});
  useEffect(() => {
    saveRef.current = (current, total) => {
      saveProgress(
        fileUrl,
        passedFile?.name || basename(fileUrl),
        meta?.poster || null,
        current,
        total || 0
      ).catch(() => {});
    };
  }, [fileUrl, passedFile, meta]);

  // ── Metadata ──
  useEffect(() => {
    if (passedMeta) return;
    let live = true;
    const name = passedFile?.name || fileUrl.split('/').pop();
    fetchMeta(name).then(m => { if (live && m?.found) setMeta(m); });
    return () => { live = false; };
  }, [fileUrl, passedFile, passedMeta]);

  // ── Siblings and external subtitles ──
  useEffect(() => {
    let live = true;
    const parent = fileUrl.slice(0, fileUrl.lastIndexOf('/') + 1);

    fetchDirectory(parent).then(data => {
      if (!live) return;
      setSiblings(data.files.filter(f => f.type === 'video'));
      setSubtitles(
        data.files
          .filter(f => f.type === 'subtitle')
          .map(f => ({
            label: subtitleLabel(f.name),
            language: subtitleLang(f.name),
            // SRT has to be converted to WebVTT; the proxy does that.
            src: /\.srt$/i.test(f.url) ? `/api/proxy?url=${encodeURIComponent(f.url)}` : f.url,
          }))
      );
    });

    return () => { live = false; };
  }, [fileUrl]);

  // ── Saved position ──
  useEffect(() => {
    let live = true;
    getProgress(fileUrl)
      .then(secs => {
        if (live && secs > 10) { setResumeAt(secs); setShowResume(true); }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [fileUrl]);


  // ── Wire the element ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.src = fileUrl;
    v.load();

    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      if (v.currentTime > 5) saveRef.current(v.currentTime, v.duration);
    };
    const onTime = () => {
      setTime(v.currentTime);
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onDuration = () => setDuration(v.duration || 0);
    const onVolume = () => { setVolume(v.volume); setMuted(v.muted); };
    const onRate = () => setSpeed(v.playbackRate);
    const onEnded = () => { setPlaying(false); saveRef.current(v.currentTime, v.duration); };

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDuration);
    v.addEventListener('volumechange', onVolume);
    v.addEventListener('ratechange', onRate);
    v.addEventListener('ended', onEnded);

    v.play().catch(() => {});   // autoplay may be blocked; controls still work

    const interval = setInterval(() => {
      if (!v.paused && v.currentTime > 5) saveRef.current(v.currentTime, v.duration);
    }, 30_000);

    return () => {
      clearInterval(interval);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDuration);
      v.removeEventListener('volumechange', onVolume);
      v.removeEventListener('ratechange', onRate);
      v.removeEventListener('ended', onEnded);
    };
  }, [fileUrl]);

  // ── Subtitle tracks ──
  // Every <track> this component added is removed before adding the next one.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.querySelectorAll('track[data-openplay]').forEach(t => t.remove());
    disableAllTracks(v);

    if (!activeSub) return;

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = activeSub.label;
    track.srclang = activeSub.language;
    track.src = activeSub.src;
    track.default = true;
    track.setAttribute('data-openplay', '');
    v.appendChild(track);

    // The TextTrack object only exists once the element is attached.
    requestAnimationFrame(() => showTrack(v, activeSub.label));
  }, [activeSub]);

  // ── Controls auto-hide ──
  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
  }, [playing]);

  // Pausing must reveal the controls again; playing starts the hide countdown.
  useEffect(() => {
    if (!playing) {
      clearTimeout(hideTimer.current);
      return;
    }
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(hideTimer.current);
  }, [playing]);

  // ── Actions ──
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);

  const seekBy = useCallback(secs => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + secs));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else shellRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Keyboard ──
  useEffect(() => {
    const onKey = e => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const v = videoRef.current;
      if (!v) return;

      const handlers = {
        ' ': () => togglePlay(),
        k: () => togglePlay(),
        ArrowRight: () => seekBy(10),
        ArrowLeft: () => seekBy(-10),
        ArrowUp: () => { v.volume = Math.min(v.volume + 0.1, 1); },
        ArrowDown: () => { v.volume = Math.max(v.volume - 0.1, 0); },
        m: () => { v.muted = !v.muted; },
        f: () => toggleFullscreen(),
      };

      const handler = handlers[e.key] || handlers[e.key.toLowerCase()];
      if (handler) { e.preventDefault(); handler(); nudgeControls(); }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, toggleFullscreen, nudgeControls]);

  // ── Scrubbing ──
  const ratioFromEvent = e => {
    const rect = scrubRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const onScrubClick = e => {
    if (!duration) return;
    videoRef.current.currentTime = ratioFromEvent(e) * duration;
  };

  const onScrubMove = e => {
    if (!duration) return;
    const rect = scrubRef.current.getBoundingClientRect();
    setScrub({ x: e.clientX - rect.left, t: ratioFromEvent(e) * duration });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(fileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const title = meta?.title
    || describeMedia(passedFile?.name || fileUrl).title
    || basename(fileUrl);

  const playedPct = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="page-enter px-5 sm:px-7 py-6">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 mb-4 text-sm transition-colors"
        style={{ color: 'var(--text-dim)' }}
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Back
      </button>

      <div className="flex flex-col xl:flex-row gap-7">
        <div className="flex-1 min-w-0">
          {playback?.status === 'blocked' && (
            <div className="mb-3 flex flex-col gap-3">
              <Notice tone="error" title="This file will not play in your browser">
                The container or codec is not supported here. VLC handles it.
              </Notice>
              <VlcButton url={fileUrl} title={title} prominent />
            </div>
          )}
          {playback?.status === 'no-audio' && (
            <div className="mb-3">
              <Notice tone="warn" title="Video plays, audio will not">
                The audio is {media.audioCodec?.toUpperCase()}, which no browser can decode.
                Play in VLC for sound.
              </Notice>
            </div>
          )}

          <div
            ref={shellRef}
            className="player-shell relative select-none"
            onMouseMove={nudgeControls}
            onMouseLeave={() => playing && setControlsVisible(false)}
            style={{ cursor: controlsVisible ? 'default' : 'none' }}
          >
            <video
              ref={videoRef}
              className="w-full block"
              preload="auto"
              playsInline
              onClick={togglePlay}
            />

            {!playing && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center"
                aria-label="Play"
              >
                <span
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--accent)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                >
                  <Play size={24} fill="var(--accent-ink)" strokeWidth={0} aria-hidden="true" />
                </span>
              </button>
            )}

            {showResume && (
              <div className="absolute bottom-24 inset-x-0 flex justify-center px-4">
                <div className="panel flex items-center gap-4 px-4 py-3" style={{ background: 'rgba(8,11,15,0.94)' }}>
                  <span className="text-sm">
                    Resume from <span className="mono" style={{ color: 'var(--accent)' }}>{formatTime(resumeAt)}</span>?
                  </span>
                  <button
                    onClick={() => {
                      videoRef.current.currentTime = resumeAt;
                      videoRef.current.play().catch(() => {});
                      setShowResume(false);
                    }}
                    className="btn-accent px-3.5 h-8 rounded-lg text-xs"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => setShowResume(false)}
                    className="text-xs"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}

            <div
              className="player-controls absolute inset-x-0 bottom-0 px-4 pt-12 pb-3.5 transition-opacity duration-200"
              style={{
                opacity: controlsVisible ? 1 : 0,
                pointerEvents: controlsVisible ? 'auto' : 'none',
              }}
            >
              <div
                ref={scrubRef}
                className="scrubber mb-3"
                onClick={onScrubClick}
                onMouseMove={onScrubMove}
                onMouseLeave={() => setScrub(null)}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(time)}
                tabIndex={0}
              >
                <div className="scrubber-buffer" style={{ width: `${bufferedPct}%` }} />
                <div className="scrubber-fill" style={{ width: `${playedPct}%` }} />
                {scrub && (
                  <span
                    className="absolute bottom-5 px-1.5 py-0.5 rounded mono text-[10px] pointer-events-none"
                    style={{
                      left: Math.max(0, scrub.x - 22),
                      background: 'var(--ink-800)',
                      border: '1px solid var(--line-bright)',
                    }}
                  >
                    {formatTime(scrub.t)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <CtrlButton onClick={togglePlay} label={playing ? 'Pause' : 'Play'}>
                  {playing
                    ? <Pause size={18} fill="currentColor" strokeWidth={0} />
                    : <Play size={18} fill="currentColor" strokeWidth={0} />}
                </CtrlButton>

                <CtrlButton onClick={() => seekBy(-10)} label="Back 10 seconds">
                  <RotateCcw size={16} />
                </CtrlButton>
                <CtrlButton onClick={() => seekBy(10)} label="Forward 10 seconds">
                  <RotateCw size={16} />
                </CtrlButton>

                <span className="mono text-[11px] tabular-nums ml-1.5" style={{ color: 'var(--text-soft)' }}>
                  {formatTime(time)} <span style={{ color: 'var(--text-faint)' }}>/ {formatTime(duration)}</span>
                </span>

                <div className="flex-1" />

                {subtitles.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Subtitles size={15} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
                    <select
                      value={activeSub?.src || ''}
                      onChange={e =>
                        setActiveSub(subtitles.find(s => s.src === e.target.value) || null)
                      }
                      aria-label="Subtitles"
                      className="bg-transparent mono text-[11px] outline-none cursor-pointer"
                      style={{ color: 'var(--text-soft)' }}
                    >
                      <option value="" style={{ background: 'var(--ink-800)' }}>Off</option>
                      {subtitles.map(s => (
                        <option key={s.src} value={s.src} style={{ background: 'var(--ink-800)' }}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <CtrlButton
                  onClick={() => { videoRef.current.muted = !videoRef.current.muted; }}
                  label={muted ? 'Unmute' : 'Mute'}
                >
                  <VolumeIcon size={16} />
                </CtrlButton>

                <input
                  type="range"
                  min="0" max="1" step="0.05"
                  value={muted ? 0 : volume}
                  onChange={e => {
                    const v = videoRef.current;
                    v.volume = parseFloat(e.target.value);
                    v.muted = v.volume === 0;
                  }}
                  aria-label="Volume"
                  className="volume-slider w-16"
                />

                <select
                  value={speed}
                  onChange={e => { videoRef.current.playbackRate = parseFloat(e.target.value); }}
                  aria-label="Playback speed"
                  className="bg-transparent mono text-[11px] outline-none cursor-pointer ml-1"
                  style={{ color: 'var(--text-soft)' }}
                >
                  {SPEEDS.map(r => (
                    <option key={r} value={r} style={{ background: 'var(--ink-800)' }}>{r}x</option>
                  ))}
                </select>

                <CtrlButton onClick={toggleFullscreen} label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </CtrlButton>
              </div>
            </div>
          </div>

          {/* Under-player bar */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <StatusChip
              status={playback ? (playback.status === 'ok' ? 'on' : playback.status) : 'checking'}
              detail={mediaSummary(media)}
            />

            <div className="flex-1" />

            <VlcButton url={fileUrl} title={title} />

            <button
              onClick={copyUrl}
              className="control flex items-center gap-1.5 px-3 h-9 text-[13px]"
              style={{ color: 'var(--text-soft)' }}
            >
              {copied ? <Check size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>

            <a
              href={fileUrl}
              download
              className="control flex items-center gap-1.5 px-3 h-9 text-[13px]"
              style={{ color: 'var(--text-soft)' }}
            >
              <Download size={14} aria-hidden="true" />
              Download
            </a>
          </div>

          {(subtitles.length === 0 || media.dualAudio) && (
            <div className="mt-3">
              <Notice tone="info" title="Audio tracks and subtitles">
                {media.dualAudio && (
                  <p className="mb-1">
                    This file carries more than one audio track. Browsers have no way to
                    switch between them, so it plays whichever the file marks as default.
                  </p>
                )}
                {subtitles.length === 0 && (
                  <p>
                    Its subtitles are stored inside the file rather than as a separate
                    <span className="mono"> .srt </span> next to it, and browsers cannot read
                    those either.
                  </p>
                )}
                <p className="mt-1.5">Both work in VLC.</p>
              </Notice>
            </div>
          )}

          <p className="data mt-3">
            Space play · &larr; &rarr; 10s · &uarr; &darr; volume · M mute · F fullscreen
          </p>

          {/* Title block */}
          <div className="mt-8 flex gap-5">
            {meta?.poster && (
              <img
                src={meta.poster}
                alt=""
                className="hidden md:block w-24 rounded-lg flex-shrink-0 self-start"
                style={{ border: '1px solid var(--line)' }}
              />
            )}
            <div className="min-w-0">
              <h1 className="font-display text-2xl leading-tight mb-2">{title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 data mb-3">
                {meta?.year && <span>{meta.year}</span>}
                {meta?.runtime && <span>{meta.runtime} min</span>}
                {meta?.seasons && <span>{meta.seasons} seasons</span>}
                <Rating value={meta?.rating} />
              </div>

              {meta?.genres?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {meta.genres.map(g => (
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

              {meta?.overview && (
                <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--text-soft)' }}>
                  {meta.overview}
                </p>
              )}
            </div>
          </div>
        </div>

        {siblings.length > 1 && (
          <aside className="xl:w-80 flex-shrink-0">
            <h2 className="eyebrow mb-3">In this folder</h2>
            <EpisodeList files={siblings} currentUrl={fileUrl} showMeta={meta} />
          </aside>
        )}
      </div>
    </div>
  );
}

/** TextTrackList is array-like but not an array; index it explicitly. */
function disableAllTracks(video) {
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = 'disabled';
  }
}

function showTrack(video, label) {
  for (let i = 0; i < video.textTracks.length; i++) {
    if (video.textTracks[i].label === label) video.textTracks[i].mode = 'showing';
  }
}

function CtrlButton({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="player-btn p-2"
      style={{ color: 'var(--text)' }}
    >
      {children}
    </button>
  );
}

function formatTime(secs) {
  if (!secs || !Number.isFinite(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const LANGS = {
  english: 'en', hindi: 'hi', bangla: 'bn', bengali: 'bn', french: 'fr',
  german: 'de', spanish: 'es', japanese: 'ja', korean: 'ko', chinese: 'zh',
  arabic: 'ar', tamil: 'ta', telugu: 'te',
};

function subtitleLang(name) {
  const full = name.match(new RegExp(`\\b(${Object.keys(LANGS).join('|')})\\b`, 'i'));
  if (full) return LANGS[full[1].toLowerCase()];
  const code = name.match(/[._-](en|hi|bn|fr|de|es|ja|ko|zh|ar|ta|te)[._-]/i);
  return code ? code[1].toLowerCase() : 'und';
}

function subtitleLabel(name) {
  const full = name.match(new RegExp(`\\b(${Object.keys(LANGS).join('|')})\\b`, 'i'));
  if (full) return full[1][0].toUpperCase() + full[1].slice(1).toLowerCase();
  const code = subtitleLang(name);
  return code === 'und' ? 'Subtitles' : code.toUpperCase();
}
