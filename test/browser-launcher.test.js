import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { BrowserLauncher, resolveBrowser } from '../lib/browser-launcher.js';

test('all three browsers launch with private-mode flags, fixed URL and no shell', async () => {
  const expected = { chrome: ['--incognito', '--new-window'], msedge: ['--inprivate', '--new-window'], firefox: ['-private-window'] };
  for (const id of Object.keys(expected)) {
    let unreferenced = false;
    const manager = new BrowserLauncher({
      resolve: id => resolveBrowser(id, { canAccess: async () => {} }),
      spawnProcess: (file, args, options) => {
        assert.match(file, /\.exe$/);
        assert.deepEqual(args, [...expected[id], 'https://chatgpt.com/']);
        assert.deepEqual(options, { shell: false, detached: true, stdio: 'ignore', windowsHide: false });
        const child = new EventEmitter();
        child.unref = () => { unreferenced = true; };
        queueMicrotask(() => child.emit('spawn'));
        return child;
      },
    });
    assert.deepEqual(await manager.start(id), { status: 'launch_requested', browser: id });
    assert.equal(unreferenced, true);
  }
});
test('reject unknown/missing browsers and handle launch errors', async () => {
  await assert.rejects(resolveBrowser('cmd.exe'), /请选择/);
  await assert.rejects(resolveBrowser('chrome', { canAccess: async () => { throw new Error(); } }), /未找到/);
  const manager = new BrowserLauncher({
    resolve: id => resolveBrowser(id, { canAccess: async () => {} }),
    spawnProcess: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('error', new Error('sensitive system message')));
      return child;
    },
  });
  await assert.rejects(manager.start('chrome'), /浏览器启动失败/);
  assert.ok(!JSON.stringify(manager.snapshot()).includes('sensitive'));
  assert.equal(manager.busy, false);
});
test('resolve per-user installation when system installations are absent', async () => {
  const browser = await resolveBrowser('chrome', {
    env: { PROGRAMFILES: 'C:\\Apps', 'PROGRAMFILES(X86)': 'C:\\Apps32', LOCALAPPDATA: 'C:\\UserApps' },
    canAccess: async file => { if (!file.startsWith('C:\\UserApps\\')) throw new Error(); },
  });
  assert.equal(browser.executable, 'C:\\UserApps\\Google\\Chrome\\Application\\chrome.exe');
});
