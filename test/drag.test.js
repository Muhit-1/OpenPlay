import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkPayload, ghostLabel, startLinkDrag, dragLinkProps } from '../src/lib/drag.js';

test('a drag carries the file URL as a link and as text', () => {
  const url = 'http://172.16.50.12/TV/30%20Rock/S01E15.mkv';
  assert.deepEqual(linkPayload(url), { 'text/uri-list': url, 'text/plain': url });
});

test('the ghost label is shortened but never empty', () => {
  assert.equal(ghostLabel(''), 'Video');
  assert.equal(ghostLabel('a'.repeat(80), 10), 'aaaaaaaaa…');
  assert.equal(ghostLabel('Short.mkv'), 'Short.mkv');
});

test('startLinkDrag replaces whatever the browser put on the drag', () => {
  const calls = [];
  const dataTransfer = {
    clearData: () => calls.push(['clear']),
    setData: (type, value) => calls.push(['set', type, value]),
  };
  startLinkDrag({ dataTransfer }, 'http://h/a.mkv', 'a');

  assert.deepEqual(calls, [
    ['clear'],
    ['set', 'text/uri-list', 'http://h/a.mkv'],
    ['set', 'text/plain', 'http://h/a.mkv'],
  ]);
  assert.equal(dataTransfer.effectAllowed, 'copyLink');
});

test('nothing is draggable without a URL', () => {
  assert.deepEqual(dragLinkProps(null, 'x'), {});
  assert.equal(dragLinkProps('http://h/a.mkv', 'x').draggable, true);
});
