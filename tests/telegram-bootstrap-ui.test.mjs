import assert from 'node:assert/strict';
import { test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';
const sdk = `window.Telegram={WebApp:{
  initData:'fixture-bootstrap-data',initDataUnsafe:{user:{id:999999998,first_name:'Fixture'}},
  colorScheme:'light',themeParams:{},version:'8.0',platform:'web',
  ready(){window.fixtureReady=true},expand(){window.fixtureExpanded=true},enableClosingConfirmation(){},
  onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},isVersionAtLeast(){return true},
  BackButton:{show(){},hide(){},onClick(){},offClick(){}},
  MainButton:{show(){},hide(){},onClick(){},offClick(){},setText(){},setParams(){}},
  HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}
}};`;

async function fixture(browser, telegramMode = 'hold') {
  const page = await browser.newPage();
  const state = { sdkRequests: [], apiHeaders: [] };
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `if('serviceWorker' in navigator) navigator.serviceWorker.register=async()=>({});`,
  });
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
    { urlPattern: '*/api/*' }, { urlPattern: '*/web-api/*' },
    ...(process.env.BOOTSTRAP_BUILD_DIR ? [
      { urlPattern: '*', resourceType: 'Document' }, { urlPattern: '*/assets/*' },
    ] : []),
  ] });
  page.on('Fetch.requestPaused', async event => {
    if (event.request.url.includes('telegram-web-app.js')) {
      state.sdkRequests.push(event.requestId);
      if (telegramMode === 'fail') await page.send('Fetch.failRequest', {
        requestId: event.requestId, errorReason: 'ConnectionFailed',
      });
      return; // Keep the remote SDK indefinitely pending unless explicitly released.
    }
    if (process.env.BOOTSTRAP_BUILD_DIR
      && (event.resourceType === 'Document' || new URL(event.request.url).pathname.startsWith('/assets/'))) {
      const path = event.resourceType === 'Document' ? '/index.html' : new URL(event.request.url).pathname;
      const content = await readFile(join(process.env.BOOTSTRAP_BUILD_DIR, path));
      const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
      await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: type }], body: content.toString('base64') });
      return;
    }
    state.apiHeaders.push(event.request.headers);
    const path = new URL(event.request.url).pathname;
    const denied = path === '/web-api/auth/refresh' || path === '/web-api/admin/check';
    const body = path === '/web-api/products' ? { products: [], total: 0 }
      : path === '/api/cart' ? { items: [], total: 0 }
      : path.includes('fortune') ? { spinTokens: 0 } : [];
    await page.send('Fetch.fulfillRequest', { requestId: event.requestId,
      responseCode: denied ? 401 : 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    });
  });
  return { page, state };
}

test('website starts without any Telegram request on root, storefront, catalog and admin, desktop and mobile', {
  skip: !base, timeout: 120000,
}, async () => {
  const browser = await launchBrowser();
  try {
    for (const width of [1280, 390]) {
      const { page, state } = await fixture(browser);
      await page.setViewport({ width, height: 850, mobile: width < 500 });
      for (const path of ['/', '/web', '/web/catalog', '/web/admin']) {
        await page.send('Page.navigate', { url: `${base}${path}` });
        try {
          await page.wait(path === '/web/admin'
            ? `!!document.querySelector('input[type="password"]')`
            : `!!document.querySelector('header')`, 45000);
        } catch (error) {
          throw new Error(`Website failed at ${path}, width ${width}: ${JSON.stringify(await page.evaluate(
            `({path:location.pathname,text:document.body.innerText.slice(0,600),readyState:document.readyState})`
          ))}`, { cause: error });
        }
        assert.equal(await page.evaluate(`document.querySelector('#root').innerText.length > 20`), true);
        assert.equal(state.sdkRequests.length, 0, 'storefront must never request Telegram');
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test('delayed Mini App SDK loads before App imports and supplies fresh authentication', {
  skip: !base, timeout: 45000,
}, async () => {
  const browser = await launchBrowser();
  try {
    const { page, state } = await fixture(browser);
    await page.send('Page.navigate', { url: `${base}/#tgWebAppData=fixture&tgWebAppVersion=8.0` });
    await page.wait(`!!document.querySelector('script[src*="telegram-web-app.js"]')`);
    assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="nav-bottom"]')`), false);
    assert.equal(state.sdkRequests.length, 1);
    await page.send('Fetch.fulfillRequest', { requestId: state.sdkRequests[0], responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
      body: Buffer.from(sdk).toString('base64'),
    });
    await page.wait(`window.fixtureReady && window.fixtureExpanded && !!document.querySelector('[data-testid="nav-bottom"]')`);
    await page.wait(`document.querySelector('#root').innerText.length>20`);
    assert.ok(state.apiHeaders.some(headers => Object.entries(headers).some(([key, value]) =>
      key.toLowerCase() === 'x-telegram-init-data' && value === 'fixture-bootstrap-data')));
    assert.equal(await page.evaluate(`location.pathname`), '/');
    await page.close();
  } finally { await browser.close(); }
});

for (const mode of ['hold', 'fail']) {
  test(`Mini App SDK ${mode === 'hold' ? 'timeout' : 'network failure'} shows recovery, never a silent web session`, {
    skip: !base, timeout: 30000,
  }, async () => {
    const browser = await launchBrowser();
    try {
      const { page, state } = await fixture(browser, mode);
      await page.send('Page.navigate', { url: `${base}/#tgWebAppData=fixture` });
      await page.wait(`!!document.querySelector('[role="alert"]')`, 18000);
      assert.equal(await page.evaluate(`document.querySelector('#root button').textContent`), 'Повторить');
      assert.equal(state.sdkRequests.length, 1);
      assert.equal(state.apiHeaders.length, 0, 'no app/API calls before Mini App SDK is ready');
      await page.click('#root a[href="/web"]');
      await page.wait(`!!document.querySelector('header')`);
      assert.equal(state.sdkRequests.length, 1, 'explicit website recovery skips Telegram');
      await page.close();
    } finally { await browser.close(); }
  });
}
