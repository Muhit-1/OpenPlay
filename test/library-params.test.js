import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readView, patchParams, scrollKey } from '../src/lib/libraryParams.js';
import { titleHref } from '../src/lib/titleLink.js';

const P = s => new URLSearchParams(s);

test('an empty address is the default view', () => {
  const v = readView(P(''));
  assert.deepEqual([v.filter, v.sort, v.genre, v.minRating, v.year, v.language, v.page, v.item],
                   ['', 'server', null, 0, 'all', null, 1, null]);
  assert.equal(v.quals.size, 0);
});

test('every part of the view round-trips through the address', () => {
  let p = P('lib=tv');
  p = patchParams(p, { g: 'Comedy', r: 8, y: '2010s', l: 'en', sort: 'top', q: 'office', qual: new Set(['1080p', '4K']) });
  p = patchParams(p, { p: 3 });

  const v = readView(P(p.toString()));            // as if reloaded from the URL
  assert.equal(v.genre, 'Comedy');
  assert.equal(v.minRating, 8);
  assert.equal(v.year, '2010s');
  assert.equal(v.language, 'en');
  assert.equal(v.sort, 'top');
  assert.equal(v.filter, 'office');
  assert.deepEqual([...v.quals].sort(), ['1080p', '4K']);
  assert.equal(v.page, 3);
  assert.equal(p.get('lib'), 'tv');               // untouched keys survive
});

test('defaults and empties are removed, keeping addresses short', () => {
  let p = patchParams(P(''), { g: 'Comedy', r: 7, y: '2000s', sort: 'az', p: 2 });
  p = patchParams(p, { g: null, r: 0, y: 'all', sort: 'server', p: 1 });
  assert.equal(p.toString(), '');
});

test('changing the list goes back to page 1; changing the page or item does not', () => {
  const p3 = P('p=3&g=Comedy');
  assert.equal(patchParams(p3, { g: 'Horror' }).get('p'), null);
  assert.equal(patchParams(p3, { q: 'x' }).get('p'), null);
  assert.equal(patchParams(p3, { item: 'http://h/a/' }).get('p'), '3');
  assert.equal(patchParams(p3, { p: 4 }).get('p'), '4');
});

test('garbage in the address falls back to defaults', () => {
  const v = readView(P('sort=hax&r=abc&p=-5&qual=,,&y=&g='));
  assert.equal(v.sort, 'server');
  assert.equal(v.minRating, 0);
  assert.equal(v.page, 1);
  assert.equal(v.quals.size, 0);
  assert.equal(v.genre, null);
});

test('scroll position is remembered per view, not per open item', () => {
  const a = scrollKey('/series', P('g=Comedy&r=8'));
  assert.equal(a, scrollKey('/series', P('r=8&g=Comedy')));                 // order does not matter
  assert.equal(a, scrollKey('/series', P('g=Comedy&r=8&item=http%3A%2F%2Fh%2Fx')));
  assert.notEqual(a, scrollKey('/series', P('g=Horror&r=8')));
  assert.notEqual(a, scrollKey('/movies', P('g=Comedy&r=8')));
});

test('a title links to its info page, else the player, else its folder', () => {
  const file = { url: 'http://h/Show/', name: 'Show', type: 'folder' };
  assert.deepEqual(titleHref(file, { id: 7, type: 'tv' }, null), { pathname: '/detail/7', search: '?type=tv' });
  assert.equal(titleHref(file, { id: 7, type: 'movie' }, null).search, '?type=movie');

  const w = titleHref(file, null, 'http://h/Show/e1.mkv');
  assert.equal(w.pathname, `/watch/${encodeURIComponent('http://h/Show/e1.mkv')}`);
  assert.equal(w.state.file.url, 'http://h/Show/e1.mkv');

  assert.deepEqual(titleHref(file, null, null), { pathname: '/browse', search: `?url=${encodeURIComponent('http://h/Show/')}` });
});
