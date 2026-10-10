import { validateToken } from './session.js';

const SITE = 'https://chatgpt.com/';
const COOKIE = '__Secure-next-auth.session-token';
const CHUNK_SIZE = 3800;
const sessionName = name => name === COOKIE || /^__Secure-next-auth\.session-token\.\d+$/.test(name);
const scopedCookie = cookie => sessionName(cookie.name) && ['chatgpt.com', '.chatgpt.com'].includes(cookie.domain) && cookie.path === '/' && !cookie.partitionKey;

export function cookiePlan(raw, storeId) {
  const token = validateToken(raw);
  const count = Math.ceil(token.length / CHUNK_SIZE);
  return Array.from({ length: count }, (_, i) => ({
    url: SITE, storeId, path: '/',
    name: count === 1 ? COOKIE : `${COOKIE}.${i}`,
    value: token.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    secure: true, httpOnly: true, sameSite: 'lax',
    // No domain: host-only cookie. No expirationDate: browser-session lifetime.
  }));
}

export function createController(api) {
  let busy = false;
  async function target(tabId) {
    if (!api.extension.inIncognitoContext) throw new Error('请在无痕 / InPrivate 窗口中打开扩展。先在扩展详情页开启“允许在无痕模式下运行”。');
    if (!Number.isInteger(tabId) || tabId < 0) throw new Error('未找到目标标签页，请重新打开扩展。');
    const tab = await api.tabs.get(tabId);
    if (!tab.incognito) throw new Error('目标不是无痕标签页，已停止操作。');
    let origin;
    try { origin = new URL(tab.url).origin; } catch { origin = ''; }
    if (origin !== 'https://chatgpt.com') throw new Error('请先在当前隐私窗口打开 https://chatgpt.com/，再使用扩展。');
    const stores = await api.cookies.getAllCookieStores();
    const matches = stores.filter(store => store.tabIds.includes(tabId));
    if (matches.length !== 1) throw new Error('无法唯一确定无痕 Cookie 存储区，已停止操作。');
    return { tabId, storeId: matches[0].id };
  }
  async function read(storeId) {
    return (await api.cookies.getAll({ url: SITE, storeId })).filter(scopedCookie);
  }
  async function clear(storeId) {
    // Remove only this application's root session cookies, never Cloudflare cookies.
    const cookies = await read(storeId);
    for (const cookie of cookies) await api.cookies.remove({ url: SITE, storeId, name: cookie.name });
    if ((await read(storeId)).length) throw new Error('旧登录 Cookie 未能完全清除，已停止导入。');
    return cookies.length;
  }
  async function sameTarget(expected) {
    const current = await target(expected.tabId);
    if (current.storeId !== expected.storeId) throw new Error('目标窗口已变化，已停止操作。');
  }
  return {
    async run(message) {
      if (!message || !['status', 'import', 'clear'].includes(message.action)) return { ok: false, message: '不支持的操作。' };
      if (busy) return { ok: false, message: '正在处理上一次操作，请稍候。' };
      busy = true;
      let plan = [];
      let destination;
      let mutationStarted = false;
      try {
        // Validate before touching existing cookies.
        if (message.action === 'import') plan = cookiePlan(message.token, 'pending');
        destination = await target(message.tabId);
        if (message.action === 'status') return { ok: true, ready: true, message: '当前目标：ChatGPT 无痕会话。' };
        for (const cookie of plan) cookie.storeId = destination.storeId;
        await sameTarget(destination);
        mutationStarted = true;
        const removed = await clear(destination.storeId);
        if (message.action === 'clear') return { ok: true, message: `已清除 ${removed} 条登录 Cookie。请手动刷新网页；这不是服务端撤销，也不清除其他网页存储。` };
        for (const cookie of plan) {
          await sameTarget(destination);
          if (!(await api.cookies.set(cookie))) throw new Error('Cookie 写入失败。');
        }
        const actual = await read(destination.storeId);
        if (actual.length !== plan.length || !plan.every(wanted => actual.some(cookie =>
          cookie.name === wanted.name && cookie.value === wanted.value && cookie.secure && cookie.httpOnly))) {
          throw new Error('Cookie 写入校验未通过。');
        }
        await sameTarget(destination);
        // Navigate only after all fragments are written and verified; no challenge interaction.
        try { await api.tabs.reload(destination.tabId); }
        catch { return { ok: true, message: `已写入 ${plan.length} 条登录 Cookie，请手动刷新目标页。尚未验证登录结果。` }; }
        return { ok: true, message: `已写入 ${plan.length} 条登录 Cookie，并刷新目标页。请在网页中核对账号；写入成功不代表登录成功。` };
      } catch (error) {
        if (mutationStarted && destination) {
          try { await clear(destination.storeId); }
          catch { return { ok: false, message: '操作失败且未能确认清理结果。请关闭该浏览器的全部无痕窗口后重新开始。' }; }
          return { ok: false, message: '操作未完成，已清除目标存储区内的登录 Cookie。请检查目标页及扩展权限后重试。' };
        }
        // Only our own validation/context errors may be shown. Never echo browser API errors.
        const safe = error instanceof Error && /^(请|目标|未找到目标|无法唯一|没有找到|令牌|内容不是)/.test(error.message);
        return { ok: false, message: safe ? error.message : '无法访问目标窗口。请检查扩展的网站权限和无痕权限，再重新打开扩展。' };
      } finally {
        for (const cookie of plan) cookie.value = '';
        if (message.action === 'import') message.token = '';
        busy = false;
      }
    },
  };
}
