import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let stub, helper, base;
const hits = [];

before(async () => {
  stub = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname);
    res.writeHead(200, { 'content-type': 'application/json' });
    if (u.pathname === '/search/movie') {
      return res.end(JSON.stringify({ results: [
        { id: 1, title: 'Heat', release_date: '1995-12-15', vote_average: 7.94, vote_count: 9000,
          original_language: 'en', genre_ids: [28, 80], popularity: 60 },
        { id: 2, title: 'Heat', release_date: '1986-01-01', vote_average: 5, vote_count: 3,
          original_language: 'en', genre_ids: [18], popularity: 1 },
      ] }));
    }
    res.end(JSON.stringify({ results: [] }));
  });
  await new Promise(r => stub.listen(0, '127.0.0.1', r));

  process.env.TMDB_API_KEY = 'k';
  process.env.TMDB_BASE_URL = `http://127.0.0.1:${stub.address().port}`;
  const { createApp } = await import('../server.js');
  const app = await createApp();
  await new Promise(r => { helper = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${helper.address().port}`;
});
after(() => { helper.close(); stub.close(); });

test('brief mode returns filter fields from one search call, with no detail call', async () => {
  hits.length = 0;
  const body = await (await fetch(`${base}/api/tmdb?title=Heat&type=movie&year=1995&brief=1`)).json();

  assert.equal(body.found, true);
  assert.equal(body.id, 1);                       // the 1995 film, not the 1986 one
  assert.equal(body.year, '1995');
  assert.equal(body.rating, 7.9);
  assert.equal(body.votes, 9000);
  assert.equal(body.language, 'en');
  assert.deepEqual(body.genreIds, [28, 80]);
  assert.deepEqual(hits, ['/search/movie']);      // search only
});

test('a title TMDB does not know is reported as not found', async () => {
  const body = await (await fetch(`${base}/api/tmdb?title=Nonexistent&type=tv&brief=1`)).json();
  assert.equal(body.found, false);
});
