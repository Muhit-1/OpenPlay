import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';

const PAGE = 'https://page.example';
let helper, base, media, mediaBase;
const data = Buffer.from('0123456789'.repeat(100));   // 1000 bytes

before(async () => {
  process.env.OPENPLAY_STREAM = '1';
  process.env.ALLOWED_ORIGINS = PAGE;

  media = http.createServer((req, res) => {
    if (req.url === '/movie.mkv') {
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        const start = +m[1], end = m[2] ? +m[2] : data.length - 1;
        res.writeHead(206, {
          'content-type': 'video/x-matroska', 'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': end - start + 1,
        });
        return res.end(data.subarray(start, end + 1));
      }
      res.writeHead(200, { 'content-type': 'video/x-matroska', 'content-length': data.length });
      return res.end(data);
    }
    if (req.url === '/page.mkv') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>'); }
    if (req.url === '/go.mkv')   { res.writeHead(302, { location: 'http://169.254.169.254/x.mkv' }); return res.end(); }
    res.writeHead(404); res.end();
  });
  await new Promise(r => media.listen(0, '127.0.0.1', r));
  mediaBase = `http://127.0.0.1:${media.address().port}`;

  const app = await createApp();
  await new Promise(r => { helper = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${helper.address().port}`;
});
after(() => { helper.close(); media.close(); });

const stream = (path, headers = {}) =>
  fetch(`${base}/api/stream?url=${encodeURIComponent(mediaBase + path)}`, { headers });

test('streams a whole file', async () => {
  const res = await stream('/movie.mkv');
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).length, 1000);
});

test('forwards Range so seeking works', async () => {
  const res = await stream('/movie.mkv', { Range: 'bytes=100-199' });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), 'bytes 100-199/1000');
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), data.subarray(100, 200).toString());
});

test('refuses things that are not media', async () => {
  assert.equal((await stream('/page.html')).status, 415);   // by extension
  assert.equal((await stream('/page.mkv')).status, 415);    // by content type
});

test('re-checks redirects and refuses the metadata address', async () => {
  assert.equal((await stream('/go.mkv')).status, 403);
});

test('a page from an unlisted site is refused', async () => {
  const res = await stream('/movie.mkv', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' });
  assert.equal(res.status, 403);
});

test('a media element has no Origin, so the Referer decides', async () => {
  const bad  = await stream('/movie.mkv', { 'sec-fetch-site': 'cross-site', referer: 'https://evil.example/x' });
  const good = await stream('/movie.mkv', { 'sec-fetch-site': 'cross-site', referer: `${PAGE}/OpenPlay/` });
  assert.equal(bad.status, 403);
  assert.equal(good.status, 200);
  await good.arrayBuffer();
});

test('the listed page gets CORS headers', async () => {
  const res = await fetch(`${base}/api/health`, { headers: { origin: PAGE, 'sec-fetch-site': 'cross-site' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), PAGE);
});

test('the private-network preflight is answered', async () => {
  const res = await fetch(`${base}/api/proxy`, {
    method: 'OPTIONS',
    headers: {
      origin: PAGE,
      'access-control-request-method': 'GET',
      'access-control-request-private-network': 'true',
    },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), PAGE);
  assert.equal(res.headers.get('access-control-allow-private-network'), 'true');
});

test('streaming is off unless the helper enables it', async () => {
  process.env.OPENPLAY_STREAM = '0';
  try {
    assert.equal((await stream('/movie.mkv')).status, 404);
  } finally {
    process.env.OPENPLAY_STREAM = '1';
  }
});
