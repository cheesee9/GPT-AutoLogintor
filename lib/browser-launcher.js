import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const URL = 'https://chatgpt.com/';
const DEFINITIONS = [
  { id: 'chrome', label: 'Google Chrome · 无痕', relative: 'Google/Chrome/Application/chrome.exe', args: ['--incognito', '--new-window', URL] },
  { id: 'msedge', label: 'Microsoft Edge · InPrivate', relative: 'Microsoft/Edge/Application/msedge.exe', args: ['--inprivate', '--new-window', URL] },
  { id: 'firefox', label: 'Mozilla Firefox · 隐私浏览', relative: 'Mozilla Firefox/firefox.exe', args: ['-private-window', URL] },
];

export async function resolveBrowser(id, { env = process.env, canAccess = p => access(p, constants.F_OK) } = {}) {
  const definition = DEFINITIONS.find(browser => browser.id === id);
  if (!definition) throw new Error('请选择 Chrome、Edge 或 Firefox。');
  const roots = [env.PROGRAMFILES || 'C:\\Program Files', env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', env.LOCALAPPDATA];
  for (const root of roots.filter(Boolean)) {
    const executable = path.win32.join(root, definition.relative);
    try { await canAccess(executable); return { ...definition, executable, args: [...definition.args] }; }
    catch { /* Try the next standard installation location. */ }
  }
  throw new Error('未找到所选浏览器，请先安装到标准位置，再重新打开工具。');
}

export async function availableBrowsers() {
  return Promise.all(DEFINITIONS.map(async ({ id, label }) => ({
    id, label, available: await resolveBrowser(id).then(() => true, () => false),
  })));
}

export class BrowserLauncher {
  constructor({ resolve = resolveBrowser, spawnProcess = spawn } = {}) {
    this.resolve = resolve;
    this.spawnProcess = spawnProcess;
    this.busy = false;
    this.state = { status: 'idle' };
  }
  snapshot() { return { ...this.state }; }
  async start(browserId) {
    if (this.busy) throw new Error('正在发送启动请求，请稍候。');
    this.busy = true;
    this.state = { status: 'launching' };
    try {
      const browser = await this.resolve(browserId);
      // Fixed arguments, no shell, credential, or automation/debugging connection.
      const child = this.spawnProcess(browser.executable, browser.args, {
        shell: false, detached: true, stdio: 'ignore', windowsHide: false,
      });
      await new Promise((resolve, reject) => {
        child.once('error', () => reject(new Error('浏览器启动失败，请确认安装完整且未被系统策略禁止。')));
        child.once('spawn', resolve);
      });
      const ownState = { status: 'launch_requested', browser: browserId };
      this.state = ownState;
      child.once('exit', code => {
        if (code && this.state === ownState) this.state = { status: 'error', message: '浏览器进程异常退出。请尝试从桌面直接打开该浏览器。' };
      });
      child.unref();
      return this.snapshot();
    } catch (error) {
      this.state = { status: 'error', message: error.message };
      throw error;
    } finally { this.busy = false; }
  }
}
