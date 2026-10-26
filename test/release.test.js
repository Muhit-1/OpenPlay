import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelease, titleScore, normaliseTitle } from '../src/lib/release.js';

test('parses a typical ISP release name', () => {
  const r = parseRelease('Mercy (2026) 1080p AMZN-WEB x265 HEVC ESub [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv');
  assert.equal(r.title, 'Mercy');
  assert.equal(r.year, '2026');
  assert.equal(r.kind, 'movie');
  assert.equal(r.container, 'mkv');
  assert.match(r.resolution, /1080p/i);
  assert.match(r.videoCodec, /x265|hevc/i);
  assert.equal(r.dualAudio, true);
});

test('handles dot-separated scene names', () => {
  const r = parseRelease('Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.x265.mkv');
  assert.equal(r.title, 'Dune Part Two');
  assert.equal(r.year, '2024');
});

test('detects episodes and seasons', () => {
  const ep = parseRelease('Severance.S02E05.1080p.WEB.h264.mkv');
  assert.equal(ep.kind, 'tv');
  assert.equal(ep.season, 2);
  assert.equal(ep.episode, 5);
  assert.equal(ep.title, 'Severance');
});

test('keeps dotted acronyms intact', () => {
  assert.equal(parseRelease('S.W.A.T.S01E01.720p.mkv').title, 'S.W.A.T');
});

test('does not mistake a numeric title for its year', () => {
  assert.equal(parseRelease('1917 (2019) 1080p BluRay.mkv').title, '1917');
  assert.equal(parseRelease('2012 (2009) 720p.mkv').title, '2012');
});

test('tolerates empty and odd input', () => {
  assert.equal(parseRelease('').title, '');
  assert.doesNotThrow(() => parseRelease(undefined));
});

test('titleScore ranks exact > prefix > unrelated', () => {
  assert.equal(titleScore('The Matrix', 'Matrix'), 1);
  assert.equal(titleScore('Dune', 'Dune Part Two'), 0.72);
  assert.ok(titleScore('Dune', 'Frozen') < 0.5);
  assert.equal(normaliseTitle("Ocean's Eleven"), 'oceans eleven');
});
