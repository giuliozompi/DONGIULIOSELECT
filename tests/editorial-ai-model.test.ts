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
for (const [name, detail, expected] of [
  ['key budget', { metadata: { limit_source: 'openrouter_key_limit', remedy_hint: sensitive } }, /лимит расходов/],
  ['workspace budget', { metadata: { limit_source: 'openrouter_workspace_budget' } }, /лимит расходов/],
  ['guardrail budget', { metadata: { limit_source: 'openrouter_guardrail_budget' } }, /лимит расходов/],
  ['budget legacy message', { message: `Budget limit exceeded (weekly limit). ${sensitive}` }, /лимит расходов/],
  ['content filter', { metadata: { error_type: 'content_policy_violation', raw: sensitive } }, /политикой содержимого/],
  ['refusal', { metadata: { error_type: 'refusal' } }, /политикой содержимого/],
  ['country code', { metadata: { provider_code: 'unsupported_country_region_territory' } }, /страны или региона/],
  ['country message', { message: `Country, region, or territory not supported. ${sensitive}` }, /страны или региона/],
  ['model region message', { message: 'This model is not available in your region.' }, /страны или региона/],
  ['upstream JSON', { metadata: { raw: JSON.stringify({ error: { code: 'unsupported_country_region_territory', message: sensitive } }) } }, /страны или региона/],
  ['upstream object', { metadata: { raw: { error: { message: 'Country, region, or territory not supported.' } } } }, /страны или региона/],
  ['guardrail', { message: 'Request blocked: prompt injection patterns detected', metadata: { patterns: [sensitive] } }, /правилом безопасности/],
  ['unknown reason', { message: sensitive, metadata: { error_type: sensitive, raw: sensitive } }, /запретил доступ/],
  ['invalid metadata', { message: sensitive, metadata: null }, /запретил доступ/],
  ['empty pattern list', { message: sensitive, metadata: { patterns: [] } }, /запретил доступ/],
  ['prompt echoed outside error fields', { message: sensitive, metadata: { raw: JSON.stringify({ prompt: 'This model is not available in your region.' }) } }, /запретил доступ/],
] as const) {
  for (const status of [403, 200]) {
    test(`${name}: safe 403 reason survives HTTP ${status} without retries`, async () => {
      const mock = requester({ error: { code: 403, message: sensitive, ...detail } }, status);
      await assert.rejects(mock.request('system', {}), error => {
        assert.ok(error instanceof EditorialModelError);
        assert.match(error.message, expected);
        assert.ok(!error.message.includes(sensitive));
        return true;
      });
      assert.equal(mock.calls(), 1);
    });
  }
}
test('HTML access denial is distinguished from a JSON provider refusal', async () => {
  const client = new OpenAI({
    apiKey: sensitive, maxRetries: 0,
    fetch: async () => new Response(`<html>${sensitive}</html>`, { status: 403, headers: { 'Content-Type': 'text/html' } }),
  });
  await assert.rejects(createEditorialModelRequester(client)('system', {}), error => {
    assert.ok(error instanceof EditorialModelError);
    assert.match(error.message, /HTML.*вместо JSON/);
    assert.ok(!error.message.includes(sensitive));
    return true;
  });
});
test('non-403 failures are not reclassified by untrusted metadata', async () => {
  const mock = requester({ error: { message: sensitive, metadata: { limit_source: 'openrouter_key_limit' } } }, 500);
  await assert.rejects(mock.request('system', {}), /временно недоступен/);
});
