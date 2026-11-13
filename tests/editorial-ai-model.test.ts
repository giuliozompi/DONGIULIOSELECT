import assert from 'node:assert/strict';
import { test } from 'node:test';
import OpenAI from 'openai';
import { createEditorialModelRequester, createConfiguredEditorialRequester, EditorialModelError, DEFAULT_EDITORIAL_AI_MODEL, getEditorialModelSettings, parseEditorialJson } from '../server/services/editorial-ai-model';
import { sourceResponseError } from '../server/services/editorial-ai-sources';

const sensitive = 'SECRET_PROVIDER_PAYLOAD';
test('complete JSON fences are normalized without repairing or extracting model output', () => {
  for (const text of ['{"ok":true}', '```json\n{"ok":true}\n```', '```\r\n{"ok":true}\r\n```', '\uFEFF{"ok":true}']) {
    assert.deepEqual(parseEditorialJson(text), { ok: true });
  }
  for (const text of [
    'Comment\n{"ok":true}', '```json\n{"ok":true}\n```\nComment',
    '```json\n{"ok":true}', '{"ok":true,}', '{"ok":',
    'null', '[]', '"text"', '{"ok":true}{"other":true}', `{"secret":"${sensitive}`,
  ]) {
    assert.throws(() => parseEditorialJson(text), error => {
      assert.ok(error instanceof EditorialModelError);
      assert.match(error.message, /некорректный JSON/);
      assert.ok(!error.message.includes(sensitive));
      return true;
    });
  }
});
test('source diagnostics distinguish HTTP refusals, missing pages and unsupported content', () => {
  assert.match(sourceResponseError(403, 'text/html')!, /HTTP 403.*другую/);
  assert.match(sourceResponseError(404, 'text/html')!, /не найдена.*HTTP 404/);
  assert.match(sourceResponseError(429, 'text/html')!, /частоту.*HTTP 429/);
  assert.match(sourceResponseError(503, 'text/html')!, /HTTP 503/);
  assert.match(sourceResponseError(200, 'application/pdf')!, /PDF/);
  assert.match(sourceResponseError(200, 'text/html', 'gzip')!, /сжатие/);
  assert.equal(sourceResponseError(200, 'text/html; charset=utf-8'), undefined);
});
test('a complete fenced response succeeds with one provider call, but truncated fences never do', async () => {
  const valid = requester(completion('```json\n{"ok":true}\n```'));
  assert.deepEqual(await valid.request('system', {}), { ok: true });
  assert.equal(valid.calls(), 1);
  const truncated = requester(completion('```json\n{"ok":true}\n```', 'length'));
  await assert.rejects(truncated.request('system', {}), /лимит длины/);
  assert.equal(truncated.calls(), 1);
});
test('Timeweb length termination rejects even valid-looking JSON without retry or increasing the token budget', async () => {
  for (const content of ['{"fields":{"history":"Незавершённая история"}}', '{"fields":']) {
    let calls = 0;
    const request = createConfiguredEditorialRequester(timewebEnv, async (_url, init) => {
      calls++;
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.max_tokens, 6000);
      assert.equal(sent.reasoning, undefined);
      return new Response(JSON.stringify(completion(content, 'length')), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    });
    await assert.rejects(request('system', {}), error => {
      assert.ok(error instanceof EditorialModelError);
      assert.match(error.message, /6000 токенов/);
      assert.match(error.message, /статья не изменена/);
      assert.match(error.message, /Автоматического повтора нет/);
      assert.ok(!error.message.includes('сократите число источников'));
      return true;
    });
    assert.equal(calls, 1);
  }
});
function requester(body: unknown, status = 200) {
  let calls = 0;
  let sentBody: Record<string, unknown> | undefined;
  const client = new OpenAI({
    apiKey: 'test-only-not-a-real-key', maxRetries: 0,
    fetch: async (_url, init) => {
      calls++;
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    },
  });
  return { request: createEditorialModelRequester(client), calls: () => calls, body: () => sentBody };
}
test('Timeweb draft budget is 12000 while other operations remain at 6000, without retries', async () => {
  const budgets: number[] = [];
  const request = createConfiguredEditorialRequester(timewebEnv, async (_url, init) => {
    const sent = JSON.parse(String(init?.body));
    budgets.push(sent.max_tokens);
    assert.equal(sent.reasoning, undefined);
    return new Response(JSON.stringify(completion('{"ok":true}')), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.deepEqual(await request('draft', {}, { purpose: 'draft' }), { ok: true });
  assert.deepEqual(await request('catalog', {}), { ok: true });
  assert.deepEqual(await request('suggestions', {}), { ok: true });
  assert.deepEqual(budgets, [12000, 6000, 6000]);
});
test('draft truncation remains rejected with sanitized numeric usage and no retry', async () => {
  for (const content of ['{"fields":{"history":"looks complete"}}', '{"fields":']) {
    const mock = requester({
      ...completion(content, 'length'),
      usage: { prompt_tokens: 2300, completion_tokens: 12000,
        completion_tokens_details: { reasoning_tokens: 10000, secret: sensitive }, secret: sensitive },
    });
    await assert.rejects(mock.request('draft', {}, { purpose: 'draft' }), error => {
      assert.ok(error instanceof EditorialModelError);
      assert.match(error.message, /12000 токенов/);
      assert.match(error.message, /вход: 2300, выход: 12000, рассуждение: 10000/);
      assert.match(error.message, /статья не изменена/);
      assert.match(error.message, /Автоматического повтора нет/);
      assert.ok(!error.message.includes(sensitive));
      return true;
    });
    assert.equal(mock.calls(), 1);
    assert.equal(mock.body()?.max_tokens, 12000);
  }
});
test('a completed draft above the previous budget is accepted in one call', async () => {
  const mock = requester({
    ...completion('{"fields":{"history":"Полная история из источников"},"citations":[],"warnings":[]}'),
    usage: { prompt_tokens: 2300, completion_tokens: 8100 },
  });
  assert.deepEqual(await mock.request('draft', {}, { purpose: 'draft' }), {
    fields: { history: 'Полная история из источников' }, citations: [], warnings: [],
  });
  assert.equal(mock.body()?.max_tokens, 12000);
  assert.equal(mock.calls(), 1);
});
test('untrusted usage values are omitted from length diagnostics', async () => {
  for (const usage of [undefined, sensitive, {
    prompt_tokens: sensitive, completion_tokens: -1,
    completion_tokens_details: { reasoning_tokens: 1.5 },
  }, { prompt_tokens: 1e100, completion_tokens: { secret: sensitive } }]) {
    const mock = requester({ ...completion('{"ok":true}', 'length'), usage });
    await assert.rejects(mock.request('draft', {}, { purpose: 'draft' }), error => {
      assert.ok(error instanceof EditorialModelError);
      assert.ok(!error.message.includes(sensitive));
      assert.ok(!error.message.includes('Счётчики'));
      return true;
    });
    assert.equal(mock.calls(), 1);
  }
});
function completion(content: string | null, finish_reason = 'stop') {
  return { choices: [{ message: { role: 'assistant', content }, finish_reason }] };
}
const timewebEnv = {
  EDITORIAL_AI_PROVIDER: 'timeweb',
  // Synthetic ID, not a claim about the live Timeweb catalogue.
  EDITORIAL_AI_MODEL: 'google/test-gemini-flash',
  TIMEWEB_AI_API_KEY: 'test-only-timeweb-key',
  OPENROUTER_API_KEY: 'test-only-openrouter-key',
};
test('adding a Timeweb key does not change the default provider', () => {
  const settings = getEditorialModelSettings({ TIMEWEB_AI_API_KEY: sensitive });
  assert.equal(settings.provider, 'openrouter');
  assert.equal(settings.baseURL, 'https://openrouter.ai/api/v1');
  assert.equal(settings.keyName, 'OPENROUTER_API_KEY');
  assert.equal(settings.model, DEFAULT_EDITORIAL_AI_MODEL);
});
test('Timeweb requires an explicit API model ID and rejects a display name', () => {
  for (const model of ['', '   ', 'Gemini 3.5 Flash']) {
    assert.throws(() => getEditorialModelSettings({
      ...timewebEnv, EDITORIAL_AI_MODEL: model,
    }), /API-код модели/);
  }
  assert.throws(() => getEditorialModelSettings({ EDITORIAL_AI_PROVIDER: 'untrusted-provider' }), /провайдер/);
});
test('a missing Timeweb key never falls back to the OpenRouter key', () => {
  assert.throws(() => createConfiguredEditorialRequester({
    ...timewebEnv, TIMEWEB_AI_API_KEY: ' ',
  }), /TIMEWEB_AI_API_KEY/);
});
test('Timeweb uses its fixed URL, isolated key and explicit model without OpenRouter extensions', async () => {
  let calls = 0;
  const request = createConfiguredEditorialRequester(timewebEnv, async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api.timeweb.ai/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${timewebEnv.TIMEWEB_AI_API_KEY}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, timewebEnv.EDITORIAL_AI_MODEL);
    assert.equal(body.reasoning, undefined);
    assert.equal(body.models, undefined);
    assert.equal(body.max_tokens, 6000);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.equal(body.messages[0].role, 'system');
    return new Response(JSON.stringify(completion('{"ok":true}')), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.deepEqual(await request('Return strict JSON', {}), { ok: true });
  assert.equal(calls, 1);
});
for (const status of [400, 401, 402, 403, 429, 503]) {
  test(`Timeweb HTTP ${status} is sanitized without retry or fallback`, async () => {
    let calls = 0;
    const request = createConfiguredEditorialRequester(timewebEnv, async url => {
      calls++;
      assert.ok(String(url).startsWith('https://api.timeweb.ai/'));
      return new Response(JSON.stringify({ error: { code: status, message: sensitive } }), {
        status, headers: { 'Content-Type': 'application/json' },
      });
    });
    await assert.rejects(request('system', {}), error => {
      assert.ok(error instanceof EditorialModelError);
      assert.ok(!error.message.includes(sensitive));
      assert.ok(!error.message.includes('OpenRouter'));
      if ([401, 402, 403].includes(status)) assert.match(error.message, /Timeweb AI Gateway/);
      return true;
    });
    assert.equal(calls, 1);
  });
}
test('Timeweb embedded string error codes in HTTP 200 are not accepted as a draft', async () => {
  let calls = 0;
  const request = createConfiguredEditorialRequester(timewebEnv, async () => {
    calls++;
    return new Response(JSON.stringify({ error: { code: '503', message: sensitive } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  await assert.rejects(request('system', {}), /временно недоступен/);
  assert.equal(calls, 1);
});
test('Timeweb transport failures do not leak secrets or mention the wrong provider', async () => {
  const request = createConfiguredEditorialRequester(timewebEnv, async () => { throw new Error(sensitive); });
  await assert.rejects(request('system', {}), error => {
    assert.ok(error instanceof EditorialModelError);
    assert.match(error.message, /соединиться с Timeweb AI Gateway/);
    assert.ok(!error.message.includes(sensitive));
    return true;
  });
});
test('Timeweb invalid JSON fails without removing JSON requirements or retrying', async () => {
  let calls = 0;
  const request = createConfiguredEditorialRequester(timewebEnv, async () => {
    calls++;
    return new Response(JSON.stringify(completion('invalid-json')), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  await assert.rejects(request('system', {}), /некорректный JSON/);
  assert.equal(calls, 1);
});
test('editorial requests use Gemini JSON without model fallback or hidden thinking by default', async () => {
  const settings = getEditorialModelSettings();
  assert.equal(DEFAULT_EDITORIAL_AI_MODEL, 'google/gemini-2.5-flash');
  const mock = requester(completion('{"ok":true}'));
  assert.deepEqual(await mock.request('Source-based editorial system', { name: 'Formaggio' }), { ok: true });
  assert.equal(mock.body()?.model, settings.model);
  assert.deepEqual(mock.body()?.response_format, { type: 'json_object' });
  if (settings.provider === 'openrouter' && settings.model === DEFAULT_EDITORIAL_AI_MODEL) {
    assert.deepEqual(mock.body()?.reasoning, { enabled: false });
  } else {
    assert.equal(mock.body()?.reasoning, undefined);
  }
  assert.equal(mock.body()?.max_tokens, 6000);
  assert.equal(mock.body()?.models, undefined);
  assert.equal(mock.calls(), 1);
});
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
