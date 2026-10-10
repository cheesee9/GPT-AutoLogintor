// Shared by the browser UI and Node. No storage, network, or logging here.
export const MAX_TOKEN_LENGTH = 32768;
export const MAX_INPUT_LENGTH = 131072;

export function validateToken(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('没有找到 sessionToken 字段，accessToken 是另一个字段。');
  }
  const token = value.trim();
  if (token.length > MAX_TOKEN_LENGTH) throw new Error('令牌超过本工具的 32 KB 上限，请检查是否误粘贴了整段 JSON。');
  if (/\s/.test(token)) throw new Error('令牌内部含空格或换行。请从原始 JSON 重新提取；工具不会擅自修改凭证。');
  if (token.includes('\\')) throw new Error('令牌含反斜杠，可能经过 Markdown 转义。请从原始会话页面重新复制。');
  if (!/^[A-Za-z0-9._-]+$/.test(token)) throw new Error('令牌含非预期字符，请勿包含引号、逗号或字段名。');
  const parts = token.split('.');
  const jwt = parts.length === 3 && parts.every(Boolean);
  const jwe = parts.length === 5 && [0, 2, 3, 4].every(i => parts[i]);
  if (!jwt && !jwe) throw new Error('内容不是预期的完整令牌格式，请检查是否复制完整。');
  return token;
}

export function parseSession(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('请先粘贴完整 Session JSON。');
  if (raw.length > MAX_INPUT_LENGTH) throw new Error('输入过大，请只粘贴会话接口返回的 JSON。');
  let data;
  try { data = JSON.parse(raw.trim()); }
  catch { throw new Error('JSON 格式不正确。请复制从 { 到 } 的完整内容，不要附带说明文字或代码围栏。'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('需要一个 JSON 对象。');
  const token = validateToken(data.sessionToken);
  return {
    token,
    email: typeof data.user?.email === 'string' ? data.user.email.slice(0, 254) : '',
    expires: typeof data.expires === 'string' ? data.expires.slice(0, 80) : '',
    bytes: token.length,
  };
}
