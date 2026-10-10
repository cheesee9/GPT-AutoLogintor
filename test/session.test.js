import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSession, validateToken } from '../lib/session.js';

const fakeToken = n => `eyJhbGciOiJkaXIifQ..a.${'x'.repeat(n - 24)}.z`;
test('extract full JSON locally without changing the token', () => {
  const token = fakeToken(4443);
  const parsed = parseSession(JSON.stringify({ sessionToken: token, accessToken: 'unused', user: { email: 'test@example.invalid' } }, null, 2));
  assert.equal(parsed.token, token);
  assert.equal(parsed.email, 'test@example.invalid');
  assert.equal(parsed.bytes, 4443);
});
test('reject invalid data without echoing credentials', () => {
  assert.throws(() => parseSession('{bad'), /JSON/);
  assert.throws(() => parseSession('[]'), /JSON/);
  assert.throws(() => parseSession('{"accessToken":"secret-never-echo"}'), /sessionToken/);
  for (const token of ['abc def.a.b', 'abc\ndef.a.b', 'abc\\_def.a.b', 'not-a-token']) {
    assert.throws(() => validateToken(token), error => !error.message.includes(token));
  }
  assert.throws(() => validateToken(fakeToken(33000)), /32 KB/);
});
