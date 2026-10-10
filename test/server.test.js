import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../server.js';

test('local API validates origin/key, accepts only browser choice, and removes session-control routes', async () => {
  let launches = 0;
  const manager = {
    snapshot: () => ({ status: 'idle' }),
    start: async (...args) => { assert.deepEqual(args, ['chrome']); launches++; return { status: 'launch_requested' }; },
  };
  const app = await startServer({ manager, browserProvider: async () => [] });
  const headers = { 'X-Local-Key': app.key, 'Content-Type': 'application/json' };
  const post = (route, body, extraHeaders = {}) => fetch(app.origin + route, { method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(app.origin + '/api/status')).status, 403);
    assert.equal((await post('/api/launch', { browser: 'chrome' }, { Origin: 'https://other.invalid' })).status, 403);
    const wrongHost = await new Promise((resolve, reject) => {
      http.get(app.origin + '/api/status', { headers: { ...headers, Host: 'other.invalid' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(wrongHost, 403);
    assert.equal((await post('/api/launch', { browser: 'chrome' })).status, 200);
    for (const body of [null, [], {}, { browser: 'cmd.exe' }, { browser: 'chrome', token: 'PRIVATE' }, { browser: 'chrome', url: 'https://other.invalid' }, { browser: 'chrome', args: ['--anything'] }]) {
      const response = await post('/api/launch', body);
      assert.equal(response.status, 400);
      assert.ok(!(await response.text()).includes('PRIVATE'));
    }
    assert.equal(launches, 1);
    for (const route of ['/api/check', '/api/clear', '/api/close']) assert.equal((await post(route, {})).status, 404);
    for (const route of ['/package.json', '/lib/browser-launcher.js']) assert.equal((await fetch(app.origin + route)).status, 404);
    const index = await fetch(app.origin);
    assert.equal(index.status, 200);
    assert.equal(index.headers.get('cache-control'), 'no-store');
    assert.match(index.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally { await app.close(); }
});
