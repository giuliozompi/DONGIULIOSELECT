import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import { getAccessToken, setAccessToken, WebApiError, webApi } from '../client/src/web/lib/webApi';

const STORAGE_KEY = 'dgs_web_access_token';
const EXPIRED_TOKEN = 'fixture-expired-token';
const FRESH_TOKEN = 'fixture-renewed-token';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

function fixture(t: TestContext, retryStatus = 200) {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
    },
  });
  setAccessToken(EXPIRED_TOKEN);
  const initial = [deferred<Response>(), deferred<Response>()];
  const refresh = deferred<Response>();
  const nextRefresh = deferred<Response>();
  const requests: { path: string; method: string; authorization: string | null;
    credentials: RequestCredentials | undefined; body: BodyInit | null | undefined }[] = [];
  const unexpected: string[] = [];
  const counts = new Map<string, number>();
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    const count = (counts.get(path) ?? 0) + 1;
    counts.set(path, count);
    requests.push({
      path, method: init?.method ?? 'GET',
      authorization: new Headers(init?.headers).get('Authorization'),
      credentials: init?.credentials, body: init?.body,
    });
    if (path === '/web-api/auth/refresh' && count <= 2) {
      return count === 1 ? refresh.promise : nextRefresh.promise;
    }
    const index = ['/web-api/addresses', '/web-api/wishlist'].indexOf(path);
    if (index !== -1 && count === 1) return initial[index].promise;
    if (index !== -1 && count === 2) {
      return json(retryStatus === 200 ? { saved: path } : { error: `retry denied: ${path}` }, retryStatus);
    }
    if (path === '/web-api/probe' && count <= 2) {
      return count === 1 ? json({ error: 'expired again' }, 401) : json({ ok: true });
    }
    unexpected.push(`${init?.method} ${path} #${count}`);
    throw new Error(`Unexpected fixture request: ${unexpected.at(-1)}`);
  });
  t.after(() => {
    // Release held fetches even if an assertion fails; no network is ever used.
    initial.forEach(response => response.resolve(json({ error: 'cleanup' }, 401)));
    refresh.resolve(json({ error: 'cleanup' }, 401));
    nextRefresh.resolve(json({ error: 'cleanup' }, 401));
    setAccessToken(null);
    if (previousStorage) Object.defineProperty(globalThis, 'sessionStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
    assert.deepEqual(unexpected, []);
  });
  return { initial, refresh, nextRefresh, requests, stored };
}

for (const scenario of [
  { name: 'successful refresh', outcome: 'success', retryStatus: 200 },
  { name: 'successful refresh but retries still return 401', outcome: 'success', retryStatus: 401 },
  { name: 'refresh returns 401', outcome: 'unauthorized', retryStatus: 200 },
  { name: 'refresh returns 503', outcome: 'unavailable', retryStatus: 200 },
  { name: 'refresh rejects with a network error', outcome: 'network', retryStatus: 200 },
  { name: 'refresh returns malformed JSON', outcome: 'malformed', retryStatus: 200 },
  { name: 'refresh returns no access token', outcome: 'missing-token', retryStatus: 200 },
] as const) {
  test(`concurrent protected requests share one pending refresh: ${scenario.name}`, { timeout: 5000 }, async t => {
    const { initial, refresh, nextRefresh, requests, stored } = fixture(t, scenario.retryStatus);
    let settled = false;
    const pending = Promise.allSettled([
      webApi.delete('/addresses'),
      webApi.put('/wishlist', { productIds: ['fixture-cheese'] }),
    ]).then(results => { settled = true; return results; });
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(r => r.authorization), [
      `Bearer ${EXPIRED_TOKEN}`, `Bearer ${EXPIRED_TOKEN}`,
    ]);

    // Both protected responses become unauthorized before the held refresh completes.
    initial[0].resolve(json({ error: 'addresses expired' }, 401));
    initial[1].resolve(json({ error: 'wishlist expired' }, 401));
    // Drain microtasks, including both request continuations, without a timed sleep.
    await setImmediate();
    assert.equal(settled, false);
    assert.equal(getAccessToken(), EXPIRED_TOKEN);
    assert.deepEqual(requests.map(r => [r.method, r.path]), [
      ['DELETE', '/web-api/addresses'],
      ['PUT', '/web-api/wishlist'],
      ['POST', '/web-api/auth/refresh'],
    ], 'only one refresh may start and neither protected request may retry while it is pending');
    assert.equal(requests[2].credentials, 'include');
    assert.equal(requests[2].authorization, null);

    switch (scenario.outcome) {
      case 'success': refresh.resolve(json({ accessToken: FRESH_TOKEN })); break;
      case 'unauthorized': refresh.resolve(json({ error: 'refresh denied' }, 401)); break;
      case 'unavailable': refresh.resolve(json({ error: 'refresh unavailable' }, 503)); break;
      case 'network': refresh.reject(new TypeError('fixture network failure')); break;
      case 'malformed': refresh.resolve(new Response('{invalid JSON', { status: 200 })); break;
      case 'missing-token': refresh.resolve(json({ user: { id: 'fixture-same-account' } })); break;
    }
    const results = await pending;
    const refreshed = scenario.outcome === 'success';
    assert.equal(requests.filter(r => r.path === '/web-api/auth/refresh').length, 1);
    assert.equal(getAccessToken(), refreshed ? FRESH_TOKEN : null);
    assert.equal(stored.get(STORAGE_KEY) ?? null, refreshed ? FRESH_TOKEN : null);
    for (const [index, path] of ['/web-api/addresses', '/web-api/wishlist'].entries()) {
      const attempts = requests.filter(r => r.path === path);
      assert.equal(attempts.length, refreshed ? 2 : 1);
      const result = results[index];
      if (refreshed) {
        assert.deepEqual(attempts[1], { ...attempts[0], authorization: `Bearer ${FRESH_TOKEN}` },
          'retry must preserve method, body and credentials, using only the renewed token');
      }
      if (refreshed && scenario.retryStatus === 200) {
        assert.equal(result.status, 'fulfilled');
        if (result.status === 'fulfilled') assert.deepEqual(result.value, { saved: path });
      } else {
        assert.equal(result.status, 'rejected');
        if (result.status === 'rejected') {
          assert.ok(result.reason instanceof WebApiError);
          assert.equal(result.reason.status, 401);
          const error = refreshed ? `retry denied: ${path}` : `${index === 0 ? 'addresses' : 'wishlist'} expired`;
          assert.equal(result.reason.message, error);
          assert.deepEqual(result.reason.data, { error });
        }
      }
    }
    assert.equal(requests.length, refreshed ? 5 : 3, 'no additional retry or refresh loop');
    assert.ok(requests.every(r => r.credentials === 'include'));

    // A completed refresh (successful or failed) must not remain cached forever.
    // This is a later expiry for the same account, not a login/account change.
    const probe = webApi.get('/probe');
    await setImmediate();
    assert.equal(requests.filter(r => r.path === '/web-api/auth/refresh').length, 2);
    assert.equal(requests.filter(r => r.path === '/web-api/probe').length, 1);
    nextRefresh.resolve(json({ accessToken: FRESH_TOKEN }));
    assert.deepEqual(await probe, { ok: true });
    assert.equal(requests.filter(r => r.path === '/web-api/probe').length, 2);
    assert.equal(getAccessToken(), FRESH_TOKEN);
  });
}
