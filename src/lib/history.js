// src/lib/history.js
//
// Watch history is stored one row per file, so a show you binged shows up as
// twenty rows. These helpers turn that into what a person thinks in: one entry
// per show (or film), with the latest episode in front.

import { parseRelease } from './release.js';
import { libraryCategoryFor } from './server.js';
import { basename, normalizeFileUrl } from './text.js';

/** An entry counts as finished past this fraction of its runtime. */
export const FINISHED = 0.95;

export const KINDS = ['all', 'movie', 'series', 'animation'];

export const KIND_LABELS = {
  all: 'All',
  movie: 'Movies',
  series: 'Series',
  animation: 'Animation',
};

/** Fraction watched, 0–1. */
export function progressOf(item) {
  return item.durationSeconds > 0
    ? Math.min(1, Math.max(0, item.progressSeconds / item.durationSeconds))
    : 0;
}

export function isFinished(item) {
  return progressOf(item) >= FINISHED;
}

/** Milliseconds since epoch, whichever shape the store gave the timestamp. */
export function watchedMs(item) {
  const w = item?.watchedAt;
  if (typeof w === 'number') return w;
  if (w && typeof w.toMillis === 'function') return w.toMillis();
  if (w && typeof w.seconds === 'number') return w.seconds * 1000;
  return 0;
}

/** 'movie' | 'series' | 'animation' for a history row. */
export function kindOf(item) {
  const name = item.title || basename(item.fileUrl);
  const parsed = parseRelease(name);
  const category = libraryCategoryFor(item.fileUrl);

  if (category === 'animation') return 'animation';
  if (parsed.episode != null || parsed.season != null || category === 'series') return 'series';
  return 'movie';
}

/** "S01E15" for a release name, or null. */
export function episodeTag(name) {
  const p = parseRelease(name);
  if (p.episode == null) return null;
  const season = p.season != null ? `S${String(p.season).padStart(2, '0')}` : '';
  return `${season}E${String(p.episode).padStart(2, '0')}`;
}

const EPISODE_TOKEN = /\bs\d{1,2}[\s._-]?e\d{1,3}\b|\b\d{1,2}x\d{2}\b/i;
const RELEASE_TAIL = /[([]|\b(2160p|1440p|1080[pi]|720p|576p|480p|web-?dl|web-?rip|amzn|nf|blu-?ray|hdtv|x26[45]|hevc)\b/i;

/** The episode's own title from a release name, or '' when it has none. */
export function episodeName(name) {
  const text = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '');
  const hit = text.match(EPISODE_TOKEN);
  if (!hit) return '';

  let rest = text.slice(hit.index + hit[0].length);
  if (!/\s/.test(rest.trim())) rest = rest.replace(/[._]+/g, ' ');

  const tail = rest.search(RELEASE_TAIL);
  if (tail >= 0) rest = rest.slice(0, tail);

  return rest.replace(/^[\s._-]+|[\s._-]+$/g, '').replace(/\s{2,}/g, ' ');
}

/**
 * Group newest-first history into one entry per series; films stay one each.
 *
 * @param {Array} items  history rows, newest first
 * @param {{ hideFinished?: boolean, group?: boolean }} [options]  `group: false` keeps every row separate
 * @returns {Array<{ key, kind, show, lead, others }>}  newest first
 */
export function groupHistory(items, { hideFinished = false, group: merge = true } = {}) {
  const groups = [];
  const bySeries = new Map();
  const seenFiles = new Set();

  for (const item of items) {
    // The same file can be stored twice under different spellings of its URL
    // (older rows were saved decoded). Newest first, so the first one wins.
    const file = normalizeFileUrl(item.fileUrl);
    if (seenFiles.has(file)) continue;
    seenFiles.add(file);

    if (hideFinished && isFinished(item)) continue;

    const name = item.title || basename(item.fileUrl);
    const kind = kindOf(item);
    const show = parseRelease(name).title || name;
    const isSeries = kind !== 'movie' && episodeTag(name) !== null;

    if (isSeries && merge) {
      const key = `${kind}|${show.toLowerCase()}`;
      const existing = bySeries.get(key);
      if (existing) { existing.others.push(item); continue; }

      const group = { key, kind, show, lead: item, others: [] };
      bySeries.set(key, group);
      groups.push(group);
    } else {
      groups.push({ key: item.fileUrl, kind, show, lead: item, others: [] });
    }
  }

  return groups;
}

/** A coarse bucket for the day headings. */
export function dayBucket(ms, now = Date.now()) {
  if (!ms) return 'Earlier';
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

/** "21 min left", "1 h 04 min left", or '' when the length is unknown. */
export function timeLeft(item) {
  if (!(item.durationSeconds > 0)) return '';
  const mins = Math.max(1, Math.round((item.durationSeconds - item.progressSeconds) / 60));
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min left`;
}

/** 0:10, 21:37, 1:04:36 */
export function formatClock(secs) {
  if (!secs || !Number.isFinite(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
