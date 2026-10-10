import { parseSession } from '/session.js';

const $ = id => document.getElementById(id);
const localKey = location.hash.slice(1);
document.querySelector('.brand').href = `/#${localKey}`;
let extracted = null;
let busy = false;
let configured = false;

function message(id, text = '') { $(id).textContent = text; $(id).hidden = !text; }
async function api(route, body) {
  const response = await fetch(`/api/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-Local-Key': localKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '本地服务未完成请求。');
  return data;
}
function resetResult() {
  extracted = null;
  $('extracted-token').value = '';
  $('extracted-token').type = 'password';
  $('reveal-extracted').textContent = '显示';
  $('reveal-extracted').setAttribute('aria-pressed', 'false');
  $('extract-result').hidden = true;
  $('account-email').textContent = '—';
  $('token-size').textContent = '—';
  $('copy-token').textContent = '复制令牌';
  message('extract-error');
}
function clearExtract() { resetResult(); $('session-json').value = ''; }
$('session-json').addEventListener('input', resetResult);
$('extract').addEventListener('click', () => {
  resetResult();
  try {
    extracted = parseSession($('session-json').value);
    $('extracted-token').value = extracted.token;
    $('account-email').textContent = extracted.email || 'JSON 未提供邮箱';
    $('token-size').textContent = `${extracted.bytes.toLocaleString()} 字节`;
    $('extract-result').hidden = false;
  } catch (error) { message('extract-error', error.message); }
});
$('clear-extract').addEventListener('click', clearExtract);
$('clear-all').addEventListener('click', clearExtract);
$('copy-token').addEventListener('click', async () => {
  if (!extracted) return;
  try { await navigator.clipboard.writeText(extracted.token); $('copy-token').textContent = '已复制'; }
  catch { message('extract-error', '浏览器未允许复制，可显示后手动复制。'); }
});
$('reveal-extracted').addEventListener('click', () => {
  const show = $('extracted-token').type === 'password';
  $('extracted-token').type = show ? 'text' : 'password';
  $('reveal-extracted').textContent = show ? '隐藏' : '显示';
  $('reveal-extracted').setAttribute('aria-pressed', String(show));
});
const descriptions = {
  idle: ['等待打开浏览器', '未启动', '选择本机浏览器，以无痕或隐私模式打开 ChatGPT。'],
  launching: ['正在唤起浏览器', '处理中', '正在向所选浏览器发送启动请求。'],
  launch_requested: ['已发送打开请求', '请查看浏览器', '请确认窗口显示“无痕 / InPrivate / 隐私浏览”，然后在网页中正常登录。本工具不读取登录状态。'],
  error: ['浏览器未能启动', '错误', '请确认浏览器已经安装。'],
};
function syncButtons() { $('launch').disabled = busy || !configured; $('browser').disabled = busy || !configured; }
function renderStatus(state) {
  const [title, label, description] = descriptions[state.status] || descriptions.idle;
  $('status-title').textContent = title;
  $('status-label').textContent = label;
  $('status-description').textContent = state.message || description;
  syncButtons();
}
$('launch').addEventListener('click', async () => {
  if (busy || !configured) return;
  busy = true; message('login-error'); renderStatus({ status: 'launching' });
  try { renderStatus(await api('launch', { browser: $('browser').value })); }
  catch (error) { renderStatus({ status: 'error' }); message('login-error', error.message); }
  finally { busy = false; syncButtons(); }
});
async function initialize() {
  if (!/^[a-f0-9]{64}$/.test(localKey)) {
    message('connection', '缺少本地访问密钥，请从 start.cmd 重新打开。左侧仍可离线提取。');
    return;
  }
  try {
    const config = await api('config');
    $('browser').replaceChildren();
    for (const browser of config.browsers) {
      const option = new Option(browser.label + (browser.available ? '' : ' · 未检测到'), browser.id);
      option.disabled = !browser.available;
      $('browser').add(option);
    }
    const first = config.browsers.find(browser => browser.available);
    configured = Boolean(first);
    if (first) $('browser').value = first.id;
    else message('connection', '未检测到标准位置安装的 Chrome、Edge 或 Firefox。安装后重新打开工具。');
    renderStatus(await api('status'));
  } catch { message('connection', '本地服务连接失败，请重新运行 start.cmd。'); }
}
await initialize();
window.addEventListener('pagehide', clearExtract);
