import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDirectoryHTML } from '../api/parse.js';

const BASE = 'http://172.16.50.14/DHAKA-FLIX-14/English%20Movies/';

const H5AI = `
<table>
  <tr><td><a href="/DHAKA-FLIX-14/">Parent Directory</a></td></tr>
  <tr><td><a href="/DHAKA-FLIX-14/English%20Movies/(2025)/"><span>(2025)</span></a></td><td>2025-03-01 10:00</td></tr>
  <tr><td><a href="/DHAKA-FLIX-14/English%20Movies/Mercy%20(2026).mkv">Mercy (2026).mkv</a></td><td>2026-01-02 11:30</td><td>2.1 GB</td></tr>
  <tr><td><a href="/DHAKA-FLIX-14/English%20Movies/Mercy%20(2026).srt">Mercy.srt</a></td></tr>
  <tr><td><a href="/DHAKA-FLIX-14/English%20Movies/poster.jpg">poster</a></td></tr>
  <tr><td><a href="/_h5ai/public/js/x.js">asset</a></td></tr>
  <tr><td><a href="http://evil.example/steal.mkv">elsewhere</a></td></tr>
  <tr><td><a href="/other-share/escape.mkv">sibling share</a></td></tr>
  <tr><td><a href="?C=N;O=D">sort</a></td></tr>
</table>`;

test('parses folders, videos and subtitles with row metadata', () => {
  const { folders, files } = parseDirectoryHTML(H5AI, BASE);

  assert.deepEqual(folders.map(f => f.name), ['(2025)']);
  assert.equal(folders[0].date, '2025-03-01 10:00');

  const video = files.find(f => f.type === 'video');
  assert.equal(video.name, 'Mercy (2026).mkv');
  assert.equal(video.size, '2.1 GB');
  assert.equal(files.filter(f => f.type === 'subtitle').length, 1);
});

test('drops images, UI assets, parent links and sort links', () => {
  const { folders, files } = parseDirectoryHTML(H5AI, BASE);
  const urls = [...folders, ...files].map(e => e.url);
  assert.ok(!urls.some(u => /poster|_h5ai|C=N/.test(u)));
});

test('never leaves the requested directory or host', () => {
  const { files } = parseDirectoryHTML(H5AI, BASE);
  assert.ok(!files.some(f => /evil\.example|escape\.mkv/.test(f.url)));
});

test('parses an Apache-style relative listing', () => {
  const html = '<a href="../">Parent Directory</a><a href="Movie%20(2020).mp4">Movie (2020).mp4</a><a href="Extras/">Extras/</a>';
  const { folders, files } = parseDirectoryHTML(html, 'http://host/media/');
  assert.equal(folders[0].name, 'Extras');
  assert.equal(files[0].url, 'http://host/media/Movie%20(2020).mp4');
});

test('survives garbage input', () => {
  assert.deepEqual(parseDirectoryHTML('<<<not html', BASE), { folders: [], files: [] });
});
