import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../server.js';
import { CSP } from '../shared/security-headers.js';

let server, base;

before(async () => {
  process.env.TMDB_API_KEY = 'test-key';
  const app = await createApp();
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = path => fetch(base + path);

test('unknown API routes 404 as JSON', async () => {
  const res = await get('/api/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('proxy and parse require a url', async () => {
  assert.equal((await get('/api/proxy')).status, 400);
  assert.equal((await get('/api/parse')).status, 400);
});

test('proxy refuses the metadata endpoint', async () => {
  const res = await get('/api/proxy?url=' + encodeURIComponent('http://169.254.169.254/latest/'));
  assert.equal(res.status, 403);
});

test('non-GET methods are rejected', async () => {
  assert.equal((await fetch(base + '/api/proxy?url=x', { method: 'POST' })).status, 405);
});

test('no CORS header unless the origin is allow-listed', async () => {
  const res = await fetch(base + '/api/proxy', { headers: { origin: 'http://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('tmdb rejects ids that are not numeric', async () => {
  for (const q of ['tmdbId=1/../../x', 'personId=abc', 'showId=1&season=../2', 'companyId=1%2F2']) {
    assert.equal((await get('/api/tmdb?' + q)).status, 400, q);
  }
});

test('vercel.json carries the same CSP as the local server', () => {
  const cfg = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const header = cfg.headers[0].headers.find(h => h.key === 'Content-Security-Policy');
  assert.equal(header.value, CSP);
});

test('a local install is never rate limited', async () => {
  // More than the old 240/min cap, sent in small batches: firing them all at
  // once exhausts connection slots on Windows and fails for the wrong reason.
  const statuses = [];
  for (let batch = 0; batch < 14; batch++) {
    const results = await Promise.all(Array.from({ length: 25 }, () => get('/api/proxy')));
    statuses.push(...results.map(r => r.status));
  }
  assert.equal(statuses.length, 350);
  assert.ok(statuses.every(code => code === 400));   // 400 = reached the handler, not 429
});

test('health says why metadata is unavailable', async () => {
  const key = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;
  try {
    const body = await (await get('/api/health')).json();
    assert.deepEqual(body, { ok: false, reason: 'no-key', stream: false });
  } finally {
    process.env.TMDB_API_KEY = key;
  }
});
