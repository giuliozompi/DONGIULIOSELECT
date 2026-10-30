import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkPublicBrowser } from '../scripts/release-browser.mjs';

const expected = 'a'.repeat(64);

async function fixture(t, mode) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url, headers: req.headers });
    const path = new URL(req.url, 'http://local').pathname;
    if (path === '/web-api/products' || path === '/web-api/categories') {
      res.setHeader('Content-Type', 'application/json');
      if (mode === 'api401') res.statusCode = 401;
      return res.end('[]');
    }
    if (path === '/assets/lazy.js') {
      res.setHeader('Content-Type', 'application/javascript');
      return res.end('throw new Error("private late exception");');
    }
    if (path === '/assets/app.js') {
      if (mode === 'hang') return;
      if (mode === 'asset404') res.statusCode = 404;
      res.setHeader('Content-Type', 'application/javascript');
      return res.end(`
        history.replaceState(null, '', '/web');
        ${mode === 'throw' ? 'throw new Error("private runtime detail");' : ''}
        ${mode === 'rejection' ? 'Promise.reject(new Error("private rejection"));' : ''}
        ${mode === 'console' ? 'console.error("private error boundary detail");' : ''}
        ${mode === 'blank' ? '' : `
          document.querySelector('#root').innerHTML = '<header>Don Giulio</header><main><h1>Home</h1><button data-testid="button-hero-catalog">Catalog</button></main><footer>Footer</footer>';
        `}
        fetch('/web-api/auth/refresh', {method: 'POST'}).then(r => r.json());
        fetch('/web-api/products?limit=8');
        fetch('/web-api/categories');
        ${mode === 'write' ? `fetch('/web-api/auth/register', {method:'POST',body:'must not arrive'}).catch(() => {});` : ''}
        ${mode === 'protected' ? `fetch('/web-api/orders').catch(() => {});` : ''}
        ${mode === 'redirect' ? `location.href = '/web/account';` : ''}
        ${mode === 'lazy' ? `setTimeout(() => import('/assets/lazy.js'), 500);` : ''}
        ${mode === 'worker' ? `navigator.serviceWorker.register('/sw.js').catch(() => {});` : ''}
        ${mode === 'external' ? `fetch('https://example.invalid/collect', {method:'POST'}).catch(() => {});` : ''}
      `);
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<meta name="release-id" content="${mode === 'version' ? 'b'.repeat(64) : expected}">
      <link rel="icon" type="image/png" href="/icon-192.png">
      <script src="https://telegram.org/js/telegram-web-app.js"></script>
      <div id="root"></div><script type="module" src="/assets/app.js"></script>`);
  });
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { origin: `http://127.0.0.1:${server.address().port}`, requests };
}

async function run(t, mode, timeoutMs = 12000) {
  const { origin, requests } = await fixture(t, mode);
  const promise = checkPublicBrowser({
    origin, expected, assets: ['/assets/app.js', '/assets/lazy.js'], timeoutMs,
  });
  return { promise, requests };
}

test('real Chromium renders home, tolerates local anonymous 401 and never sends auth or SW requests', async t => {
  const { promise, requests } = await run(t, 'worker');
  const result = await promise;
  assert.equal(result.status, 'ok');
  assert.equal(result.anonymous401, 1);
  assert.ok(result.blockedOptional >= 1);
  assert.ok(requests.some(r => r.path.startsWith('/web-api/products')));
  assert.ok(requests.every(r => r.method === 'GET'));
  assert.ok(requests.every(r => !r.headers.cookie && !r.headers.authorization));
  assert.ok(requests.every(r => !/auth|sw\.js|orders|account/.test(r.path)));
});

for (const [mode, reason] of [
  ['throw', /JavaScript/], ['rejection', /JavaScript/], ['console', /JavaScript/],
  ['lazy', /JavaScript/], ['asset404', /essenziale/], ['api401', /essenziale/],
  ['version', /versione/], ['write', /non consentita/],
  ['protected', /non consentita/], ['external', /non consentita/],
  ['redirect', /non consentita/],
]) {
  test(`browser fails safely: ${mode}`, async t => {
    const { promise, requests } = await run(t, mode);
    await assert.rejects(promise, error => {
      assert.match(error.message, reason);
      assert.doesNotMatch(error.message, /private|must not arrive/);
      return true;
    });
    assert.ok(requests.every(r => r.method === 'GET'));
    assert.ok(requests.every(r => !/auth|orders|account/.test(r.path)));
  });
}

for (const mode of ['blank', 'hang']) {
  test(`overall deadline includes startup and incomplete rendering: ${mode}`, async t => {
    const start = Date.now();
    const { promise } = await run(t, mode, 1500);
    await assert.rejects(promise, /scadenza/);
    assert.ok(Date.now() - start < 3500);
  });
}

test('missing Chromium fails explicitly rather than passing HTTP-only', async t => {
  const previous = process.env.CHROMIUM_PATH;
  process.env.CHROMIUM_PATH = '/missing-release-test-chromium';
  t.after(() => {
    if (previous === undefined) delete process.env.CHROMIUM_PATH;
    else process.env.CHROMIUM_PATH = previous;
  });
  const { promise } = await run(t, 'good');
  await assert.rejects(promise, /Chromium/);
});
