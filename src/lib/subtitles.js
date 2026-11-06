// src/lib/subtitles.js
//
// The browser side of online subtitles: asking /api/subtitles, remembering what
// you prefer, and a few small helpers. The ranking and WebVTT logic is shared
// with the server (shared/subtitles.js).

import { apiUrl } from './api.js';
import { getItem, setItem } from './storage.js';
import { normalizeFileUrl } from './text.js';

export { toVtt, shiftVtt, rankSubtitles, decodeSubtitle } from '../../shared/subtitles.js';

/** Languages offered in the picker. Codes are OpenSubtitles' own. */
export const SUB_LANGUAGES = [
  { code: 'en',    label: 'English' },
  { code: 'bn',    label: 'Bengali' },
  { code: 'hi',    label: 'Hindi' },
  { code: 'ur',    label: 'Urdu' },
  { code: 'ta',    label: 'Tamil' },
  { code: 'te',    label: 'Telugu' },
  { code: 'ar',    label: 'Arabic' },
  { code: 'fa',    label: 'Persian' },
  { code: 'tr',    label: 'Turkish' },
  { code: 'es',    label: 'Spanish' },
  { code: 'fr',    label: 'French' },
  { code: 'de',    label: 'German' },
  { code: 'it',    label: 'Italian' },
  { code: 'pt-br', label: 'Portuguese (Brazil)' },
  { code: 'pt-pt', label: 'Portuguese (Portugal)' },
  { code: 'ru',    label: 'Russian' },
  { code: 'nl',    label: 'Dutch' },
  { code: 'pl',    label: 'Polish' },
  { code: 'id',    label: 'Indonesian' },
  { code: 'vi',    label: 'Vietnamese' },
  { code: 'th',    label: 'Thai' },
  { code: 'ja',    label: 'Japanese' },
  { code: 'ko',    label: 'Korean' },
  { code: 'zh-cn', label: 'Chinese (Simplified)' },
  { code: 'zh-tw', label: 'Chinese (Traditional)' },
];

export function languageLabel(code) {
  const hit = SUB_LANGUAGES.find(l => l.code === String(code).toLowerCase());
  return hit ? hit.label : String(code || '').toUpperCase();
}

/** An error from /api/subtitles with the server's stable `code` attached. */
export class SubtitleError extends Error {
  constructor(message, code = 'upstream') {
    super(message);
    this.code = code;
  }
}

async function readError(res) {
  const body = await res.json().catch(() => ({}));
  return new SubtitleError(body.detail || body.error || `Subtitles request failed (${res.status}).`, body.code || 'upstream');
}

// ── Is it set up? ────────────────────────────────────────────────────────

let configured = null;

/** Whether the server has an OpenSubtitles key. Cached for the session. */
export function subtitlesConfigured() {
  configured ||= fetch(apiUrl('/api/health'), { signal: AbortSignal.timeout(6000) })
    .then(r => r.json())
    .then(body => Boolean(body.subtitles))
    .catch(() => { configured = null; return false; });
  return configured;
}

// ── Search and download ──────────────────────────────────────────────────

/**
 * @param {{ type:'tv'|'movie', tmdbId?:number|string, season?:number, episode?:number,
 *           query?:string, year?:string, lang?:string }} q
 * @returns {Promise<Array>} normalised results (unranked)
 */
export async function searchOnline(q) {
  const params = new URLSearchParams({ search: '1', type: q.type === 'tv' ? 'tv' : 'movie' });
  for (const key of ['tmdbId', 'season', 'episode', 'query', 'year', 'lang']) {
    if (q[key] !== undefined && q[key] !== null && q[key] !== '') params.set(key, q[key]);
  }

  const res = await fetch(apiUrl(`/api/subtitles?${params}`), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw await readError(res);
  return (await res.json()).results || [];
}

/** One subtitle as WebVTT text. */
export async function fetchOnlineVtt(id) {
  const res = await fetch(apiUrl(`/api/subtitles?download=${encodeURIComponent(id)}`), {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw await readError(res);
  return res.text();
}

/** A subtitle file that sits beside the video, read through the proxy. */
export async function fetchProxiedText(url) {
  const res = await fetch(apiUrl(`/api/proxy?url=${encodeURIComponent(url)}`), {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new SubtitleError('That subtitle file could not be read.');
  return res.text();
}

// ── Preferences ──────────────────────────────────────────────────────────

export const getSubLang = () => getItem('subtitle_lang') || 'en';
export const setSubLang = code => setItem('subtitle_lang', code);

function readJson(key, fallback) {
  try { return JSON.parse(getItem(key) || '') ?? fallback; } catch { return fallback; }
}

const OFFSET_CAP = 150;

/** Timing offsets in seconds, remembered per file. */
export function readOffsets() {
  return readJson('subtitle_offsets', {});
}

export function offsetFor(offsets, fileUrl) {
  return offsets[normalizeFileUrl(fileUrl)] ?? 0;
}

export function withOffset(offsets, fileUrl, seconds) {
  const key = normalizeFileUrl(fileUrl);
  const next = { ...offsets };
  delete next[key];                                  // re-insert last = most recent
  if (seconds) next[key] = Math.round(seconds * 10) / 10;

  const keys = Object.keys(next);
  for (const old of keys.slice(0, Math.max(0, keys.length - OFFSET_CAP))) delete next[old];

  setItem('subtitle_offsets', JSON.stringify(next));
  return next;
}

export const SUB_SIZES = [
  { key: 's', label: 'Small',  scale: 0.8 },
  { key: 'm', label: 'Medium', scale: 1 },
  { key: 'l', label: 'Large',  scale: 1.35 },
];

const DEFAULT_STYLE = { size: 'm', background: true };

export const readSubStyle = () => ({ ...DEFAULT_STYLE, ...readJson('subtitle_style', {}) });
export const saveSubStyle = style => { setItem('subtitle_style', JSON.stringify(style)); return style; };

/** "+1.5 s", "-0.5 s", "In sync". */
export function describeOffset(seconds) {
  if (!seconds) return 'In sync';
  return `${seconds > 0 ? '+' : '−'}${Math.abs(seconds).toFixed(1)} s`;
}
