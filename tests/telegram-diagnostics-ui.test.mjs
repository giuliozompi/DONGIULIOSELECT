import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './helpers/browser.mjs';

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const button = '[data-testid="button-telegram-diagnostics"]';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(context, mini) {
  const page = await browser.newPage();
  context.after(() => page.close());
  await page.send('Network.enable');
  await page.send('Network.setBypassServiceWorker', { bypass: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if ('serviceWorker' in navigator) navigator.serviceWorker.register = () => new Promise(() => {});
    window.Telegram={WebApp:{
      initData:'fixture-telegram-data',initDataUnsafe:{user:{id:999999998,first_name:'Fixture'}},
      colorScheme:'light',themeParams:{},version:'8.0',platform:'web',
      ready(){},expand(){},enableClosingConfirmation(){},onEvent(){},offEvent(){},
      setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},isVersionAtLeast(){return true},
      BackButton:{show(){},hide(){},onClick(){},offClick(){}},
      MainButton:{show(){},hide(){},onClick(){},offClick(){},setText(){},setParams(){}},
      HapticFeedback:{impactOccurred(){},notificationOccurred(){}}
    }};` });
  const state = { requests: [], pending: null, unauthorized: false };
  const fulfill = (id, body, status = 200) => page.send('Fetch.fulfillRequest', {
    requestId: id, responseCode: status,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    body: Buffer.from(JSON.stringify(body)).toString('base64'),
  });
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' },
    { urlPattern: '*telegram-web-app.js*' }, { urlPattern: '*api.telegram.org*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    if (path.endsWith('/admin/telegram/diagnostics')) {
      assert.equal(event.request.method, 'POST');
      assert.ok(mini ? event.request.headers['x-telegram-init-data'] : event.request.headers.Authorization);
      state.requests.push(event.request);
      state.pending = event.requestId;
      return;
    }
    if (path.endsWith('/auth/refresh')) {
      await fulfill(event.requestId, state.unauthorized ? { error: 'fixture raw error' } : {
        accessToken: 'fixture-admin-token',
        user: { id: 'fixture-admin', firstName: 'Fixture', isAdmin: true, isEmailVerified: true },
      }, state.unauthorized ? 401 : 200);
    } else if (path.endsWith('/admin/check')) {
      await fulfill(event.requestId, { ok: true, isAdmin: true, isMasterAdmin: false });
    } else if (path.includes('telegram-web-app.js')) {
      await page.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, body: '' });
    } else if (event.request.method === 'GET' && !event.request.url.includes('api.telegram.org')) {
      await fulfill(event.requestId, []);
    } else if (path.startsWith('/api/analytics')) {
      await fulfill(event.requestId, { ok: true });
    } else {
      await page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      throw new Error(`Unexpected request blocked: ${path}`);
    }
  });
  await page.send('Page.navigate', { url: mini ? `${base}/admin?section=settings` : `${base}/web/admin/settings` });
  await page.wait(`!!document.querySelector('${button}')`);
  return { page, state, fulfill };
}

for (const mini of [false, true]) {
  test(`${mini ? 'Mini App' : 'web'}: manual only, single pending request, safe results and manual recovery`, async context => {
    const { page, state, fulfill } = await fixture(context, mini);
    await delay(250);
    assert.equal(state.requests.length, 0);
    await page.evaluate(`(() => {
      const b = document.querySelector('${button}');
      b.click(); b.click(); b.click();
    })()`);
    await page.wait(`document.querySelector('${button}').disabled`);
    while (!state.pending) await delay(20);
    assert.equal(state.requests.length, 1);
    await fulfill(state.pending, { ok: false, category: 'dns', durationMs: 123 });
    state.pending = null;
    await page.wait(`document.querySelector('[role="status"]').textContent.includes('Ошибка DNS')`);
    assert.match(await page.evaluate(`document.querySelector('[role="status"]').textContent`), /123 мс/);
    assert.equal(await page.evaluate(`document.querySelector('${button}').disabled`), false);
    await page.send('Page.bringToFront');
    await delay(250);
    assert.equal(state.requests.length, 1);
    await page.click(button);
    while (!state.pending) await delay(20);
    assert.equal(await page.evaluate(`document.querySelector('[role="status"]').textContent.includes('Ошибка DNS')`), false);
    await fulfill(state.pending, { ok: true, category: 'ok', durationMs: 42 });
    state.pending = null;
    await page.wait(`document.querySelector('[role="status"]').textContent.includes('Соединение установлено')`);
    const screenshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    await writeFile(`/tmp/telegram-diagnostics-${mini ? 'mini' : 'web'}.jpg`, Buffer.from(screenshot.data, 'base64'));
    await page.click(button);
    while (!state.pending) await delay(20);
    await fulfill(state.pending, { error: 'SECRET_RAW_ERROR bot123:fixture-private-token' }, 500);
    state.pending = null;
    await page.wait(`document.querySelector('[role="status"]').textContent.includes('Проверка недоступна')`);
    assert.equal(await page.evaluate(`document.body.textContent.includes('SECRET_RAW_ERROR')`), false);
    await delay(250);
    assert.equal(state.requests.length, 3);
    assert.equal(await page.evaluate(`document.querySelector('${button}').disabled`), false);
  });
}
