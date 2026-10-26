import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIp, assertUrlAllowed, fetchText, MAX_BYTES } from '../api/_lib/safe-fetch.js';
import { srtToVtt } from '../api/proxy.js';

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.VERCEL;
  delete process.env.OPENPLAY_HOSTED;
  delete process.env.ALLOWED_PROXY_HOSTS;
});
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
});

const noDns = () => { throw new Error('should not resolve'); };
const status = p => p.then(() => 'ok', e => e.status);

test('classifies addresses', () => {
  assert.equal(classifyIp('172.16.50.12'), 'ok');
  assert.equal(classifyIp('169.254.169.254'), 'blocked');
  assert.equal(classifyIp('0.0.0.0'), 'blocked');
  assert.equal(classifyIp('127.0.0.1'), 'loopback');
  assert.equal(classifyIp('::1'), 'loopback');
  assert.equal(classifyIp('fe80::1'), 'blocked');
  assert.equal(classifyIp('fd00:ec2::254'), 'blocked');
  assert.equal(classifyIp('::ffff:169.254.169.254'), 'blocked');
  assert.equal(classifyIp('::ffff:a9fe:a9fe'), 'blocked');
});

test('metadata address is refused however it is written', async () => {
  for (const u of [
    'http://169.254.169.254/latest/meta-data/',
    'http://2852039166/',                 // decimal form
    'http://0xa9fea9fe/',                 // hex form
    'http://[::ffff:169.254.169.254]/',
    'http://metadata.google.internal/',
  ]) {
    assert.equal(await status(assertUrlAllowed(u, noDns)), 403, u);
  }
});

test('a hostname that resolves to a blocked address is refused', async () => {
  const lookup = async () => [{ address: '169.254.169.254', family: 4 }];
  assert.equal(await status(assertUrlAllowed('http://sneaky.example/', lookup)), 403);
});

test('private LAN addresses are allowed locally', async () => {
  await assert.doesNotReject(assertUrlAllowed('http://172.16.50.12/', noDns));
});

test('rejects non-http schemes, credentials and junk', async () => {
  assert.equal(await status(assertUrlAllowed('file:///etc/passwd', noDns)), 400);
  assert.equal(await status(assertUrlAllowed('http://user:pw@172.16.50.12/', noDns)), 400);
  assert.equal(await status(assertUrlAllowed('not a url', noDns)), 400);
});

test('allowlist is enforced when set', async () => {
  process.env.ALLOWED_PROXY_HOSTS = '172.16.50.12';
  await assert.doesNotReject(assertUrlAllowed('http://172.16.50.12/x', noDns));
  assert.equal(await status(assertUrlAllowed('http://172.16.50.14/x', noDns)), 403);
});

test('hosted deployments refuse everything until an allowlist is set', async () => {
  process.env.VERCEL = '1';
  assert.equal(await status(assertUrlAllowed('http://172.16.50.12/', noDns)), 403);
  process.env.ALLOWED_PROXY_HOSTS = '127.0.0.1';
  assert.equal(await status(assertUrlAllowed('http://127.0.0.1/', noDns)), 403); // loopback still blocked
});

const response = (init, body = '') => new Response(body, init);

test('redirects are re-validated on every hop', async () => {
  const fetchImpl = async () => response({ status: 302, headers: { location: 'http://169.254.169.254/' } });
  assert.equal(await status(fetchText('http://172.16.50.12/', { fetchImpl })), 403);
});

test('follows a safe redirect and returns the body', async () => {
  let n = 0;
  const fetchImpl = async () => (n++ === 0
    ? response({ status: 301, headers: { location: '/real/' } })
    : response({ status: 200 }, 'hello'));
  assert.equal(await fetchText('http://172.16.50.12/', { fetchImpl }), 'hello');
});

test('gives up on redirect loops', async () => {
  const fetchImpl = async () => response({ status: 302, headers: { location: '/again' } });
  assert.equal(await status(fetchText('http://172.16.50.12/', { fetchImpl })), 508);
});

test('caps the body size while streaming', async () => {
  const big = 'x'.repeat(MAX_BYTES + 1);
  const fetchImpl = async () => response({ status: 200 }, big);
  assert.equal(await status(fetchText('http://172.16.50.12/', { fetchImpl })), 413);
});

test('surfaces upstream errors with their status', async () => {
  const fetchImpl = async () => response({ status: 404 });
  assert.equal(await status(fetchText('http://172.16.50.12/', { fetchImpl })), 404);
});

test('srtToVtt converts timestamps and adds the header', () => {
  const out = srtToVtt('﻿1\r\n00:00:01,500 --> 00:00:02,000\r\nHi\r\n');
  assert.ok(out.startsWith('WEBVTT\n\n'));
  assert.match(out, /00:00:01\.500 --> 00:00:02\.000/);
});
