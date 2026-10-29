import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import express from 'express';
import { probeTelegramApi, type TelegramTransport } from '../server/services/telegram-api';
import { registerAdminTelegramDiagnostics } from '../server/adminTelegramDiagnosticsRoutes';

const token = '123456:diagnostic_fixture_secret';
const secretData = `https://api.telegram.org/bot${token}/getMe private-chat bot-name`;
const reply = (status: number, body: unknown): TelegramTransport => async () => ({
  status, body: typeof body === 'string' ? body : JSON.stringify(body),
});
function assertSafe(result: Awaited<ReturnType<typeof probeTelegramApi>>) {
  assert.deepEqual(Object.keys(result).sort(), ['category', 'durationMs', 'ok']);
  assert.equal(Number.isInteger(result.durationMs), true);
  assert.ok(result.durationMs >= 0 && result.durationMs <= 11000);
  for (const value of [token, 'api.telegram.org', 'private-chat', 'bot-name']) {
    assert.ok(!JSON.stringify(result).includes(value));
  }
}

test('getMe uses only the common transport, no chat payload and no bot data in its result', async () => {
  let calls = 0;
  const result = await probeTelegramApi({ token, transport: async (url, body, timeout) => {
    calls++;
    assert.equal(url.pathname, `/bot${token}/getMe`);
    assert.equal(url.hostname, 'api.telegram.org');
    assert.equal(body, '{}');
    assert.equal(timeout, 10000);
    return { status: 200, body: JSON.stringify({ ok: true, result: { id: 1, is_bot: true, username: 'bot-name', private: secretData } }) };
  } });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.category, 'ok');
  assertSafe(result);
});

test('missing configuration performs no request', async () => {
  const result = await probeTelegramApi({ token: '', transport: async () => { throw new Error('must not run'); } });
  assert.equal(result.category, 'not_configured');
  assertSafe(result);
});

for (const [code, category] of [
  ['ENOTFOUND', 'dns'], ['EAI_AGAIN', 'dns'], ['CERT_HAS_EXPIRED', 'tls'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls'], ['ETIMEDOUT', 'timeout'],
  ['EPROTO', 'tls'], ['ERR_SSL_WRONG_VERSION_NUMBER', 'tls'], ['ERR_TLS_HANDSHAKE_TIMEOUT', 'timeout'],
  ['UND_ERR_CONNECT_TIMEOUT', 'timeout'], ['ECONNREFUSED', 'refused'],
  ['ECONNRESET', 'refused'], ['ENETUNREACH', 'refused'], ['UNKNOWN_SECRET_CODE', 'unavailable'],
  ['TELEGRAM_RESPONSE_TOO_LARGE', 'invalid_response'],
] as const) {
  test(`safe category for ${code}, no retry or raw error logging`, async context => {
    const logs: unknown[] = [];
    context.mock.method(console, 'error', (...args) => logs.push(args));
    context.mock.method(console, 'log', (...args) => logs.push(args));
    context.mock.method(console, 'warn', (...args) => logs.push(args));
    let calls = 0;
    const result = await probeTelegramApi({ token, transport: async () => {
      calls++;
      throw Object.assign(new Error(secretData), { cause: { code, description: secretData } });
    } });
    assert.equal(result.ok, false);
    assert.equal(result.category, category);
    assert.equal(calls, 1);
    assertSafe(result);
    assert.deepEqual(logs, []);
  });
}

test('non-JSON, malformed envelopes and provider errors never disclose their bodies', async () => {
  for (const [status, body, category] of [
    [502, `<html>${secretData}</html>`, 'invalid_response'],
    [200, '', 'invalid_response'], [200, '{', 'invalid_response'],
    [200, null, 'invalid_response'], [200, [], 'invalid_response'],
    [200, { ok: 'true', description: secretData }, 'invalid_response'],
    [401, secretData, 'invalid_token'], [404, secretData, 'invalid_token'],
    [200, { ok: false, error_code: 401, description: secretData }, 'invalid_token'],
    [403, { ok: false, description: secretData }, 'refused'],
    [429, { ok: false, parameters: { retry_after: 500 }, description: secretData }, 'refused'],
    [500, { ok: true, result: secretData }, 'refused'],
  ] as const) {
    const result = await probeTelegramApi({ token, transport: reply(status, body) });
    assert.equal(result.category, category);
    assert.equal(result.ok, false);
    assertSafe(result);
  }
});

test('default getMe transport enforces its absolute timeout without leaking its URL', async context => {
  let calls = 0;
  const request = new EventEmitter() as any;
  request.end = () => {};
  request.destroy = (error: Error) => request.emit('error', error);
  context.mock.method(https, 'request', ((options: any) => {
    calls++;
    assert.equal(options.path, `/bot${token}/getMe`);
    return request;
  }) as any);
  // Accelerate the transport's real deadline without waiting ten seconds.
  const realTimeout = globalThis.setTimeout;
  context.mock.method(globalThis, 'setTimeout', ((fn: any, ms: number) => {
    assert.equal(ms, 10000);
    return realTimeout(fn, 5);
  }) as any);
  const result = await probeTelegramApi({ token });
  assert.equal(result.category, 'timeout');
  assert.equal(calls, 1);
  assertSafe(result);
});

test('both routes use their established authentication and admin guards', async () => {
  const mini = await readFile(new URL('../server/routes.ts', import.meta.url), 'utf8');
  const web = await readFile(new URL('../server/webRoutes.ts', import.meta.url), 'utf8');
  assert.match(mini, /registerAdminTelegramDiagnostics\(app, '\/api', \[verifyTelegramInitData, requireAdmin\]\)/);
  assert.match(web, /registerAdminTelegramDiagnostics\(app, '\/web-api', \[requireWebAuth, requireWebAdmin\]\)/);
});

test('real Telegram and web auth: anonymous/customer denied, admins allowed, POST only', async context => {
  // Fixture credentials only; database operations are mocked, never customer data.
  process.env.TELEGRAM_BOT_TOKEN = token;
  const { storage } = await import('../server/storage');
  const { db } = await import('../server/db');
  const { verifyTelegramInitData } = await import('../server/middleware/verifyTelegramInitData');
  const { requireAdmin } = await import('../server/middleware/requireAdmin');
  const { requireWebAuth, requireWebAdmin } = await import('../server/webRoutes');
  const { generateAccessToken } = await import('../server/services/web-auth');
  context.mock.method(storage, 'getUser', (async (id: string) => ({ id })) as any);
  context.mock.method(storage, 'isAdmin', async (id: string) => id === '1');
  let isAdmin = false;
  context.mock.method(db, 'select', (() => ({
    from: () => ({ where: async () => [{ isAdmin, isMasterAdmin: false }] }),
  })) as any);
  let calls = 0;
  const app = express();
  const probe = async () => {
    calls++;
    return probeTelegramApi({ token, transport: reply(200, { ok: true, result: secretData }) });
  };
  registerAdminTelegramDiagnostics(app, '/api', [verifyTelegramInitData, requireAdmin], probe);
  registerAdminTelegramDiagnostics(app, '/web-api', [requireWebAuth, requireWebAdmin], probe);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const signed = (id: number, expired = false) => {
    const params = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000) - (expired ? 172800 : 0)),
      user: JSON.stringify({ id, first_name: 'Fixture' }),
    });
    const input = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const key = createHmac('sha256', 'WebAppData').update(token).digest();
    params.set('hash', createHmac('sha256', key).update(input).digest('hex'));
    return params.toString();
  };
  for (const prefix of ['/api', '/web-api']) {
    const url = `${base}${prefix}/admin/telegram/diagnostics`;
    const headersFor = (admin: boolean) => prefix === '/api'
      ? { 'x-telegram-init-data': signed(admin ? 1 : 2) }
      : { Authorization: `Bearer ${generateAccessToken({ id: admin ? 'admin' : 'customer', email: null, firstName: 'Fixture' })}` };
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: prefix === '/api'
      ? { 'x-telegram-init-data': 'invalid' } : { Authorization: 'Bearer invalid' } })).status, 401);
    isAdmin = false;
    assert.equal((await fetch(url, { method: 'POST', headers: headersFor(false) })).status, 403);
    if (prefix === '/api') {
      assert.equal((await fetch(url, { method: 'POST', headers: { 'x-telegram-init-data': signed(1, true) } })).status, 401);
    }
    assert.equal(calls, prefix === '/api' ? 0 : 1);
    isAdmin = true;
    const result = await fetch(url, { method: 'POST', headers: headersFor(true) });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assertSafe(await result.json());
    assert.equal((await fetch(url, { headers: headersFor(true) })).status, 404);
  }
  assert.equal(calls, 2);
});
