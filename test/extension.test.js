import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createController, cookiePlan } from '../extension/core.js';

const NAME = '__Secure-next-auth.session-token';
const fake = length => `eyJhbGciOiJkaXIifQ..a.${'x'.repeat(length - 24)}.z`;
function fixture() {
  const cookies = [
    { name: NAME, value: 'regular-session', domain: 'chatgpt.com', path: '/', storeId: 'ordinary' },
    { name: `${NAME}.99`, value: 'old-private-fragment', domain: 'chatgpt.com', path: '/', storeId: 'private' },
    { name: 'cf_clearance', value: 'untouched', domain: 'chatgpt.com', path: '/', storeId: 'private' },
  ];
  let tab = { id: 12, incognito: true, url: 'https://chatgpt.com/' };
  const writes = [], removals = [], reloads = [];
  const api = {
    extension: { inIncognitoContext: true },
    tabs: { get: async () => ({ ...tab }), reload: async id => { reloads.push(id); } },
    cookies: {
      getAllCookieStores: async () => [{ id: 'ordinary', tabIds: [1] }, { id: 'private', tabIds: [12] }],
      getAll: async ({ storeId }) => cookies.filter(c => c.storeId === storeId).map(c => ({ ...c })),
      remove: async details => {
        removals.push(details);
        const i = cookies.findIndex(c => c.name === details.name && c.storeId === details.storeId);
        if (i >= 0) cookies.splice(i, 1);
        return details;
      },
      set: async details => {
        writes.push({ ...details });
        const cookie = { ...details, domain: 'chatgpt.com', hostOnly: true };
        cookies.push(cookie);
        return cookie;
      },
    },
  };
  return { api, cookies, writes, removals, reloads, changeTab: changes => { tab = { ...tab, ...changes }; } };
}

test('extension imports 4443-byte token only into target private store and leaves normal/Cloudflare cookies intact', async () => {
  const f = fixture(), controller = createController(f.api);
  const token = fake(4443), message = { action: 'import', token, tabId: 12 };
  const result = await controller.run(message);
  assert.equal(result.ok, true);
  assert.equal(message.token, '');
  assert.ok(!JSON.stringify(result).includes(token));
  assert.deepEqual(f.writes.map(c => c.name), [`${NAME}.0`, `${NAME}.1`]);
  assert.deepEqual(f.writes.map(c => c.value.length), [3800, 643]);
  assert.equal(f.writes.map(c => c.value).join(''), token);
  assert.ok(f.writes.every(c => c.storeId === 'private' && c.httpOnly && c.secure && c.sameSite === 'lax' && !c.domain && !c.expirationDate));
  assert.equal(f.cookies.find(c => c.storeId === 'ordinary').value, 'regular-session');
  assert.equal(f.cookies.find(c => c.name === 'cf_clearance').value, 'untouched');
  assert.deepEqual(f.reloads, [12]);
});

test('cookie size boundaries and short token cookie names', () => {
  for (const length of [100, 3800, 3801, 32768]) {
    const plan = cookiePlan(fake(length), 'private');
    assert.equal(plan.map(c => c.value).join(''), fake(length));
    assert.equal(plan.length, Math.ceil(length / 3800));
    assert.equal(plan[0].name, length <= 3800 ? NAME : `${NAME}.0`);
  }
});

test('normal context, normal tab, wrong website, ambiguous store and malformed token do not mutate any cookies', async () => {
  for (const [index, change] of [
    f => { f.api.extension.inIncognitoContext = false; },
    f => f.changeTab({ incognito: false }),
    f => f.changeTab({ url: 'https://chatgpt.com.other.invalid/' }),
    f => { f.api.cookies.getAllCookieStores = async () => [{ id: 'a', tabIds: [12] }, { id: 'b', tabIds: [12] }]; },
    () => {},
  ].entries()) {
    const f = fixture(); change(f);
    const result = await createController(f.api).run({ action: 'import', token: index === 4 ? 'bad token' : fake(100), tabId: 12 });
    assert.equal(result.ok, false);
    assert.equal(f.writes.length + f.removals.length, 0);
  }
});

test('partial write failure removes fragments and never reloads or reports success', async () => {
  const f = fixture();
  const set = f.api.cookies.set;
  f.api.cookies.set = async details => { if (details.name.endsWith('.1')) throw new Error('PRIVATE TOKEN DETAILS'); return set(details); };
  const result = await createController(f.api).run({ action: 'import', token: fake(4443), tabId: 12 });
  assert.equal(result.ok, false);
  assert.ok(!result.message.includes('PRIVATE'));
  assert.equal(f.cookies.filter(c => c.storeId === 'private' && c.name.startsWith(NAME)).length, 0);
  assert.equal(f.reloads.length, 0);
});

test('clear targets login cookies only and is idempotent', async () => {
  const f = fixture(), controller = createController(f.api);
  assert.equal((await controller.run({ action: 'clear', tabId: 12 })).ok, true);
  assert.equal((await controller.run({ action: 'clear', tabId: 12 })).ok, true);
  assert.equal(f.cookies.length, 2);
  assert.ok(f.removals.every(c => c.storeId === 'private' && c.name.startsWith(NAME)));
  assert.equal(f.reloads.length, 0);
});

test('failed cleanup aborts import without writing a new token', async () => {
  const f = fixture(); f.api.cookies.remove = async () => null;
  const result = await createController(f.api).run({ action: 'import', token: fake(100), tabId: 12 });
  assert.equal(result.ok, false);
  assert.match(result.message, /全部无痕窗口/);
  assert.equal(f.writes.length, 0);
});

test('concurrent operations are rejected', async () => {
  const f = fixture(); let release;
  f.api.tabs.get = () => new Promise(resolve => { release = () => resolve({ id: 12, incognito: true, url: 'https://chatgpt.com/' }); });
  const controller = createController(f.api);
  const pending = controller.run({ action: 'status', tabId: 12 });
  assert.equal((await controller.run({ action: 'clear', tabId: 12 })).ok, false);
  release();
  assert.equal((await pending).ok, true);
});

test('extension is self-contained, requests narrow permissions, and sender validation rejects external pages', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.permissions, ['cookies']);
  assert.deepEqual(manifest.host_permissions, ['https://chatgpt.com/*']);
  assert.equal(manifest.incognito, 'split');
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  assert.equal(await readFile(new URL('../extension/session.js', import.meta.url), 'utf8'), await readFile(new URL('../lib/session.js', import.meta.url), 'utf8'));
  const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
  let handler, calls = 0;
  const runtime = { id: 'self', getURL: p => 'chrome-extension://self/' + p, onMessage: { addListener: h => { handler = h; } } };
  new Function('chrome', 'createController', source.replace(/^import .*;\r?\n/, ''))({ runtime }, () => ({ run: async () => { calls++; return { ok: true }; } }));
  let response;
  assert.equal(handler({}, { id: 'self', url: 'https://chatgpt.com/' }, r => { response = r; }), false);
  assert.equal(response.ok, false); assert.equal(calls, 0);
  await new Promise(resolve => { assert.equal(handler({}, { id: 'self', url: runtime.getURL('popup.html') }, resolve), true); });
  assert.equal(calls, 1);
});
