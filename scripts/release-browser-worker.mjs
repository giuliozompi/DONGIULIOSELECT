import { launchBrowser } from '../tests/helpers/browser.mjs';
import { setTimeout as delay } from 'node:timers/promises';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const { origin, expected, assets } = JSON.parse(input);
const base = new URL(origin);
const allowedAssets = new Set(assets);
const publicApis = new Set(['/web-api/products', '/web-api/categories']);
let browser;
let status = 'unavailable';
let anonymous401 = 0;
let blockedOptional = 0;
const failures = new Set();
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  // Bypass alone does not prevent a new worker from making its own requests.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('Release smoke: service worker disabled'));
    }
    window.WebSocket = class { constructor() { throw new Error('Release smoke: WebSocket disabled'); } };
    window.EventSource = class { constructor() { throw new Error('Release smoke: EventSource disabled'); } };
  ` });
  page.on('Runtime.exceptionThrown', () => failures.add('javascript'));
  page.on('Runtime.consoleAPICalled', event => {
    if (event.type === 'error') failures.add('javascript');
  });
  const essentialRequests = new Set();
  const pending = new Set();
  page.on('Network.requestWillBeSent', ({ requestId, request }) => {
    const url = new URL(request.url);
    if (url.origin === base.origin &&
        (allowedAssets.has(url.pathname) || publicApis.has(url.pathname) || ['/', '/web', '/web/'].includes(url.pathname))) {
      essentialRequests.add(requestId);
      pending.add(requestId);
    }
  });
  page.on('Network.responseReceived', ({ requestId, response }) => {
    if (essentialRequests.has(requestId) && response.status >= 400) failures.add('network');
  });
  page.on('Network.loadingFailed', ({ requestId }) => {
    if (essentialRequests.has(requestId)) failures.add('network');
    pending.delete(requestId);
  });
  page.on('Network.loadingFinished', ({ requestId }) => pending.delete(requestId));
  page.on('Fetch.requestPaused', async ({ requestId, request, resourceType }) => {
    const url = new URL(request.url);
    // The app always attempts this POST on mount. Simulate anonymous state
    // locally; never send even a refresh/login request to the actual server.
    if (url.origin === base.origin && url.pathname === '/web-api/auth/refresh' && request.method === 'POST') {
      anonymous401++;
      await page.send('Fetch.fulfillRequest', {
        requestId, responseCode: 401,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from('{"error":"Unauthenticated"}').toString('base64'),
      });
      return;
    }
    const allowed = url.origin === base.origin && request.method === 'GET' &&
      (allowedAssets.has(url.pathname) || publicApis.has(url.pathname) ||
       (resourceType === 'Document' && ['/', '/web', '/web/'].includes(url.pathname)));
    if (!allowed) {
      // Images/fonts/third-party styles are outside this smoke's scope.
      if (request.method === 'GET' &&
          (['Image', 'Font', 'Stylesheet'].includes(resourceType) ||
           (url.origin === base.origin && ['/manifest.json', '/favicon.ico', '/icon-192.png', '/icon-512.png'].includes(url.pathname)) ||
           url.href === 'https://telegram.org/js/telegram-web-app.js')) blockedOptional++;
      else failures.add('policy');
      await page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      return;
    }
    await page.send('Fetch.continueRequest', {
      requestId,
      headers: Object.entries(request.headers)
        .filter(([key]) => !['cookie', 'authorization', 'proxy-authorization'].includes(key.toLowerCase()))
        .map(([name, value]) => ({ name, value })),
    });
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await page.send('Page.navigate', { url: new URL('/', base).href });
  const rendered = `(() => {
    const visible = selector => {
      const el = document.querySelector(selector);
      if (!el || !el.getClientRects().length) return false;
      const style = getComputedStyle(el);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };
    return ['/web', '/web/'].includes(location.pathname) &&
      visible('#root header') && visible('#root main h1') &&
      visible('#root main [data-testid="button-hero-catalog"]') && visible('#root footer');
  })()`;
  status = 'render';
  let stableSince = 0;
  const renderDeadline = Date.now() + 20000;
  while (Date.now() < renderDeadline) {
    if (failures.size) break;
    const ready = await page.evaluate(rendered);
    if (ready && pending.size === 0) {
      stableSince ||= Date.now();
      // Observe late lazy-import/runtime errors, not just the first DOM paint.
      if (Date.now() - stableSince >= 1500) {
        const version = await page.evaluate(`document.querySelector('meta[name="release-id"]')?.content`);
        status = version === expected ? 'ok' : 'version';
        break;
      }
    } else stableSince = 0;
    await delay(50);
  }
  status = ['javascript', 'policy', 'network'].find(key => failures.has(key)) || status;
  await browser.close();
} catch {
  status = failures.has('javascript') ? 'javascript' : 'unavailable';
}
// Never emit remote console messages, HTML, response bodies or URLs.
process.stdout.write(JSON.stringify({ status, anonymous401, blockedOptional }));
process.exit(0);
