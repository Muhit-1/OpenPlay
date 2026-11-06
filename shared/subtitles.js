// shared/subtitles.js
//
// Subtitle logic used by both the API (api/subtitles.js, api/proxy.js) and the
// browser (the player). Pure functions only — no network, no DOM — so it is all
// unit-tested.

const TIMING = /^(\s*)((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})(\s*-->\s*)((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})(.*)$/;

/** "01:02:03,456" | "02:03.4" -> milliseconds. */
function toMs(stamp) {
  const [clock, fraction = '0'] = stamp.replace(',', '.').split('.');
  const parts = clock.split(':').map(Number);
  while (parts.length < 3) parts.unshift(0);
  const [h, m, s] = parts;
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
  return ((h * 60 + m) * 60 + s) * 1000 + ms;
}

/** milliseconds -> "HH:MM:SS.mmm" (WebVTT). */
function fromMs(total) {
  const ms = Math.max(0, Math.round(total));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** Subtitle files are old; many are not UTF-8. Try UTF-8, fall back to Windows-1252. */
export function decodeSubtitle(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** Convert SubRip to WebVTT. Browsers only accept VTT in a <track>. */
export function srtToVtt(srt) {
  const body = String(srt)
    .replace(/^\uFEFF/, '')          // strip BOM
    .replace(/\r\n|\r/g, '\n')       // normalise line endings
    // 00:00:01,234 -> 00:00:01.234, on timing lines only (dialogue may contain commas)
    .split('\n')
    .map(line => (line.includes('-->') ? line.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2') : line))
    .join('\n');

  return 'WEBVTT\n\n' + body.trim() + '\n';
}

/** Accept SRT or VTT text from a file the user picked. Returns WebVTT. */
export function toVtt(text) {
  const clean = String(text).replace(/^\uFEFF/, '');
  return /^WEBVTT/.test(clean.trimStart()) ? clean : srtToVtt(clean);
}

/**
 * Move every cue by `seconds` (negative = earlier). Subtitles written for a
 * different release often run a little early or late; this is the fix.
 */
export function shiftVtt(vtt, seconds) {
  const delta = Math.round(Number(seconds) * 1000);
  if (!delta) return vtt;

  return String(vtt).split('\n').map(line => {
    const m = line.match(TIMING);
    if (!m) return line;
    const [, lead, start, arrow, end, rest] = m;
    return `${lead}${fromMs(toMs(start) + delta)}${arrow}${fromMs(toMs(end) + delta)}${rest}`;
  }).join('\n');
}

// ── OpenSubtitles results ────────────────────────────────────────────────

/** Flatten OpenSubtitles' API v1 `data` array into what the UI needs. */
export function normalizeResults(data) {
  if (!Array.isArray(data)) return [];

  return data.flatMap(entry => {
    const a = entry?.attributes || {};
    const file = Array.isArray(a.files) ? a.files[0] : null;
    if (!file?.file_id) return [];

    return [{
      id: String(file.file_id),
      language: String(a.language || '').toLowerCase(),
      release: a.release || file.file_name || '',
      fileName: file.file_name || '',
      downloads: Number(a.download_count) || 0,
      hearingImpaired: Boolean(a.hearing_impaired),
      trusted: Boolean(a.from_trusted),
      aiTranslated: Boolean(a.ai_translated),
      machineTranslated: Boolean(a.machine_translated),
      fps: a.fps ? Number(a.fps) : null,
      rating: a.ratings ? Number(a.ratings) : null,
      uploader: a.uploader?.name || '',
      uploadedAt: a.upload_date || null,
    }];
  });
}

const TAG_WEIGHTS = new Map([
  // resolution
  ...['2160p', '1080p', '720p', '480p', '4k'].map(t => [t, 2]),
  // source
  ...['webrip', 'webdl', 'web', 'bluray', 'brrip', 'bdrip', 'hdtv', 'dvdrip', 'remux',
      'amzn', 'nf', 'dsnp', 'atvp', 'hmax', 'hulu'].map(t => [t, 2]),
  // codec
  ...['x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid'].map(t => [t, 1]),
]);

const GROUP_WEIGHT = 3;

function tokens(name) {
  return String(name || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '')
    .replace(/web[\s._-]?dl/g, 'webdl').replace(/web[\s._-]?rip/g, 'webrip')
    .replace(/blu[\s._-]?ray/g, 'bluray')
    .split(/[^a-z0-9]+/).filter(Boolean);
}

/** The release group: the last token after a hyphen, e.g. "…x265-Silence". */
function groupOf(name) {
  const base = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/\)\s*$/, '');
  const m = base.match(/[-\s]([A-Za-z0-9]{2,15})\s*$/);
  return m ? m[1].toLowerCase() : null;
}

/** How closely a subtitle's release name matches the file's, 0–1. */
export function releaseMatch(fileName, subtitleRelease) {
  const want = new Set(tokens(fileName));
  const have = new Set(tokens(subtitleRelease));
  const group = groupOf(fileName);

  let total = 0, hit = 0;
  for (const t of want) {
    const w = TAG_WEIGHTS.get(t);
    if (!w) continue;
    total += w;
    if (have.has(t)) hit += w;
  }
  if (group && !TAG_WEIGHTS.has(group)) {
    total += GROUP_WEIGHT;
    if (have.has(group)) hit += GROUP_WEIGHT;
  }
  return total ? hit / total : 0;
}

/**
 * Order results best-first for this file.
 *
 * Release match dominates (a subtitle cut for your exact release is in sync);
 * trusted uploaders and popularity break ties; hearing-impaired and machine
 * translated tracks sink unless asked for.
 *
 * @param {Array} results   from normalizeResults
 * @param {{ release?: string, languages?: string[], hearingImpaired?: boolean }} wanted
 */
export function rankSubtitles(results, { release = '', languages = [], hearingImpaired = false } = {}) {
  const preferred = languages.map(l => l.toLowerCase());

  const scored = results.map(r => {
    const match = releaseMatch(release, r.release);
    const langIndex = preferred.indexOf(r.language);
    let score = match * 3;
    score += langIndex >= 0 ? 1 - langIndex * 0.1 : 0;
    score += r.trusted ? 0.4 : 0;
    score += Math.log10(1 + r.downloads) / 6;
    if (r.hearingImpaired && !hearingImpaired) score -= 0.5;
    if (r.aiTranslated) score -= 0.7;
    if (r.machineTranslated) score -= 1;
    return { ...r, match, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Flag the single best pick per language.
  const seen = new Set();
  return scored.map(r => {
    const best = !seen.has(r.language);
    seen.add(r.language);
    return { ...r, best };
  });
}
