// src/components/SubtitleMenu.jsx
//
// The player's subtitle control: turn them off, pick one that sits beside the
// file, search OpenSubtitles in your language, or add a file of your own. Also
// nudges timing when a subtitle runs early or late, and sets how captions look.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Captions, Check, Minus, Plus, Upload, Search, AlertTriangle, RotateCcw, ShieldCheck,
} from 'lucide-react';
import { Switch } from './FilterMenu';
import { useAsync } from '../lib/useAsync';
import {
  SUB_LANGUAGES, SUB_SIZES, languageLabel, subtitlesConfigured, searchOnline, fetchOnlineVtt,
  rankSubtitles, getSubLang, setSubLang, describeOffset,
} from '../lib/subtitles';

const STEP = 0.5;

/**
 * @param {{ type, tmdbId, season, episode, query, year }} lookup  what to search for
 * @param {string}   release   this file's name, used to pick the closest subtitle
 * @param {Array}    local     subtitles that sit beside the video
 * @param {object}   active    the subtitle in use, or null
 * @param {(sub:object|null)=>void} onSelect
 * @param {(file:File)=>void}       onUpload
 * @param {number}   offset    seconds
 * @param {(next:number|((current:number)=>number))=>void}  onOffset
 * @param {{size:string, background:boolean}} style
 * @param {(style:object)=>void}    onStyle
 * @param {(open:boolean)=>void}    onOpenChange
 */
export default function SubtitleMenu({
  lookup, release, local = [], active, onSelect, onUpload,
  offset, onOffset, style, onStyle, onOpenChange,
}) {
  const [open, setOpenState] = useState(false);
  const [lang, setLang] = useState(getSubLang);
  const [place, setPlace] = useState(null);
  const root = useRef(null);
  const button = useRef(null);
  const fileInput = useRef(null);

  const setOpen = value => {
    // The menu is anchored to the viewport, not the player frame, so it can use
    // all the room above the button however short the frame is.
    if (value && button.current) {
      const r = button.current.getBoundingClientRect();
      setPlace({
        bottom: window.innerHeight - r.top + 10,
        right: Math.max(12, window.innerWidth - r.right - 8),
        // Stay clear of the sticky top bar (64px) above the player.
        maxHeight: Math.max(240, Math.min(560, r.top - 90)),
      });
    }
    setOpenState(value);
    onOpenChange?.(value);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!root.current?.contains(e.target)) { setOpenState(false); onOpenChange?.(false); } };
    const onKey = e => { if (e.key === 'Escape') { setOpenState(false); onOpenChange?.(false); } };
    const onMove = () => { setOpenState(false); onOpenChange?.(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
    };
  }, [open, onOpenChange]);

  // Only ask the server once the menu is opened.
  const { data: configured } = useAsync(open ? 'sub-configured' : null, subtitlesConfigured, null);

  const searchKey = open && configured
    ? [lookup.type, lookup.tmdbId, lookup.season, lookup.episode, lookup.query, lookup.year, lang].join('|')
    : null;

  const { data: found, error, loading } = useAsync(
    searchKey,
    () => searchOnline({ ...lookup, lang }),
    []
  );

  const ranked = useMemo(
    () => rankSubtitles(found, { release, languages: [lang] }).slice(0, 14),
    [found, release, lang]
  );

  const changeLang = code => { setLang(code); setSubLang(code); };

  const pickOnline = r => {
    onSelect({
      id: `os:${r.id}`,
      kind: 'online',
      label: `${languageLabel(r.language)}`,
      language: r.language,
      detail: r.release,
      load: () => fetchOnlineVtt(r.id),
    });
  };

  const onFile = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onUpload(file);
  };

  const sizeIndex = Math.max(0, SUB_SIZES.findIndex(s => s.key === style.size));

  return (
    <div ref={root} className="relative" data-subtitle-menu>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Subtitles"
        title="Subtitles"
        className="player-btn p-2 relative"
        style={{ color: active ? 'var(--accent)' : 'var(--text)' }}
      >
        <Captions size={17} aria-hidden="true" />
        {active && (
          <span
            className="absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--accent)' }}
            aria-hidden="true"
          />
        )}
      </button>

      {open && place && (
        <div
          role="dialog"
          aria-label="Subtitles"
          className="sub-menu"
          style={{ bottom: place.bottom, right: place.right, maxHeight: place.maxHeight }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sub-menu-scroll">
            <Option selected={!active} onClick={() => onSelect(null)}>Off</Option>

            {local.length > 0 && (
              <>
                <p className="sub-label">On your server</p>
                {local.map(s => (
                  <Option key={s.id} selected={active?.id === s.id} onClick={() => onSelect(s)}>
                    {s.label}
                  </Option>
                ))}
              </>
            )}

            {active?.kind === 'upload' && (
              <>
                <p className="sub-label">From your computer</p>
                <Option selected onClick={() => onSelect(active)}>{active.label}</Option>
              </>
            )}

            <div className="sub-label flex items-center justify-between gap-3" style={{ marginTop: 14 }}>
              <span>OpenSubtitles</span>
              <select
                value={lang}
                onChange={e => changeLang(e.target.value)}
                aria-label="Subtitle language"
                className="sub-select"
              >
                {SUB_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code} style={{ background: 'var(--ink-800)' }}>{l.label}</option>
                ))}
              </select>
            </div>

            <OnlineResults
              configured={configured}
              loading={loading || (open && configured === null)}
              error={error}
              ranked={ranked}
              activeId={active?.id}
              onPick={pickOnline}
              lang={lang}
            />
          </div>

          <div className="sub-section" style={{ padding: '12px 16px' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium">Timing</p>
                <p className="data" style={{ textTransform: 'none' }}>
                  {active ? describeOffset(offset) : 'Pick a subtitle first'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="control sub-step"
                  disabled={!active}
                  onClick={() => onOffset(o => o - STEP)}
                  aria-label="Show subtitles half a second earlier"
                  title="Earlier"
                >
                  <Minus size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="control sub-step"
                  disabled={!active}
                  onClick={() => onOffset(o => o + STEP)}
                  aria-label="Show subtitles half a second later"
                  title="Later"
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="control sub-step"
                  disabled={!active || !offset}
                  onClick={() => onOffset(0)}
                  aria-label="Reset timing"
                  title="Reset"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-[13.5px] font-medium">Size</p>
              <div className="segmented" role="radiogroup" aria-label="Subtitle size">
                {SUB_SIZES.map((s, i) => (
                  <button
                    key={s.key}
                    role="radio"
                    aria-checked={i === sizeIndex}
                    aria-selected={i === sizeIndex}
                    onClick={() => onStyle({ ...style, size: s.key })}
                    style={{ height: 28, padding: '0 11px', fontSize: 13 }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <Switch checked={style.background} onChange={on => onStyle({ ...style, background: on })}>
                Dark background
              </Switch>
            </div>
          </div>

          <div className="sub-section" style={{ padding: 8 }}>
            <button type="button" className="sub-add" onClick={() => fileInput.current?.click()}>
              <Upload size={15} aria-hidden="true" />
              Add a subtitle file
              <span className="data" style={{ marginLeft: 'auto', textTransform: 'none' }}>.srt .vtt</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".srt,.vtt,text/vtt"
              className="sr-only"
              onChange={onFile}
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OnlineResults({ configured, loading, error, ranked, activeId, onPick, lang }) {
  if (configured === false) {
    return (
      <Note icon={<AlertTriangle size={15} />} title="Online subtitles are not set up">
        Add <span className="mono">OPENSUBTITLES_API_KEY</span> to <span className="mono">.env</span> and
        restart OpenPlay.
      </Note>
    );
  }

  if (loading) {
    return (
      <div className="space-y-1.5 px-1 pt-1" aria-label="Searching" role="status">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-11 rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Note icon={<AlertTriangle size={15} />} title={noteTitle(error.code)}>
        {error.message}
      </Note>
    );
  }

  if (ranked.length === 0) {
    return (
      <Note icon={<Search size={15} />} title={`No ${languageLabel(lang)} subtitles found`}>
        Try another language, or add a file of your own.
      </Note>
    );
  }

  return (
    <div role="listbox" aria-label="Subtitle results" className="reveal-list">
      {ranked.map((r, i) => {
        const id = `os:${r.id}`;
        return (
          <button
            key={r.id}
            type="button"
            role="option"
            aria-selected={activeId === id}
            onClick={() => onPick(r)}
            className="sub-result"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] truncate" style={{ color: activeId === id ? 'var(--text)' : 'var(--text-soft)', fontWeight: activeId === id ? 600 : 400 }}>
                {r.release || r.fileName}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 mt-1">
                {i === 0 && <span className="sub-badge sub-badge-accent">Best match</span>}
                {i !== 0 && r.match >= 0.7 && <span className="sub-badge sub-badge-accent">Same release</span>}
                {r.trusted && <span className="sub-badge"><ShieldCheck size={10} aria-hidden="true" />Trusted</span>}
                {r.hearingImpaired && <span className="sub-badge">Hearing impaired</span>}
                {(r.aiTranslated || r.machineTranslated) && <span className="sub-badge">Machine translated</span>}
                <span className="data" style={{ textTransform: 'none' }}>{compact(r.downloads)} downloads</span>
              </span>
            </span>
            {activeId === id && <Check size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function noteTitle(code) {
  switch (code) {
    case 'quota':    return 'Daily download limit reached';
    case 'bad_key':  return 'OpenSubtitles rejected the key';
    case 'rate':     return 'Too many requests';
    default:         return 'Could not reach OpenSubtitles';
  }
}

function Note({ icon, title, children }) {
  return (
    <div className="sub-note" role="status">
      <span style={{ color: 'var(--text-dim)', marginTop: 2 }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium">{title}</p>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-dim)' }}>{children}</p>
      </div>
    </div>
  );
}

function Option({ selected, onClick, children }) {
  return (
    <button type="button" role="option" aria-selected={selected} onClick={onClick} className="sub-option">
      <span className="flex-1 min-w-0 truncate text-left">{children}</span>
      {selected && <Check size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />}
    </button>
  );
}

/** 1250 -> "1.3k" */
function compact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

