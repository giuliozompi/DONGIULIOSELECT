import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerReleaseHealth, startup, buildId } from '../server/release-health';

test('health is uncached, safe, and fail-closed for every startup component', async () => {
  const app = express();
  let fail = false;
  registerReleaseHealth(app, async () => {
    if (fail) throw new Error('postgres://private:password@private-host/customer');
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/healthz`;
  try {
    let response = await fetch(url);
    assert.equal(response.status, 503);
    for (const key of Object.keys(startup)) startup[key as keyof typeof startup] = 'ready';
    response = await fetch(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).buildId, buildId);
    for (const key of Object.keys(startup)) {
      startup[key as keyof typeof startup] = 'failed';
      assert.equal((await fetch(url)).status, 503);
      startup[key as keyof typeof startup] = 'ready';
    }
    fail = true;
    response = await fetch(url);
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.ok(!text.includes('password'));
    assert.ok(!text.includes('private-host'));
    assert.ok(!text.includes('dbError'));
    assert.equal(JSON.parse(text).db, 'unreachable');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
