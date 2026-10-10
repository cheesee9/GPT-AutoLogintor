import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSession } from '../lib/session.js';

test('UI preserves local extraction and launches with browser choice only', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, {
    value: '', textContent: '', hidden: false, disabled: true, type: 'password', listeners: {},
    addEventListener(event, handler) { this.listeners[event] = handler; },
    setAttribute() {}, replaceChildren() {}, add() {},
  }]));
  const document = { getElementById: id => { assert.ok(elements.has(id), `Missing HTML element: ${id}`); return elements.get(id); }, querySelector: () => ({}) };
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url, options });
    const data = url.endsWith('config') ? { browsers: [{ id: 'chrome', label: 'Chrome', available: true }] }
      : { status: url.endsWith('launch') ? 'launch_requested' : 'idle' };
    return { ok: true, json: async () => data };
  };
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  await new AsyncFunction('parseSession', 'document', 'location', 'fetch', 'Option', 'window', 'navigator',
    source.replace(/^import .*;\r?\n/, ''))(
    parseSession, document, { hash: '#' + 'a'.repeat(64) }, fetch,
    function(text, value) { this.text = text; this.value = value; },
    { addEventListener() {} }, { clipboard: { writeText: async () => {} } },
  );
  const el = id => elements.get(id);
  const token = 'eyJhbGciOiJkaXIifQ..a.synthetic.z';
  const before = requests.length;
  el('session-json').value = JSON.stringify({ sessionToken: token });
  await el('extract').listeners.click();
  assert.equal(el('extracted-token').value, token);
  assert.equal(requests.length, before, 'Extraction must stay offline');
  assert.equal(el('launch').disabled, false);
  await el('launch').listeners.click();
  assert.deepEqual(JSON.parse(requests.at(-1).options.body), { browser: 'chrome' });
  assert.ok(!JSON.stringify(requests).includes(token));
  assert.equal(el('status-title').textContent, '已发送打开请求');
  assert.equal(elements.has('login-token'), false);
  await el('clear-all').listeners.click();
  assert.equal(el('session-json').value, '');
  assert.equal(el('extracted-token').value, '');
});
