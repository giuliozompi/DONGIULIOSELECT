import assert from 'node:assert/strict';
import { test } from 'node:test';
import OpenAI from 'openai';
import { createEditorialModelRequester, EditorialModelError } from '../server/services/editorial-ai-model';

const sensitive = 'SECRET_PROVIDER_PAYLOAD';
function requester(body: unknown, status = 200) {
  let calls = 0;
  const client = new OpenAI({
    apiKey: 'test-only-not-a-real-key', maxRetries: 0,
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    },
  });
  return { request: createEditorialModelRequester(client), calls: () => calls };
}
function completion(content: string | null, finish_reason = 'stop') {
  return { choices: [{ message: { role: 'assistant', content }, finish_reason }] };
}
for (const [status, expected] of [
  [400, /параметры/], [401, /ключ API/], [402, /баланс/], [403, /запретил/],
  [404, /Модель/], [408, /время ожидания/], [422, /параметры/],
  [429, /лимит запросов/], [500, /временно недоступен/], [503, /временно недоступен/],
] as const) {
  test(`HTTP ${status} gives a safe actionable error without retry`, async () => {
    const mock = requester({ error: { message: sensitive, code: status } }, status);
    await assert.rejects(mock.request('system', {}), error => {
      assert.ok(error instanceof EditorialModelError);
      assert.match(error.message, expected);
      assert.ok(!error.message.includes(sensitive));
      return true;
    });
    assert.equal(mock.calls(), 1);
  });
}
test('HTTP 200 with upstream error is not treated as an incomplete draft', async () => {
  const mock = requester({ error: { code: 402, message: sensitive } });
  await assert.rejects(mock.request('system', {}), /баланс/);
  assert.equal(mock.calls(), 1);
});
for (const [body, expected] of [
  [completion('{"items": []}'), null],
  [completion('{"items":', 'length'), /лимит длины/],
  [completion('not json'), /некорректный JSON/],
  [completion(null, 'content_filter'), /отказался/],
  [completion(null), /пустой/],
  [{}, /пустой/],
] as const) {
  test(`completion validation: ${expected || 'valid JSON'}`, async () => {
    const mock = requester(body);
    if (expected) await assert.rejects(mock.request('system', {}), expected);
    else assert.deepEqual(await mock.request('system', {}), { items: [] });
    assert.equal(mock.calls(), 1);
  });
}
test('network errors never expose credentials or raw provider diagnostics', async () => {
  const client = new OpenAI({ apiKey: sensitive, maxRetries: 0, fetch: async () => { throw new Error(sensitive); } });
  await assert.rejects(createEditorialModelRequester(client)('system', {}), error => {
    assert.ok(error instanceof EditorialModelError);
    assert.match(error.message, /соединиться/);
    assert.ok(!error.message.includes(sensitive));
    return true;
  });
});
test('timeout is distinguished from connection failures', async () => {
  const { editorialProviderError } = await import('../server/services/editorial-ai-model');
  const error = editorialProviderError(new OpenAI.APIConnectionTimeoutError());
  assert.match(error.message, /время ожидания/);
});
