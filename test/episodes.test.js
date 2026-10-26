import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonFromFolderName, parentUrl, orderEpisodes, nextEpisode, sameUrl } from '../src/lib/episodes.js';

test('reads a season number from a folder name', () => {
  assert.equal(seasonFromFolderName('Season 2'), 2);
  assert.equal(seasonFromFolderName('Season.03'), 3);
  assert.equal(seasonFromFolderName('S4'), 4);
  assert.equal(seasonFromFolderName('Extras'), null);
  assert.equal(seasonFromFolderName('Sherlock'), null);
});

test('parentUrl keeps the trailing slash', () => {
  assert.equal(parentUrl('http://h/Show/Season%201/e.mkv'), 'http://h/Show/Season%201/');
  assert.equal(parentUrl('http://h/Show/Season%201/'), 'http://h/Show/');
});

const f = (name, seasonHint) => ({ name, url: 'http://h/' + name, seasonHint });

test('orders by season then episode, using folder hints for bare names', () => {
  const ordered = orderEpisodes([
    f('Show.S02E01.mkv'), f('E02.mkv', 1), f('E01.mkv', 1), f('Show.S01E10.mkv'), f('Show.S01E03.mkv'),
  ]);
  assert.deepEqual(ordered.map(x => x.name), [
    'E01.mkv', 'E02.mkv', 'Show.S01E03.mkv', 'Show.S01E10.mkv', 'Show.S02E01.mkv',
  ]);
});

test('nextEpisode walks across seasons and stops at the end', () => {
  const ordered = orderEpisodes([f('Show.S01E01.mkv'), f('Show.S02E01.mkv')]);
  assert.equal(nextEpisode(ordered, ordered[0].url).name, 'Show.S02E01.mkv');
  assert.equal(nextEpisode(ordered, ordered[1].url), null);
  assert.equal(nextEpisode(ordered, 'http://nope'), null);
});

test('matches a decoded url against its %20-encoded twin', () => {
  assert.ok(sameUrl('http://h/Season 1/e.mkv', 'http://h/Season%201/e.mkv'));
  assert.ok(!sameUrl('http://h/a.mkv', 'http://h/b.mkv'));
  const ordered = orderEpisodes([{ name: 'Show.S01E01.mkv', url: 'http://h/Season%201/Show.S01E01.mkv' },
                                 { name: 'Show.S01E02.mkv', url: 'http://h/Season%201/Show.S01E02.mkv' }]);
  assert.equal(nextEpisode(ordered, 'http://h/Season 1/Show.S01E01.mkv').name, 'Show.S01E02.mkv');
});
