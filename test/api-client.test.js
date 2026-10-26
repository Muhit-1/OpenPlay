import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
const setLocation = (protocol, hostname) => { globalThis.location = { protocol, hostname }; };

const api = await import('../src/lib/api.js');
beforeEach(() => { store.clear(); setLocation('http:', 'localhost'); });

test('same origin by default on a normal install', () => {
  assert.equal(api.apiBase(), '');
  assert.equal(api.usesHelper(), false);
  assert.equal(api.apiUrl('/api/tmdb?x=1'), '/api/tmdb?x=1');
});

test('a github.io page defaults to the local helper', () => {
  setLocation('https:', 'muhit-1.github.io');
  assert.equal(api.apiBase(), 'http://localhost:8080');
  assert.equal(api.apiUrl('/api/health'), 'http://localhost:8080/api/health');
});

test('a saved address wins and trailing slashes are dropped', () => {
  api.setApiBase(' http://localhost:9000/// ');
  assert.equal(api.apiBase(), 'http://localhost:9000');
  api.setApiBase('');
  assert.equal(api.apiBase(), '');
});

test('media goes through the helper only from a secure page', () => {
  const url = 'http://172.16.50.12/Movies/A B.mkv';

  setLocation('http:', 'localhost');                       // LAN install: play direct
  assert.equal(api.mediaSrc(url), url);

  setLocation('https:', 'muhit-1.github.io');              // hosted: must be proxied
  assert.equal(api.mediaSrc(url),
    `http://localhost:8080/api/stream?url=${encodeURIComponent(url)}`);
  assert.equal(api.mediaSrc('https://cdn.example/a.mp4'), 'https://cdn.example/a.mp4');
});
