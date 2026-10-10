const $ = id => document.getElementById(id);
let tabId;
let ready = false;
let busy = false;
function show(id, text, error = false) { $(id).textContent = text; $(id).hidden = false; $(id).className = error ? 'notice error' : 'notice'; }
function sync() { $('import').disabled = busy || !ready || !$('token').value.trim(); $('clear').disabled = busy || !ready; }
function erase() { $('token').value = ''; $('token').type = 'password'; $('reveal').textContent = '显示'; $('reveal').setAttribute('aria-pressed', 'false'); sync(); }
$('token').addEventListener('input', sync);
$('erase').addEventListener('click', erase);
$('reveal').addEventListener('click', () => {
  const visible = $('token').type === 'password';
  $('token').type = visible ? 'text' : 'password';
  $('reveal').textContent = visible ? '隐藏' : '显示';
  $('reveal').setAttribute('aria-pressed', String(visible));
});
async function act(action) {
  if (!ready || busy) return;
  busy = true; sync(); show('result', '正在处理，请稍候…');
  const message = { action, tabId, ...(action === 'import' ? { token: $('token').value } : {}) };
  erase();
  try {
    const result = await chrome.runtime.sendMessage(message);
    show('result', result?.message || '未收到操作结果，请重新打开扩展。', !result?.ok);
  } catch { show('result', '无法确认操作结果，请检查目标页或重新打开扩展。', true); }
  finally { message.token = ''; busy = false; sync(); }
}
$('import').addEventListener('click', () => act('import'));
$('clear').addEventListener('click', () => act('clear'));
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  const result = await chrome.runtime.sendMessage({ action: 'status', tabId });
  ready = Boolean(result?.ok && result.ready);
  show('target', result?.message || '无法识别目标窗口。', !ready);
} catch { show('target', '请在 ChatGPT 的无痕标签页中打开扩展，并检查无痕及网站权限。', true); }
sync();
window.addEventListener('pagehide', erase);
