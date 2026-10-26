import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeServerAddress as n } from '../src/lib/url.js';

test('accepts a bare IP, with or without scheme, port or path', () => {
  assert.equal(n('172.16.50.12').url, 'http://172.16.50.12/');
  assert.equal(n('http://172.16.50.12').url, 'http://172.16.50.12/');
  assert.equal(n('  http://172.16.50.12/  ').url, 'http://172.16.50.12/');
  assert.equal(n('172.16.50.12:8080').url, 'http://172.16.50.12:8080/');
  assert.equal(n('172.16.50.12/DHAKA-FLIX-12').url, 'http://172.16.50.12/DHAKA-FLIX-12/');
  assert.equal(n('HTTPS://Media.Example.com/x/').url, 'https://media.example.com/x/');
  assert.equal(n('localhost:8081').url, 'http://localhost:8081/');
});

test('rejects things that are not addresses, with a reason', () => {
  for (const bad of ['', '   ', 'ftp://172.16.50.12', 'javascript:alert(1)', 'mailto:a@b.c',
                     '172.16.50', '172.16.50.256', '999.1.1.1', '1.2.3.4.5',
                     'a b c', 'http://user:pw@172.16.50.12/', 'http://', 'bad_host!', '-bad.example']) {
    const r = n(bad);
    assert.equal(r.ok, false, `should reject: ${JSON.stringify(bad)}`);
    assert.ok(r.error.length > 10);
  }
});

test('reports the host so the UI can show what was understood', () => {
  assert.equal(n('172.16.50.12:8080').host, '172.16.50.12:8080');
});

test('a host with a port is not mistaken for a scheme', () => {
  assert.equal(n('myserver:8080').ok, true);
  assert.equal(n('myserver:8080/path').url, 'http://myserver:8080/path/');
});

test('an out-of-range IP gets the specific message', () => {
  assert.match(n('172.16.50.999').error, /four numbers from 0 to 255/);
  assert.match(n('172.16.50').error, /four numbers from 0 to 255/);
});
