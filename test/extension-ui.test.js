import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('popup restricts actions until context is ready and clears input when importing', async () => {
  const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  for (const ready of [true, false]) {
    const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, {
      value: '', textContent: '', hidden: false, disabled: true, type: 'password', listeners: {},
      addEventListener(name, handler) { this.listeners[name] = handler; }, setAttribute() {},
    }]));
    const document = { getElementById: id => { assert.ok(elements.has(id), `Missing popup element ${id}`); return elements.get(id); } };
    const messages = [];
    const chrome = {
      tabs: { query: async () => [{ id: 12 }] },
      runtime: { sendMessage: async message => { messages.push(structuredClone(message)); return { ok: ready, ready, message: 'mock result' }; } },
    };
    const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
    await new AsyncFunction('chrome', 'document', 'window', source)(chrome, document, { addEventListener() {} });
    const el = id => elements.get(id);
    assert.equal(el('clear').disabled, !ready);
    assert.equal(el('import').disabled, true);
    el('token').value = 'eyJhbGciOiJkaXIifQ..a.synthetic.z';
    el('token').listeners.input();
    assert.equal(el('import').disabled, !ready);
    await el('import').listeners.click();
    if (ready) {
      assert.equal(messages.at(-1).action, 'import');
      assert.equal(messages.at(-1).tabId, 12);
      assert.equal(el('token').value, '');
      assert.equal(el('token').type, 'password');
    } else assert.equal(messages.length, 1);
  }
});
