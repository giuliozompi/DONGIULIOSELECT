import assert from 'node:assert/strict';
import { test } from 'node:test';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { sendTelegramApi, requestTelegramJson, type TelegramTransport } from '../server/services/telegram-api';

const token = '123456:fixture_token_not_real';
const payload = { chat_id: 'fixture-chat', text: 'private payment link https://payment.example.invalid/private' };
const reply = (status: number, body: unknown): TelegramTransport => async () => ({
  status, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('only HTTP success and an explicit API acceptance count as sent', async () => {
  assert.deepEqual(await sendTelegramApi('sendMessage', payload, { token, transport: reply(200, { ok: true }), log() {} }), { sent: true });
  for (const [status, body] of [[500, { ok: true }], [200, { ok: false, description: 'Rejected' }], [200, { ok: 'true' }]] as const) {
    assert.equal((await sendTelegramApi('sendMessage', payload, { token, transport: reply(status, body), log() {} })).sent, false);
  }
});

test('missing bot token performs no network request', async () => {
  let calls = 0;
  const result = await sendTelegramApi('sendMessage', payload, { token: '', transport: async () => {
    calls++; throw new Error('must not run');
  } });
  assert.equal(calls, 0);
  assert.match(result.error!, /токен бота не настроен/);
});

for (const [code, description] of [
  ['ENOTFOUND', /DNS/], ['EAI_AGAIN', /DNS/],
  ['ENETUNREACH', /хостинга/], ['ECONNREFUSED', /подключиться/],
  ['ETIMEDOUT', /Отправка не подтверждена/], ['ECONNRESET', /Отправка не подтверждена/],
  ['CERT_HAS_EXPIRED', /TLS/], ['ERR_TLS_CERT_ALTNAME_INVALID', /TLS/],
] as const) {
  test(`${code}: actionable safe diagnostics, no automatic retry`, async () => {
    let calls = 0;
    const logs: unknown[] = [];
    const result = await sendTelegramApi('sendMessage', payload, {
      token, log: event => logs.push(event),
      transport: async () => {
        calls++;
        throw Object.assign(new Error(`secret ${token} ${payload.text}`), { cause: { code } });
      },
    });
    assert.equal(result.sent, false);
    assert.equal(calls, 1);
    assert.match(result.error!, description);
    assert.match(result.error!, new RegExp(code));
    assert.ok(!JSON.stringify({ result, logs }).includes(token));
    assert.ok(!JSON.stringify({ result, logs }).includes(payload.text));
    assert.ok(!JSON.stringify(logs).includes(payload.chat_id));
  });
}

test('nested connection aggregate errors preserve their useful code only', async () => {
  const result = await sendTelegramApi('sendMessage', payload, { token, log() {}, transport: async () => {
    throw Object.assign(new Error('fetch failed'), { cause: { code: 'AGGREGATE', errors: [{ code: 'EHOSTUNREACH' }] } });
  } });
  assert.match(result.error!, /EHOSTUNREACH/);
});

test('HTML, malformed JSON and an empty HTTP 200 are not falsely called connection failures', async () => {
  for (const [status, body] of [[403, '<html>Access denied</html>'], [502, '{'], [200, '']] as const) {
    const result = await sendTelegramApi('sendMessage', payload, { token, log() {}, transport: reply(status, body) });
    assert.equal(result.sent, false);
    assert.match(result.error!, /некорректный ответ/);
    assert.match(result.error!, new RegExp(`HTTP ${status}`));
    assert.doesNotMatch(result.error!, /ошибка соединения с API/);
  }
});

test('provider rejection remains distinct, with sensitive tokens removed from all diagnostics', async () => {
  const logs: unknown[] = [];
  const result = await sendTelegramApi('sendMessage', payload, {
    token, log: event => logs.push(event),
    transport: reply(403, { ok: false, description: `Forbidden: bot was blocked ${token}` }),
  });
  assert.match(result.error!, /bot was blocked/);
  assert.ok(!JSON.stringify({ result, logs }).includes(token));
  assert.deepEqual(logs, [{ method: 'sendMessage', category: 'api_rejection', httpStatus: 403 }]);
});

test('Telegram rate-limit instructions are visible without retrying the POST', async () => {
  const result = await sendTelegramApi('sendMessage', payload, {
    token, log() {}, transport: reply(429, { ok: false, description: 'Too Many Requests', parameters: { retry_after: 600 } }),
  });
  assert.match(result.error!, /600 сек/);
});

test('transport uses IPv4, a fresh verified HTTPS connection, JSON and a bounded deadline', async context => {
  const request = new EventEmitter() as any;
  let captured: any;
  let written: string | undefined;
  context.mock.method(https, 'request', ((options: any, callback: any) => {
    captured = options;
    request.end = (body: string) => {
      written = body;
      const response = new EventEmitter() as any;
      response.statusCode = 200;
      callback(response);
      queueMicrotask(() => { response.emit('data', Buffer.from('{"ok":true}')); response.emit('end'); });
    };
    return request;
  }) as any);
  const result = await requestTelegramJson(new URL(`https://api.telegram.org/bot${token}/sendMessage`), JSON.stringify(payload), 1000);
  assert.equal(result.status, 200);
  assert.equal(captured.hostname, 'api.telegram.org');
  assert.equal(captured.family, 4);
  assert.equal(captured.agent.options.keepAlive, false);
  assert.notEqual(captured.rejectUnauthorized, false);
  assert.notEqual(captured.agent.options.rejectUnauthorized, false);
  assert.equal(captured.method, 'POST');
  assert.deepEqual(JSON.parse(written!), payload);
});

test('deadline covers a request stuck before the response, without sending a second request', async context => {
  const request = new EventEmitter() as any;
  let calls = 0;
  request.end = () => {};
  request.destroy = (error: Error) => request.emit('error', error);
  context.mock.method(https, 'request', (() => { calls++; return request; }) as any);
  await assert.rejects(requestTelegramJson(new URL(`https://api.telegram.org/bot${token}/sendMessage`), '{}', 5),
    (error: any) => error.code === 'ETIMEDOUT');
  assert.equal(calls, 1);
});

test('message, photo and album callers all use the common transport without exposing the real token', async context => {
  process.env.TELEGRAM_BOT_TOKEN = token;
  const bot = await import('../server/services/telegram-bot');
  const methods: string[] = [];
  context.mock.method(https, 'request', ((options: any, callback: any) => {
    methods.push(options.path.split('/').pop());
    const request = new EventEmitter() as any;
    request.end = () => {
      const response = new EventEmitter() as any;
      response.statusCode = 200;
      callback(response);
      queueMicrotask(() => { response.emit('data', Buffer.from('{"ok":true}')); response.emit('end'); });
    };
    return request;
  }) as any);
  assert.equal(await bot.sendPaymentLink('fixture-chat', 'fixture-order', '100', 'https://payment.example.invalid'), true);
  assert.equal(await bot.sendPhotoMessage('fixture-chat', 'https://images.example.invalid/photo.jpg'), true);
  assert.equal(await bot.sendMediaGroup('fixture-chat', ['https://images.example.invalid/photo.jpg']), true);
  assert.deepEqual(methods, ['sendMessage', 'sendPhoto', 'sendMediaGroup']);
});
