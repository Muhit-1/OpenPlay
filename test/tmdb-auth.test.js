import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmdbAuth } from '../api/_lib/tmdb-auth.js';

test('a short key goes in the query string', () => {
  const a = tmdbAuth(' abc123 ');
  assert.equal(a.apiKey, 'abc123');
  assert.equal(a.headers.Authorization, undefined);
});

test('a read access token goes in a Bearer header', () => {
  const a = tmdbAuth('eyJhbGciOi.payload.sig');
  assert.equal(a.apiKey, null);
  assert.equal(a.headers.Authorization, 'Bearer eyJhbGciOi.payload.sig');
});
