// src/lib/catalog.js
//
// The catalogue index: for every title on the server, what TMDB says about it
// (genres, rating, year, language). Filtering "Comedy, 7+, 2010s" across a
// 3,000-title library is only possible if that is known for all of them, not
// just the cards currently on screen.
//
// Built once in the background, kept in IndexedDB, topped up as the server
// changes. Filters then run locally and instantly.

import { getStore } from './catalog-store.js';
import { genreNames } from './genres.js';
import { fetchBrief } from './tmdb.js';
import { libraryIndex, libraryTitles, libraryKindFor } from './server.js';

const DAY = 86_400_000;
export const FOUND_TTL     = 60 * DAY;   // TMDB data barely changes
export const NOT_FOUND_TTL = 7 * DAY;    // a miss may be fixed by a better name or a TMDB update
const BATCH = 25;

/** Turn a server entry and TMDB's answer into one index record. */
export function makeRecord(file, library, kind, brief, now = Date.now()) {
  const base = {
    url: file.url,
    name: file.name,
    fileType: file.type === 'folder' ? 'folder' : 'video',
    library: library.key,
    kind,
    at: now,
  };

  if (!brief?.found) return { ...base, found: false };

  const year = Number(brief.year);
  return {
    ...base,
    found: true,
    tmdbId: brief.id,
    type: brief.type || kind,
    title: brief.title,
    year: Number.isFinite(year) && year > 0 ? year : null,
    rating: typeof brief.rating === 'number' ? brief.rating : null,
    votes: brief.votes || 0,
    language: brief.language || null,
    genres: genreNames(brief.genreIds, brief.type || kind),
    poster: brief.poster || null,
  };
}

/** Is an existing record still fresh enough to keep? */
export function isFresh(record, now = Date.now()) {
  if (!record) return false;
  return now - record.at < (record.found ? FOUND_TTL : NOT_FOUND_TTL);
}

/** Every title in every section of a library. */
export async function listAllTitles(library) {
  const index = await libraryIndex(library);
  if (index.error) throw new Error(index.error);

  const titles = [];
  // Sections are listed a few at a time: a library can have dozens of them.
  for (let i = 0; i < index.sections.length; i += 3) {
    const chunk = await Promise.all(
      index.sections.slice(i, i + 3).map(s => libraryTitles(s.url))
    );
    for (const c of chunk) titles.push(...c.titles);
  }
  return titles;
}

/**
 * Bring one library's index up to date.
 *
 * Titles with a fresh record are skipped, the rest are looked up a few at a
 * time, and records for titles that left the server are removed.
 *
 * @param {object} library
 * @param {object} [deps]  injectable for tests
 * @returns {Promise<{ total, done, matched, removed, cancelled }>}
 */
export async function indexLibrary(library, deps = {}) {
  const {
    store = getStore(),
    list = listAllTitles,
    lookup = fetchBrief,
    kindOf = url => libraryKindFor(url) || library.kind || 'movie',
    onProgress = () => {},
    signal,
    concurrency = 4,
    now = Date.now,
  } = deps;

  const titles = await list(library);
  const existing = new Map((await store.getLibrary(library.key)).map(r => [r.url, r]));

  const todo = titles.filter(t => !isFresh(existing.get(t.url), now()));
  const total = titles.length;
  let done = total - todo.length;
  let matched = [...existing.values()].filter(r => r.found).length;
  let cancelled = false;

  const emit = () => onProgress({ total, done, matched });
  emit();

  let buffer = [];
  const flush = async () => {
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    await store.putMany(batch);
  };

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      if (signal?.aborted) { cancelled = true; return; }
      const file = todo[next++];
      let brief;
      try {
        brief = await lookup(file.name, kindOf(file.url));
      } catch {
        // A network error is not "not on TMDB": leave it for the next run.
        done += 1;
        emit();
        continue;
      }
      const record = makeRecord(file, library, kindOf(file.url), brief, now());
      const had = existing.get(file.url);
      if (record.found && !had?.found) matched += 1;
      buffer.push(record);
      done += 1;
      if (buffer.length >= BATCH) await flush();
      emit();
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  await flush();
  if (signal?.aborted) cancelled = true;   // cancelled with nothing left to look up still counts

  // Only a complete pass knows what is gone from the server.
  let removed = 0;
  if (!cancelled) {
    const live = new Set(titles.map(t => t.url));
    const gone = [...existing.keys()].filter(url => !live.has(url));
    if (gone.length) await store.deleteMany(gone);
    removed = gone.length;
  }

  return { total, done, matched, removed, cancelled };
}

// ── Background manager ────────────────────────────────────────────────────
// One index job at a time, shared by every page, so moving between Movies and
// Series does not start duplicates and the progress survives navigation.

const jobs = new Map();            // library key -> { state, controller }
const listeners = new Set();
let version = 0;                   // bumped on every change, for useSyncExternalStore

const IDLE = { running: false, queued: false, total: 0, done: 0, matched: 0, error: null, finishedAt: 0 };

function setState(key, patch) {
  const job = jobs.get(key) || { state: IDLE, controller: null };
  jobs.set(key, { ...job, state: { ...job.state, ...patch } });
  version += 1;
  listeners.forEach(l => l());
}

export function subscribeCatalog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const catalogVersion = () => version;
export const indexState = key => jobs.get(key)?.state || IDLE;

/** Start (or continue) indexing a library in the background. No-op if already running. */
export function startIndexing(library, deps = {}, onSettled = () => {}) {
  const key = library.key;
  if (jobs.get(key)?.state.running) return;

  const controller = new AbortController();
  jobs.set(key, { state: { ...IDLE, running: true }, controller });
  setState(key, {});

  indexLibrary(library, {
    ...deps,
    signal: controller.signal,
    onProgress: p => setState(key, p),
  })
    .then(r => setState(key, { running: false, queued: false, error: null, finishedAt: r.cancelled ? 0 : Date.now() }))
    .catch(err => setState(key, { running: false, queued: false, error: err.message || 'Could not read this library' }))
    .finally(onSettled);
}

export function stopIndexing(key) {
  jobs.get(key)?.controller?.abort();
}

/** Forget one library's index (or all), so the next visit rebuilds it. */
export async function clearIndex(key, store = getStore()) {
  if (key) stopIndexing(key); else for (const k of jobs.keys()) stopIndexing(k);
  await store.clear(key);
  if (key) jobs.delete(key); else jobs.clear();
  version += 1;
  listeners.forEach(l => l());
}

const started = new Set();
const queue = [];            // { library, deps } waiting their turn
let active = null;           // { library, deps } being indexed now

function pump() {
  if (active || !queue.length) return;
  active = queue.shift();
  const { library, deps } = active;
  startIndexing(library, deps, () => { active = null; pump(); });
}

/**
 * Index a library once per page session; later visits reuse the stored index.
 * Jobs run one at a time. `priority` is for the library the person is looking
 * at: it jumps the queue and pauses (not cancels) whatever is running, which
 * resumes afterwards from where it stopped.
 */
export function ensureIndexed(library, deps = {}, { priority = false } = {}) {
  if (started.has(library.key)) {
    // Already known; a priority request still moves a queued job to the front.
    const i = queue.findIndex(q => q.library.key === library.key);
    if (priority && i > 0) queue.unshift(...queue.splice(i, 1));
    return;
  }
  started.add(library.key);
  setState(library.key, { queued: true });

  const entry = { library, deps };
  if (priority) {
    queue.unshift(entry);
    if (active && active.library.key !== library.key) {
      const paused = active;
      stopIndexing(paused.library.key);
      queue.push(paused);          // resumes after, skipping what is already stored
      started.add(paused.library.key);
    }
  } else {
    queue.push(entry);
  }
  pump();
}

/** Let the next visit rebuild: used by "Rebuild" in Settings. */
export function forgetStarted(key) {
  if (key) started.delete(key); else started.clear();
  if (!key) queue.length = 0;
}
