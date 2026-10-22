import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { checkRelease } from '../scripts/check-release.mjs';

const expected = 'a'.repeat(64);
const js = 'console.log("release test")';
const css = 'body{color:red}';
const sha = text => createHash('sha256').update(text).digest('hex');

async function fixture(t, mode = 'good') {
  const requests = [];
  let checks = 0;
  const server = createServer((req, res) => {
    requests.push([req.method, req.url]);
    const url = new URL(req.url, 'http://local').pathname;
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'hang') return;
    if (url === '/healthz') {
      checks++;
      if (mode === 'html-health') {
        res.setHeader('Content-Type', 'text/html');
        return res.end('<html>SPA fallback</html>');
      }
      if (mode === 'bad-json') return res.end('private response invalid json');
      if (mode === 'http-error') { res.statusCode = 502; return res.end('private upstream'); }
      const degraded = mode === 'degraded';
      if (degraded) res.statusCode = 503;
      return res.end(JSON.stringify({
        buildId: mode === 'old' || (mode === 'eventual' && checks === 1) ? 'b'.repeat(64) : expected,
        status: degraded ? 'degraded' : 'ok', db: 'reachable',
        startup: { routes: degraded ? 'failed' : 'ready', frontend: 'ready', migrations: 'ready', seed: 'ready' },
      }));
    }
    if (url === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(`<head><meta name="release-id" content="${mode === 'old-frontend' ? 'b'.repeat(64) : expected}"><script src="/assets/app.js"></script><link href="/assets/app.css"></head>`);
    }
    if (url === '/release.json') return res.end(JSON.stringify({
      buildId: mode === 'old-manifest' ? 'b'.repeat(64) : expected,
      assets: [
        { path: mode === 'unsafe' ? '//evil.example/app.js' : '/assets/app.js', sha256: sha(js) },
        { path: '/assets/app.css', sha256: sha(css) },
        { path: '/assets/lazy.js', sha256: sha(js) },
      ],
    }));
    if (url === '/assets/app.css') {
      res.setHeader('Content-Type', 'text/css');
      return res.end(css);
    }
    if (mode === 'missing-asset') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<html>fallback for missing file</html>');
    }
    res.setHeader('Content-Type', 'application/javascript');
    res.end(mode === 'corrupt' ? 'stale' : js);
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

test('checks all entry and lazy assets, read-only without authentication', async t => {
  const { origin, requests } = await fixture(t);
  const logs = [];
  assert.equal(await checkRelease({ origin, expected, timeoutMs: 2000, log: line => logs.push(line) }), true);
  assert.ok(requests.every(([method]) => method === 'GET'));
  assert.ok(requests.some(([, url]) => url.startsWith('/assets/lazy.js')));
  assert.match(logs.join('\n'), /UI autenticata non verificata/);
});

for (const [mode, message] of [
  ['old', /versione diversa online/], ['degraded', /avvio degradato/],
  ['html-health', /fallback HTML/], ['old-frontend', /frontend di una versione diversa/],
  ['old-manifest', /manifest frontend non coerente/], ['unsafe', /manifest asset non valido/],
  ['missing-asset', /fallback HTML/], ['corrupt', /contenuto asset frontend non coerente/],
  ['bad-json', /JSON non valido/], ['http-error', /HTTP 502/], ['hang', /timeout/],
]) {
  test(`fails bounded and safely: ${mode}`, async t => {
    const { origin } = await fixture(t, mode);
    const logs = [];
    const started = Date.now();
    assert.equal(await checkRelease({ origin, expected, timeoutMs: 200, requestMs: 70, intervalMs: 50, log: line => logs.push(line) }), false);
    assert.ok(Date.now() - started < 1000);
    assert.match(logs.join('\n'), message);
    assert.match(logs.at(-1), /SCADUTO/);
    assert.ok(!logs.join('\n').includes('private'));
  });
}

test('retries a previous release and succeeds before deadline', async t => {
  const { origin } = await fixture(t, 'eventual');
  assert.equal(await checkRelease({ origin, expected, timeoutMs: 2000, intervalMs: 5, log() {} }), true);
});

test('invalid identifiers and unbounded deadlines are rejected before requests', async () => {
  await assert.rejects(checkRelease({ expected: 'secret-url' }), /Build ID/);
  for (const timeoutMs of [0, NaN, Infinity, 600001]) {
    await assert.rejects(checkRelease({ expected, timeoutMs }), /Scadenza/);
  }
  await assert.rejects(checkRelease({ expected, origin: 'https://user:pass@example.com' }), /origine/);
});
