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

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, Copy, Check, Download, SkipForward,
  PanelRightOpen, GripVertical,
} from 'lucide-react';
import EpisodeList from '../components/EpisodeList';
import { StatusChip, Rating, Notice } from '../components/ui';
import { fetchMeta } from '../lib/tmdb';
import { loadEpisodes, orderEpisodes, nextEpisode, sameUrl } from '../lib/episodes';
import { parseRelease } from '../lib/release';
import { libraryKindFor } from '../lib/server';
import { mediaSrc } from '../lib/api';
import { saveProgress, getProgress, getContinueWatching } from '../lib/firebase';
import { dragLinkProps } from '../lib/drag';
import { progressOf, episodeName } from '../lib/history';
import { getItem, setItem } from '../lib/storage';
import { describeMedia, mediaSummary, inspectPlayback } from '../lib/playback';
import VlcButton from '../components/VlcButton';
import SubtitleMenu from '../components/SubtitleMenu';
import {
  toVtt, shiftVtt, decodeSubtitle, fetchProxiedText, readOffsets, offsetFor, withOffset,
  readSubStyle, saveSubStyle, SUB_SIZES,
} from '../lib/subtitles';
import { basename, normalizeFileUrl } from '../lib/text';
import { useAsync } from '../lib/useAsync';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function Player() {
  const { encodedUrl } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // The router has already decoded the parameter once; decoding it again left
  // raw spaces in the URL and the server listed the folder as empty.
  const fileUrl = normalizeFileUrl(encodedUrl);
  const passedFile = location.state?.file;
  const passedMeta = location.state?.meta;

  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const scrubRef = useRef(null);
  const hideTimer = useRef(null);

  const [meta, setMeta] = useState(passedMeta || null);
  const [siblings, setSiblings] = useState([]);
  const [loadedFor, setLoadedFor] = useState(null);
  const [subtitles, setSubtitles] = useState([]);       // files beside the video
  const [activeSub, setActiveSub] = useState(null);
  const [subFor, setSubFor] = useState(fileUrl);
  const [subNote, setSubNote] = useState(null);
  const [offsets, setOffsets] = useState(readOffsets);
  const [subStyle, setSubStyle] = useState(readSubStyle);
  const subTextRef = useRef({ id: null, text: '' });
  const menuOpenRef = useRef(false);

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

  // Episode panel + autoplay. Both are remembered between visits.
  const [listOpen, setListOpen] = useState(() => getItem('episode_panel') !== 'hidden');
  const [autoplay, setAutoplay] = useState(() => getItem('autoplay_next') !== 'off');
  const [skippedUrl, setSkippedUrl] = useState(null);   // "Cancel" on the up-next card

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

  // ── Next episode ──
  const ordered = useMemo(() => orderEpisodes(siblings), [siblings]);
  const next = nextEpisode(ordered, fileUrl);

  const goNext = useCallback(() => {
    if (next) navigate(`/watch/${encodeURIComponent(next.url)}`, { state: { file: next, meta } });
  }, [next, meta, navigate]);

  // Finishing an episode only rolls on when autoplay is on and it was not cancelled.
  const skipped = skippedUrl === fileUrl;
  const endedRef = useRef(() => {});
  useEffect(() => {
    endedRef.current = () => { if (autoplay && !skipped) goNext(); };
  }, [autoplay, skipped, goNext]);

  const changeAutoplay = on => {
    setAutoplay(on);
    setItem('autoplay_next', on ? 'on' : 'off');
  };

  const changeListOpen = open => {
    setListOpen(open);
    setItem('episode_panel', open ? 'shown' : 'hidden');
  };

  // How far through each file you are, so the panel can show watched episodes.
  const { data: history } = useAsync('player-history', () => getContinueWatching(300).catch(() => []), []);
  const progressMap = useMemo(
    () => new Map(history.map(h => [normalizeFileUrl(h.fileUrl), progressOf(h)])),
    [history]
  );

  // ── Metadata ──
  useEffect(() => {
    if (passedMeta) return;
    let live = true;
    const name = passedFile?.name || fileUrl.split('/').pop();
    fetchMeta(name, libraryKindFor(fileUrl)).then(m => { if (live && m?.found) setMeta(m); });
    return () => { live = false; };
  }, [fileUrl, passedFile, passedMeta]);

  // ── Episodes (every season of this show) and external subtitles ──
  useEffect(() => {
    let live = true;

    loadEpisodes(fileUrl).then(({ videos, subtitles: subs }) => {
      if (!live) return;
      setSiblings(videos);
      setLoadedFor(fileUrl);
      setSubtitles(
        subs
          .filter(f => /\.(srt|vtt)$/i.test(f.name))      // the only formats a browser can show
          .map(f => ({
            id: `file:${f.url}`,
            kind: 'file',
            label: subtitleLabel(f.name),
            language: subtitleLang(f.name),
            detail: f.name,
            // Read through the proxy (CORS), then turned into WebVTT and shifted in the browser.
            load: () => fetchProxiedText(f.url),
          }))
      );
    }).catch(() => { if (live) setLoadedFor(fileUrl); });

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

    v.src = mediaSrc(fileUrl);
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
    const onEnded = () => {
      setPlaying(false);
      saveRef.current(v.currentTime, v.duration);
      endedRef.current();   // roll into the next episode when autoplay allows
    };

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

  // A subtitle belongs to one episode: moving to the next one switches it off.
  if (subFor !== fileUrl) {
    setSubFor(fileUrl);
    setActiveSub(null);
    setSubNote(null);
  }

  const offset = offsetFor(offsets, fileUrl);

  // ── Subtitle tracks ──
  // The subtitle's text is fetched once, shifted by this file's timing offset in
  // the browser, and handed to a <track> as a blob. Every <track> this component
  // added is removed before adding the next one.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    v.querySelectorAll('track[data-openplay]').forEach(t => t.remove());
    disableAllTracks(v);

    if (!activeSub) return;

    let live = true;
    let objectUrl = null;

    const text = subTextRef.current.id === activeSub.id
      ? Promise.resolve(subTextRef.current.text)
      : activeSub.load().then(raw => {
          const vtt = toVtt(raw);
          subTextRef.current = { id: activeSub.id, text: vtt };
          return vtt;
        });

    text.then(vtt => {
      if (!live) return;

      objectUrl = URL.createObjectURL(new Blob([shiftVtt(vtt, offset)], { type: 'text/vtt' }));

      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = activeSub.label;
      track.srclang = activeSub.language || 'und';
      track.src = objectUrl;
      track.default = true;
      track.setAttribute('data-openplay', '');
      v.appendChild(track);

      // The TextTrack object only exists once the element is attached.
      requestAnimationFrame(() => showTrack(v, activeSub.label));
    }).catch(err => {
      if (!live) return;
      setSubNote(err?.message || 'That subtitle could not be loaded.');
      setActiveSub(null);
    });

    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeSub, offset]);

  // Caption size follows the picture, not the window: ~5% of its height.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const scale = SUB_SIZES.find(s => s.key === subStyle.size)?.scale ?? 1;
    const apply = () => {
      const h = v.clientHeight || 360;
      v.style.setProperty('--sub-size', `${Math.max(15, Math.round(h * 0.05 * scale))}px`);
    };
    v.style.setProperty('--sub-bg', subStyle.background ? 'rgba(8, 11, 15, 0.72)' : 'transparent');
    apply();

    const observer = new ResizeObserver(apply);
    observer.observe(v);
    return () => observer.disconnect();
  }, [subStyle]);

  // A failure note clears itself.
  useEffect(() => {
    if (!subNote) return;
    const timer = setTimeout(() => setSubNote(null), 7000);
    return () => clearTimeout(timer);
  }, [subNote]);

  const selectSub = sub => { setSubNote(null); setActiveSub(sub); };

  // `next` is a number, or a function of the current offset (so quick repeated
  // clicks each build on the last one instead of a stale render).
  const changeOffset = next => {
    setOffsets(prev => {
      const current = offsetFor(prev, fileUrl);
      const seconds = typeof next === 'function' ? next(current) : next;
      return withOffset(prev, fileUrl, Math.max(-60, Math.min(60, seconds)));
    });
  };

  const changeSubStyle = next => setSubStyle(saveSubStyle(next));

  const uploadSub = async file => {
    if (!/\.(srt|vtt)$/i.test(file.name)) { setSubNote('Only .srt and .vtt subtitle files can be shown here.'); return; }
    if (file.size > 2_500_000) { setSubNote('That file is too large to be a subtitle.'); return; }
    try {
      const vtt = toVtt(decodeSubtitle(await file.arrayBuffer()));
      selectSub({
        id: `upload:${file.name}:${file.size}`,
        kind: 'upload',
        label: file.name.replace(/\.[^.]+$/, ''),
        language: 'und',
        load: async () => vtt,
      });
    } catch {
      setSubNote('That file could not be read.');
    }
  };

  // ── Controls auto-hide ──
  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    if (playing) {
      hideTimer.current = setTimeout(() => { if (!menuOpenRef.current) setControlsVisible(false); }, 3000);
    }
  }, [playing]);

  // The controls stay up while the subtitle menu is open, and the countdown restarts when it closes.
  const onSubMenuOpen = useCallback(open => {
    menuOpenRef.current = open;
    if (open) { setControlsVisible(true); clearTimeout(hideTimer.current); } else { nudgeControls(); }
  }, [nudgeControls]);

  // Pausing must reveal the controls again; playing starts the hide countdown.
  useEffect(() => {
    if (!playing) {
      clearTimeout(hideTimer.current);
      return;
    }
    hideTimer.current = setTimeout(() => { if (!menuOpenRef.current) setControlsVisible(false); }, 3000);
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
      if (e.target.closest?.('[data-subtitle-menu]')) return;   // typing or tabbing inside the menu

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
        n: () => goNext(),
      };

      const handler = handlers[e.key] || handlers[e.key.toLowerCase()];
      if (handler) { e.preventDefault(); handler(); nudgeControls(); }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [togglePlay, seekBy, toggleFullscreen, nudgeControls, goNext]);

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
    || parseRelease(passedFile?.name || basename(fileUrl)).title
    || basename(fileUrl);

  const parsedName = parseRelease(passedFile?.name || basename(fileUrl));
  const episodeTag = parsedName.episode != null
    ? `${parsedName.season ? `S${String(parsedName.season).padStart(2, '0')}` : ''}E${String(parsedName.episode).padStart(2, '0')}`
    : null;

  // The side panel belongs to anything that is an episode of something.
  const isEpisode = parsedName.episode != null;
  const hasPanel = siblings.length > 1;
  const panelLoading = isEpisode && loadedFor !== fileUrl && !hasPanel;

  // Last stretch of an episode: offer the next one.
  const remaining = duration ? duration - time : Infinity;
  const showUpNext = !!next && autoplay && !skipped && remaining <= 20 && remaining > 0;

  // What to search OpenSubtitles for: the TMDB id when we have one, the title otherwise.
  const current = ordered.find(f => sameUrl(f.url, fileUrl));
  const subLookup = {
    type: meta?.type === 'tv' || parsedName.episode != null ? 'tv' : 'movie',
    tmdbId: meta?.id,
    season: parsedName.season ?? current?.season ?? (parsedName.episode != null ? 1 : undefined),
    episode: parsedName.episode ?? undefined,
    query: meta?.title || parsedName.title,
    year: parsedName.year || meta?.year,
  };

  const playedPct = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="page-enter px-5 sm:px-7 py-6">
      <div className="flex items-center gap-4 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="control flex items-center gap-2 px-3 h-10 text-sm flex-shrink-0"
          style={{ color: 'var(--text-soft)' }}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl sm:text-2xl leading-tight truncate">{title}</h1>
          {(episodeTag || meta?.year) && (
            <p className="data mt-0.5 truncate">
              {[episodeTag, meta?.year].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {hasPanel && !listOpen && (
          <button
            onClick={() => changeListOpen(true)}
            className="control flex items-center gap-2 px-3.5 h-10 text-sm flex-shrink-0"
            style={{ color: 'var(--text-soft)' }}
          >
            <PanelRightOpen size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Episodes</span>
          </button>
        )}

        {next && (
          <button
            onClick={goNext}
            className="control flex items-center gap-2 px-3.5 h-10 text-sm flex-shrink-0"
            style={{ color: 'var(--text-soft)' }}
          >
            <SkipForward size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Next episode</span>
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
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
            onMouseLeave={() => playing && !menuOpenRef.current && setControlsVisible(false)}
            style={{ cursor: controlsVisible ? 'default' : 'none' }}
          >
            <video
              ref={videoRef}
              className="w-full block"
              preload="auto"
              playsInline
              onClick={togglePlay}
            />

            {/* The grip is the drag source: dragging the video itself would fight the scrubber. */}
            <div
              className="absolute top-3 left-3 z-[3] transition-opacity duration-200"
              style={{ opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? 'auto' : 'none' }}
            >
              <span
                className="flex items-center gap-1.5 pl-1.5 pr-2.5 h-8 rounded-lg mono text-[10.5px] uppercase tracking-wider select-none"
                style={{
                  background: 'rgba(8,11,15,0.82)',
                  border: '1px solid var(--line-bright)',
                  color: 'var(--text-soft)',
                  cursor: 'grab',
                }}
                title="Drag onto VLC to play this file there"
                {...dragLinkProps(fileUrl, passedFile?.name || basename(fileUrl))}
              >
                <GripVertical size={14} aria-hidden="true" />
                Drag to VLC
              </span>
            </div>

            {subNote && (
              <div className="absolute top-3 right-3 z-[3] max-w-[70%]" role="status">
                <span className="chip chip-error" style={{ whiteSpace: 'normal', lineHeight: 1.35, padding: '6px 10px' }}>
                  {subNote}
                </span>
              </div>
            )}

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

            {showUpNext && (
              <div
                className="absolute right-4 bottom-24 z-[3] w-72 rounded-xl p-3.5"
                style={{
                  background: 'rgba(8,11,15,0.92)',
                  border: '1px solid var(--line-bright)',
                  backdropFilter: 'blur(8px)',
                }}
                role="status"
              >
                <p className="eyebrow">Up next · {Math.ceil(remaining)}s</p>
                <p className="text-sm font-semibold mt-1.5 truncate">
                  {episodeLabel(next)}
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={goNext} className="btn-accent flex-1 h-8 rounded-lg text-[13px]">
                    Play now
                  </button>
                  <button
                    onClick={() => setSkippedUrl(fileUrl)}
                    className="control flex-1 h-8 text-[13px]"
                    style={{ color: 'var(--text-soft)' }}
                  >
                    Cancel
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

                <SubtitleMenu
                  lookup={subLookup}
                  release={passedFile?.name || basename(fileUrl)}
                  local={subtitles}
                  active={activeSub}
                  onSelect={selectSub}
                  onUpload={uploadSub}
                  offset={offset}
                  onOffset={changeOffset}
                  style={subStyle}
                  onStyle={changeSubStyle}
                  onOpenChange={onSubMenuOpen}
                />

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
                    No <span className="mono">.srt</span> sits next to this file. Use the
                    subtitles button on the player to search OpenSubtitles or add a file.
                    Subtitles stored inside the video itself cannot be read by a browser.
                  </p>
                )}
                <p className="mt-1.5">Embedded subtitles and extra audio tracks work in VLC.</p>
              </Notice>
            </div>
          )}

          <p className="data mt-3">
            Space play · &larr; &rarr; 10s · &uarr; &darr; volume · M mute · F fullscreen · drag the grip onto VLC
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
              <h2 className="font-display text-2xl leading-tight mb-2">{title}</h2>
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

        {hasPanel && listOpen && (
          <aside
            className="lg:w-[360px] xl:w-[392px] flex-shrink-0 lg:sticky lg:top-20 lg:self-start"
            aria-label="Episodes"
          >
            <EpisodeList
              variant="panel"
              files={ordered}
              currentUrl={fileUrl}
              showMeta={meta}
              showTitle={title}
              progress={progressMap}
              autoplay={autoplay}
              onAutoplayChange={changeAutoplay}
              onHide={() => changeListOpen(false)}
            />
          </aside>
        )}

        {!hasPanel && panelLoading && listOpen && (
          <aside className="lg:w-[360px] xl:w-[392px] flex-shrink-0" aria-hidden="true">
            <div className="skeleton rounded-[14px]" style={{ height: 420 }} />
          </aside>
        )}
      </div>
    </div>
  );
}

function episodeLabel(file) {
  const tag = file.season != null && file.episode != null
    ? `S${String(file.season).padStart(2, '0')}E${String(file.episode).padStart(2, '0')}`
    : file.episode != null ? `E${String(file.episode).padStart(2, '0')}` : '';
  const name = episodeName(file.name) || parseRelease(file.name).title;
  return [tag, name].filter(Boolean).join(' · ');
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
