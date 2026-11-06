import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/lib/catalog-store.js';
import { makeRecord, isFresh, indexLibrary, FOUND_TTL, NOT_FOUND_TTL } from '../src/lib/catalog.js';
import { genreNames } from '../src/lib/genres.js';

const LIB = { key: 'movies-1', label: 'Movies', kind: 'movie', url: 'http://h/m/' };
const file = (name, type = 'folder') => ({ name, url: `http://h/m/${encodeURIComponent(name)}/`, type });

test('genre ids fold movie and series lists into one set of names', () => {
  assert.deepEqual(genreNames([35, 10749], 'movie'), ['Comedy', 'Romance']);
  assert.deepEqual(genreNames([10765, 18], 'tv'), ['Sci-Fi', 'Fantasy', 'Drama']);
  assert.deepEqual(genreNames([10759], 'tv'), ['Action', 'Adventure']);
  assert.deepEqual(genreNames([878], 'tv'), ['Sci-Fi']);        // movie id on a series still maps
  assert.deepEqual(genreNames([999999]), []);
  assert.deepEqual(genreNames([28, 28]), ['Action']);
});

test('makeRecord keeps what filters need and marks misses', () => {
  const hit = makeRecord(file('Heat (1995)'), LIB, 'movie',
    { found: true, id: 949, type: 'movie', title: 'Heat', year: '1995', rating: 7.9, votes: 9000,
      language: 'en', genreIds: [28, 80, 18], poster: 'p.jpg' }, 1000);
  assert.equal(hit.found, true);
  assert.equal(hit.year, 1995);
  assert.deepEqual(hit.genres, ['Action', 'Crime', 'Drama']);
  assert.equal(hit.language, 'en');

  const miss = makeRecord(file('zzz'), LIB, 'movie', { found: false }, 1000);
  assert.equal(miss.found, false);
  assert.equal(miss.rating, undefined);
});

test('records expire: hits after 60 days, misses after 7', () => {
  const now = 1_000_000_000_000;
  assert.ok(isFresh({ found: true,  at: now - FOUND_TTL + 1000 }, now));
  assert.ok(!isFresh({ found: true,  at: now - FOUND_TTL - 1000 }, now));
  assert.ok(isFresh({ found: false, at: now - NOT_FOUND_TTL + 1000 }, now));
  assert.ok(!isFresh({ found: false, at: now - NOT_FOUND_TTL - 1000 }, now));
  assert.ok(!isFresh(undefined, now));
});

const brief = (n, extra = {}) => ({ found: true, id: n, type: 'movie', title: `T${n}`, year: '2020', rating: 7, votes: 500, language: 'en', genreIds: [35], ...extra });

test('indexes every title, reports progress, and stores the records', async () => {
  const store = createMemoryStore();
  const titles = ['A', 'B', 'C', 'D', 'E'].map(n => file(n));
  const seen = [];

  const result = await indexLibrary(LIB, {
    store, list: async () => titles, kindOf: () => 'movie', concurrency: 2,
    lookup: async name => (name === 'C' ? { found: false } : brief(name.charCodeAt(0))),
    onProgress: p => seen.push(p.done),
  });

  assert.equal(result.total, 5);
  assert.equal(result.matched, 4);
  assert.equal(seen.at(-1), 5);
  const rows = await store.getLibrary(LIB.key);
  assert.equal(rows.length, 5);
  assert.equal(rows.find(r => r.name === 'C').found, false);
  assert.deepEqual(rows.find(r => r.name === 'A').genres, ['Comedy']);
});

test('a second run only looks up what is new or stale', async () => {
  const store = createMemoryStore();
  let calls = 0;
  const lookup = async () => { calls += 1; return brief(1); };
  const deps = { store, kindOf: () => 'movie', lookup };

  await indexLibrary(LIB, { ...deps, list: async () => [file('A'), file('B')] });
  assert.equal(calls, 2);

  await indexLibrary(LIB, { ...deps, list: async () => [file('A'), file('B'), file('C')] });
  assert.equal(calls, 3);   // only C
});

test('titles that left the server are removed, but only after a complete pass', async () => {
  const store = createMemoryStore();
  const deps = { store, kindOf: () => 'movie', lookup: async () => brief(1) };

  await indexLibrary(LIB, { ...deps, list: async () => [file('A'), file('B')] });
  const r = await indexLibrary(LIB, { ...deps, list: async () => [file('A')] });

  assert.equal(r.removed, 1);
  assert.deepEqual((await store.getLibrary(LIB.key)).map(x => x.name), ['A']);

  // cancelled run must not prune
  const ctl = new AbortController(); ctl.abort();
  const c = await indexLibrary(LIB, { ...deps, list: async () => [], signal: ctl.signal });
  assert.equal(c.removed, 0);
  assert.equal((await store.getLibrary(LIB.key)).length, 1);
});

test('a network error is retried next time, not stored as "not on TMDB"', async () => {
  const store = createMemoryStore();
  await indexLibrary(LIB, {
    store, list: async () => [file('A')], kindOf: () => 'movie',
    lookup: async () => { throw new Error('offline'); },
  });
  assert.equal((await store.getLibrary(LIB.key)).length, 0);
});

test('libraries do not mix in the store', async () => {
  const store = createMemoryStore();
  await indexLibrary(LIB, { store, list: async () => [file('A')], kindOf: () => 'movie', lookup: async () => brief(1) });
  await indexLibrary({ ...LIB, key: 'other' }, { store, list: async () => [file('B')], kindOf: () => 'movie', lookup: async () => brief(2) });
  assert.equal((await store.getLibrary('movies-1')).length, 1);
  assert.equal((await store.getLibrary('other')).length, 1);
  await store.clear('other');
  assert.equal((await store.getLibrary('other')).length, 0);
  assert.equal((await store.getLibrary('movies-1')).length, 1);
});

import { ensureIndexed, forgetStarted, indexState } from '../src/lib/catalog.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

test('one job at a time; the library on screen jumps the queue and pauses the rest', async () => {
  forgetStarted();
  const order = [];
  const mk = key => ({
    library: { key, kind: 'movie', url: `http://h/${key}/` },
    deps: {
      store: createMemoryStore(), kindOf: () => 'movie', concurrency: 1,
      list: async () => { order.push(key); await wait(15); return [file(`${key}1`), file(`${key}2`)]; },
      lookup: async () => { await wait(5); return brief(1); },
    },
  });
  const A = mk('qa'), B = mk('qb'), C = mk('qc');

  ensureIndexed(A.library, A.deps);
  ensureIndexed(B.library, B.deps);
  assert.equal(indexState('qb').queued, true);          // B waits behind A

  ensureIndexed(C.library, C.deps, { priority: true });  // C pauses A and goes next
  await wait(400);

  assert.deepEqual(order, ['qa', 'qc', 'qb', 'qa']);     // A resumes last
  assert.equal(indexState('qa').running, false);
  assert.equal(indexState('qc').running, false);
});
