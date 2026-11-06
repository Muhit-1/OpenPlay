import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';
import {
  srtToVtt, toVtt, shiftVtt, normalizeResults, rankSubtitles, releaseMatch,
} from '../shared/subtitles.js';
import {
  buildSearchParams, decodeSubtitle, linkAllowed, clearSubtitleCaches,
} from '../api/subtitles.js';

// ── Pure logic ───────────────────────────────────────────────────────────

test('srtToVtt only rewrites commas on timing lines', () => {
  const out = srtToVtt('1\n00:00:01,500 --> 00:00:02,000\nWell, hello, 12:30:45,5 there\n');
  assert.ok(out.startsWith('WEBVTT\n\n'));
  assert.match(out, /00:00:01\.500 --> 00:00:02\.000/);
  assert.match(out, /Well, hello, 12:30:45,5 there/);
});

test('toVtt keeps VTT as it is and converts SRT', () => {
  assert.equal(toVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n');
  assert.ok(toVtt('1\n00:00:01,000 --> 00:00:02,000\nHi\n').startsWith('WEBVTT'));
});

test('shiftVtt moves cues later and earlier, and never below zero', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello\n\n01:02:03.004 --> 01:02:04.000\nBye\n';

  const later = shiftVtt(vtt, 2.5);
  assert.match(later, /00:00:03\.500 --> 00:00:06\.000/);
  assert.match(later, /01:02:05\.504 --> 01:02:06\.500/);
  assert.match(later, /\nHello\n/);

  const earlier = shiftVtt(vtt, -2);
  assert.match(earlier, /00:00:00\.000 --> 00:00:01\.500/);   // clamped at 0

  assert.equal(shiftVtt(vtt, 0), vtt);
});

test('shiftVtt understands short MM:SS.mmm stamps', () => {
  assert.match(shiftVtt('WEBVTT\n\n00:05.000 --> 00:07.250\nA\n', 1), /00:00:06\.000 --> 00:00:08\.250/);
});

const apiRow = (id, extra = {}) => ({
  id: `s${id}`,
  attributes: {
    language: 'en', release: 'Show.S01E01.1080p.WEB-DL.x265-Silence', download_count: 100,
    files: [{ file_id: id, file_name: 'a.srt' }], ...extra,
  },
});

test('normalizeResults flattens the API shape and skips rows without a file', () => {
  const out = normalizeResults([
    apiRow(11, { hearing_impaired: true, from_trusted: true, uploader: { name: 'bob' } }),
    { attributes: { language: 'en', files: [] } },
    null,
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(
    { id: out[0].id, language: out[0].language, hearingImpaired: out[0].hearingImpaired, trusted: out[0].trusted, uploader: out[0].uploader },
    { id: '11', language: 'en', hearingImpaired: true, trusted: true, uploader: 'bob' }
  );
  assert.deepEqual(normalizeResults(undefined), []);
});

test('release matching rewards the same source, codec and group', () => {
  const file = '30 Rock (2006) - S01E15 - Hard Ball (1080p AMZN WEBRip x265 Silence).mkv';
  const same = releaseMatch(file, '30.Rock.S01E15.1080p.AMZN.WEBRip.x265-Silence');
  const other = releaseMatch(file, '30.Rock.S01E15.720p.HDTV.x264-LOL');
  assert.ok(same > 0.8, `same=${same}`);
  assert.ok(other < 0.2, `other=${other}`);
});

test('ranking puts the release match first and sinks machine translations', () => {
  const file = 'Show.S01E01.1080p.WEB-DL.x265-Silence.mkv';
  const results = normalizeResults([
    apiRow(1, { release: 'Show.S01E01.720p.HDTV.x264-LOL', download_count: 90000 }),
    apiRow(2, { release: 'Show S01E01 1080p WEB-DL x265-Silence', download_count: 50 }),
    apiRow(3, { release: 'Show.S01E01.1080p.WEB-DL.x265-Silence', machine_translated: true }),
    apiRow(4, { release: 'Show.S01E01.1080p.WEB-DL.x265-Silence', hearing_impaired: true }),
    apiRow(5, { language: 'bn', release: 'Show.S01E01.1080p' }),
  ]);

  const ranked = rankSubtitles(results, { release: file, languages: ['en'] });
  assert.equal(ranked[0].id, '2');
  assert.ok(ranked.findIndex(r => r.id === '3') > ranked.findIndex(r => r.id === '4'));

  // One "best" flag per language.
  assert.deepEqual(ranked.filter(r => r.best).map(r => r.language).sort(), ['bn', 'en']);
});

test('search parameters follow OpenSubtitles rules: lowercase, sorted, validated', () => {
  const tv = buildSearchParams({ type: 'tv', tmdbId: '4608', season: '1', episode: '15', lang: 'EN,bn', query: 'ignored?' });
  assert.deepEqual(Object.keys(tv), [...Object.keys(tv)].sort());
  assert.equal(tv.parent_tmdb_id, '4608');
  assert.equal(tv.season_number, '1');
  assert.equal(tv.episode_number, '15');
  assert.equal(tv.type, 'episode');
  assert.equal(tv.languages, 'en,bn');

  const movie = buildSearchParams({ type: 'movie', tmdbId: '123', lang: 'not a language' });
  assert.equal(movie.tmdb_id, '123');
  assert.equal(movie.languages, undefined);

  const byName = buildSearchParams({ type: 'movie', query: 'Mercy', year: '2026' });
  assert.equal(byName.query, 'Mercy');
  assert.equal(byName.year, '2026');

  assert.equal(buildSearchParams({ type: 'movie', tmdbId: '12x' }).tmdb_id, undefined);
});

test('subtitle text that is not UTF-8 is read as Windows-1252', () => {
  assert.equal(decodeSubtitle(Buffer.from('café', 'utf8')), 'café');
  assert.equal(decodeSubtitle(Buffer.from([0x63, 0x61, 0x66, 0xe9])), 'café');
});

test('only OpenSubtitles download links are followed', () => {
  assert.equal(linkAllowed('https://www.opensubtitles.com/download/abc'), true);
  assert.equal(linkAllowed('https://dl.opensubtitles.org/x'), true);
  assert.equal(linkAllowed('https://evil.example/opensubtitles.com'), false);
  assert.equal(linkAllowed('http://169.254.169.254/latest'), false);
  assert.equal(linkAllowed('not a url'), false);
});

// ── The endpoint, against a stand-in OpenSubtitles ───────────────────────

let upstream, upstreamBase, app, server, base;
const seen = [];
let downloadStatus = 200;

before(async () => {
  upstream = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    seen.push({ method: req.method, path: url.pathname, query: url.search, headers: req.headers });

    if (url.pathname === '/subtitles') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ total_count: 1, data: [apiRow(777, { release: 'Show.S01E01.1080p' })] }));
    }
    if (url.pathname === '/login') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ token: 'jwt-123' }));
    }
    if (url.pathname === '/download') {
      res.setHeader('content-type', 'application/json');
      if (downloadStatus !== 200) {
        res.statusCode = downloadStatus;
        return res.end(JSON.stringify({ message: 'You have downloaded your allowed 5 subtitles for 24 hours' }));
      }
      return res.end(JSON.stringify({ link: `${upstreamBase}/file.srt`, remaining: 4 }));
    }
    if (url.pathname === '/file.srt') {
      return res.end(Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\nCaf\xe9\r\n', 'latin1'));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  upstreamBase = `http://127.0.0.1:${upstream.address().port}`;

  process.env.OPENSUBTITLES_BASE_URL = upstreamBase;
  process.env.OPENSUBTITLES_API_KEY = 'k-test';
  delete process.env.OPENSUBTITLES_USERNAME;
  delete process.env.OPENSUBTITLES_PASSWORD;

  app = await createApp();
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { server.close(); upstream.close(); });

beforeEach(() => {
  seen.length = 0;
  downloadStatus = 200;
  clearSubtitleCaches();
  process.env.OPENSUBTITLES_API_KEY = 'k-test';
  delete process.env.OPENSUBTITLES_USERNAME;
  delete process.env.OPENSUBTITLES_PASSWORD;
});

test('without a key the endpoint explains how to set it up', async () => {
  delete process.env.OPENSUBTITLES_API_KEY;
  const res = await fetch(`${base}/api/subtitles?search=1&type=movie&tmdbId=1`);
  assert.equal(res.status, 501);
  const body = await res.json();
  assert.equal(body.code, 'not_configured');
  assert.match(body.detail, /OPENSUBTITLES_API_KEY/);
});

test('search sends the key and a User-Agent, and returns normalised results', async () => {
  const res = await fetch(`${base}/api/subtitles?search=1&type=tv&tmdbId=4608&season=1&episode=15&lang=en`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].id, '777');

  const call = seen.find(s => s.path === '/subtitles');
  assert.equal(call.headers['api-key'], 'k-test');
  assert.match(call.headers['user-agent'], /OpenPlay/);
  assert.match(call.query, /parent_tmdb_id=4608/);
  assert.match(call.query, /season_number=1/);
});

test('repeat searches are served from cache', async () => {
  const url = `${base}/api/subtitles?search=1&type=movie&tmdbId=99`;
  await fetch(url);
  await fetch(url);
  assert.equal(seen.filter(s => s.path === '/subtitles').length, 1);
});

test('search needs something to look for', async () => {
  const res = await fetch(`${base}/api/subtitles?search=1&type=movie`);
  assert.equal(res.status, 400);
});

test('download returns WebVTT, decoded and converted, and is cached', async () => {
  const res = await fetch(`${base}/api/subtitles?download=777`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/vtt/);
  const text = await res.text();
  assert.ok(text.startsWith('WEBVTT'));
  assert.match(text, /00:00:01\.000 --> 00:00:02\.000/);
  assert.match(text, /Café/);

  await fetch(`${base}/api/subtitles?download=777`);
  assert.equal(seen.filter(s => s.path === '/download').length, 1);
});

test('download logs in first when an account is configured', async () => {
  process.env.OPENSUBTITLES_USERNAME = 'me';
  process.env.OPENSUBTITLES_PASSWORD = 'pw';
  const res = await fetch(`${base}/api/subtitles?download=778`);
  assert.equal(res.status, 200);
  const dl = seen.find(s => s.path === '/download');
  assert.equal(dl.headers.authorization, 'Bearer jwt-123');
});

test('hitting the daily download limit is reported as a quota error', async () => {
  downloadStatus = 406;
  const res = await fetch(`${base}/api/subtitles?download=779`);
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.code, 'quota');
});

test('a rejected key is reported as bad_key', async () => {
  downloadStatus = 401;
  const res = await fetch(`${base}/api/subtitles?download=780`);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'bad_key');
});

test('an unreachable OpenSubtitles is explained, not reported as "fetch failed"', async () => {
  const saved = process.env.OPENSUBTITLES_BASE_URL;
  process.env.OPENSUBTITLES_BASE_URL = 'http://127.0.0.1:1';      // nothing listens here
  try {
    const res = await fetch(`${base}/api/subtitles?search=1&type=movie&tmdbId=424242`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.code, 'upstream');
    assert.match(body.detail, /could not be reached/);
  } finally {
    process.env.OPENSUBTITLES_BASE_URL = saved;
  }
});

test('ids must be numbers', async () => {
  assert.equal((await fetch(`${base}/api/subtitles?download=abc`)).status, 400);
});

test('health reports whether subtitles are configured', async () => {
  const body = await (await fetch(`${base}/api/health`)).json();
  assert.equal(body.subtitles, true);
});
