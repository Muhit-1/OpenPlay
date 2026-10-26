import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Stand-in for the browser; Firebase is unconfigured here, so the local path runs.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
beforeEach(() => store.clear());

const fb = await import('../src/lib/firebase.js');

test('firebase is off without config', () => {
  assert.equal(fb.firebaseReady, false);
});

test('progress is saved and read back locally, newest first', async () => {
  await fb.saveProgress('http://h/a.mkv', 'A', null, 61.9, 100);
  await fb.saveProgress('http://h/b.mkv', 'B', null, 10, 100);
  await fb.saveProgress('http://h/a.mkv', 'A', null, 70, 100);

  assert.equal(await fb.getProgress('http://h/a.mkv'), 70);
  assert.equal(await fb.getProgress('http://h/missing.mkv'), 0);
  assert.deepEqual((await fb.getContinueWatching()).map(e => e.title), ['A', 'B']);
});

test('bookmarks add, check and remove', async () => {
  await fb.addBookmark('http://h/a.mkv', 'A', 'p.jpg');
  assert.equal(await fb.isBookmarked('http://h/a.mkv'), true);
  assert.equal((await fb.getBookmarks())[0].poster, 'p.jpg');

  await fb.removeBookmark('http://h/a.mkv');
  assert.equal(await fb.isBookmarked('http://h/a.mkv'), false);
});
