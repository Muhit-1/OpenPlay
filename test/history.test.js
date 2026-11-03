import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupHistory, episodeName, episodeTag, dayBucket, watchedMs, isFinished,
} from '../src/lib/history.js';

const row = (title, extra = {}) => ({
  fileUrl: `http://h/${encodeURIComponent(title)}`,
  title,
  progressSeconds: 10,
  durationSeconds: 1000,
  ...extra,
});

const E = n => row(`30 Rock (2006) - S01E${String(n).padStart(2, '0')} - Ep ${n} (1080p AMZN WEBRip x265 Silence).mkv`);

test('episodes of one show collapse into a single entry, newest in front', () => {
  const groups = groupHistory([E(15), E(14), E(12)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].show, '30 Rock');
  assert.equal(groups[0].lead.title, E(15).title);
  assert.equal(groups[0].others.length, 2);
});

test('films are never merged with each other', () => {
  const groups = groupHistory([
    row('Mercy (2026) 1080p AMZN-WEB x265.mkv'),
    row('Apex (2026) 1080p NF-WEB x265.mkv'),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every(g => g.kind === 'movie' && g.others.length === 0));
});

test('different shows stay separate and keep recency order', () => {
  const groups = groupHistory([E(2), row('Breaking Bad (2008) - S02E04 - Down (1080p).mkv'), E(1)]);
  assert.deepEqual(groups.map(g => g.show), ['30 Rock', 'Breaking Bad']);
  assert.equal(groups[0].others.length, 1);
});

test('hideFinished drops completed episodes before grouping', () => {
  const done = { ...E(3), progressSeconds: 990 };
  assert.equal(isFinished(done), true);
  const groups = groupHistory([done, E(2)], { hideFinished: true });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].lead.title, E(2).title);
});

test('pulls the episode title out of a release name', () => {
  assert.equal(
    episodeName('30 Rock (2006) - S01E15 - Hard Ball (1080p AMZN WEBRip x265 Silence).mkv'),
    'Hard Ball'
  );
  assert.equal(episodeName('Show.S02E03.The.Thing.1080p.WEB-DL.mkv'), 'The Thing');
  assert.equal(episodeName('Mercy (2026) 1080p.mkv'), '');
  assert.equal(episodeTag('Show.S02E03.mkv'), 'S02E03');
  assert.equal(episodeTag('Mercy (2026).mkv'), null);
});

test('timestamps from either store are understood', () => {
  assert.equal(watchedMs({ watchedAt: 5000 }), 5000);
  assert.equal(watchedMs({ watchedAt: { toMillis: () => 7000 } }), 7000);
  assert.equal(watchedMs({ watchedAt: { seconds: 3 } }), 3000);
  assert.equal(watchedMs({}), 0);
});

test('day headings', () => {
  const now = new Date(2026, 10, 4, 15, 0).getTime();
  const at = (d, h = 9) => new Date(2026, 10, d, h, 0).getTime();
  assert.equal(dayBucket(at(4), now), 'Today');
  assert.equal(dayBucket(at(3, 23), now), 'Yesterday');
  assert.equal(dayBucket(at(1), now), 'This week');
  assert.equal(dayBucket(new Date(2026, 9, 1).getTime(), now), 'Earlier');
  assert.equal(dayBucket(0, now), 'Earlier');
});

test('group: false keeps every episode as its own entry', () => {
  const groups = groupHistory([E(2), E(1)], { group: false });
  assert.equal(groups.length, 2);
  assert.ok(groups.every(g => g.others.length === 0));
});

test('time left reads naturally', async () => {
  const { timeLeft, formatClock } = await import('../src/lib/history.js');
  assert.equal(timeLeft({ progressSeconds: 10, durationSeconds: 1297 }), '21 min left');
  assert.equal(timeLeft({ progressSeconds: 3870, durationSeconds: 6720 }), '48 min left');
  assert.equal(timeLeft({ progressSeconds: 100, durationSeconds: 6200 }), '1 h 42 min left');
  assert.equal(timeLeft({ progressSeconds: 0, durationSeconds: 0 }), '');
  assert.equal(formatClock(3876), '1:04:36');
  assert.equal(formatClock(10), '0:10');
});

test('the same file saved under two URL spellings appears once', () => {
  const encoded = { ...E(5), fileUrl: 'http://h/My%20Show/30%20Rock%20S01E05.mkv' };
  const decoded = { ...E(5), fileUrl: 'http://h/My Show/30 Rock S01E05.mkv' };
  assert.equal(groupHistory([encoded, decoded], { group: false }).length, 1);
});
