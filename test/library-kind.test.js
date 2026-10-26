import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([['libraries', JSON.stringify([
  { key: 'movies', label: 'Movies', url: 'http://h/Movies/', kind: 'movie' },
  { key: 'tv', label: 'TV', url: 'http://h/TV%20Series/', kind: 'tv' },
])]]);
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const { libraryKindFor } = await import('../src/lib/server.js');

test('a series folder is recognised as tv from its library', () => {
  assert.equal(libraryKindFor('http://h/TV%20Series/M%20-%20Z/Show/'), 'tv');
  assert.equal(libraryKindFor('http://h/TV Series/Show/Season 1/E01.mkv'), 'tv');   // decoded form
  assert.equal(libraryKindFor('http://h/Movies/(2025)/Film.mkv'), 'movie');
  assert.equal(libraryKindFor('http://elsewhere/x/'), null);
});
