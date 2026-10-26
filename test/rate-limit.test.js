import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../api/_lib/http.js';

const saved = { ...process.env };
beforeEach(() => { delete process.env.VERCEL; delete process.env.OPENPLAY_HOSTED; delete process.env.RATE_LIMIT_PER_MIN; });
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

const req = ip => ({ headers: { 'x-forwarded-for': ip }, socket: {} });

test('unlimited when running locally', () => {
  for (let i = 0; i < 5000; i++) assert.ok(rateLimit(req('1.1.1.1')));
});

test('limits per client when RATE_LIMIT_PER_MIN is set, and resets', () => {
  process.env.RATE_LIMIT_PER_MIN = '3';
  const now = Date.now();
  assert.ok(rateLimit(req('2.2.2.2'), now));
  assert.ok(rateLimit(req('2.2.2.2'), now));
  assert.ok(rateLimit(req('2.2.2.2'), now));
  assert.ok(!rateLimit(req('2.2.2.2'), now));
  assert.ok(rateLimit(req('3.3.3.3'), now));              // other clients unaffected
  assert.ok(rateLimit(req('2.2.2.2'), now + 61_000));     // window rolled over
});

test('hosted deployments get a default limit', () => {
  process.env.VERCEL = '1';
  let blocked = false;
  for (let i = 0; i < 700; i++) if (!rateLimit(req('4.4.4.4'))) blocked = true;
  assert.ok(blocked);
});
