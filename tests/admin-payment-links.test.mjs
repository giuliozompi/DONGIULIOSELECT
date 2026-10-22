import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const action = 'button[aria-label="Повторно отправить ссылку на оплату"]';
const body = '(document.body?.textContent || "")';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(context, { failure = false, cooldown = false, loadFailure = false } = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const live = { posts: 0, failure, loadFailure };
  const summary = {
    paymentLinkSent: false, warning: 'Ни один канал не подтвердил отправку.',
    channels: [{ channel: 'email', status: 'failed', detail: 'Fixture email unavailable' },
      { channel: 'telegram', status: 'failed', detail: 'Fixture Telegram rejected' },
      { channel: 'whatsapp', status: 'skipped', detail: 'Канал отключён' }],
  };
  const order = {
    id: 'admin-order-cb7780', createdAt: '2026-10-22T10:00:00.000Z', status: 'СОБРАН',
    paymentMethod: 'yookassa', paymentId: 'fixture-intent', customerName: 'Fixture Customer',
    customerPhone: 'fixture-phone', amount: '100.00', items: [],
  };
  live.state = {
    canSend: !cooldown, serverNow: new Date().toISOString(), attemptsInHour: cooldown ? 1 : 0, limit: 3,
    retryAt: cooldown ? new Date(Date.now() + 60_000).toISOString() : undefined,
    reason: cooldown ? 'Пауза между отправками — 5 минут.' : undefined,
    history: [{ id: 'old-attempt', at: new Date(Date.now() - 7_200_000).toISOString(), status: 'failed', summary }],
  };
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' }, { urlPattern: '*telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    let status = 200; let result = [];
    if (path === '/web-api/auth/refresh') {
      result = { accessToken: 'test-only-admin-token',
        user: { id: 'fixture-admin', firstName: 'Fixture', isAdmin: true, isEmailVerified: true } };
    } else if (path === '/web-api/admin/check') result = { ok: true, isMasterAdmin: false };
    else if (path.endsWith('/resend-payment-link') && event.request.method === 'POST') {
      live.posts++;
      await new Promise(resolve => setTimeout(resolve, 180));
      const nextSummary = live.failure ? summary : {
        ...summary, paymentLinkSent: true, warning: 'Не все каналы приняли сообщение.',
        channels: summary.channels.map(channel => channel.channel === 'email'
          ? { ...channel, status: 'sent', detail: 'Принято сервисом. Доставка не подтверждена.' } : channel),
      };
      live.state = { ...live.state, canSend: false, attemptsInHour: 1,
        retryAt: new Date(Date.now() + 300_000).toISOString(), reason: 'Пауза между отправками — 5 минут.',
        history: [{ id: 'new-attempt', at: new Date().toISOString(),
          status: live.failure ? 'failed' : 'partial', summary: nextSummary }, ...live.state.history] };
      status = live.failure ? 502 : 200;
      result = live.failure ? { error: 'Не удалось отправить ссылку.' }
        : { order, paymentDelivery: nextSummary, paymentLinkSent: true,
          warning: nextSummary.warning, paymentLinkState: live.state };
    } else if (event.request.method !== 'GET') {
      await page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      throw new Error(`Unexpected mutation blocked: ${path}`);
    } else if (path.startsWith('/web-api/admin/orders')) {
      if (live.loadFailure) { status = 500; result = { error: 'Fixture history unavailable' }; }
      else {
        const enriched = { ...order, paymentLinkState: { ...live.state, serverNow: new Date().toISOString() } };
        result = path === '/web-api/admin/orders' ? [enriched] : enriched;
      }
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: path.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(path.includes('telegram-web-app') ? '' : JSON.stringify(result)).toString('base64'),
    });
  });
  return { page, live };
}

async function open(page) {
  await page.send('Page.navigate', { url: `${base}/web/admin/orders` });
  await page.wait(`!!document.querySelector(${JSON.stringify(action)})`);
}
const openDetail = page => page.click('tbody tr');

test('list and detail display persistent sending errors and channel outcomes after reload', async context => {
  const { page } = await fixture(context);
  await open(page);
  assert.match(await page.evaluate(body), /Последняя попытка: Ошибка/);
  await openDetail(page);
  await page.wait(`${body}.includes('Fixture Telegram rejected')`);
  assert.match(await page.evaluate(body), /Fixture email unavailable/);
  await page.send('Page.reload', { ignoreCache: true });
  await page.wait(`!!document.querySelector('tbody tr')`);
  await openDetail(page);
  await page.wait(`${body}.includes('Fixture Telegram rejected')`);
  const screenshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75, captureBeyondViewport: true });
  await writeFile('/tmp/admin-payment-links-fixture.jpg', Buffer.from(screenshot.data, 'base64'));
});

test('resend requires confirmation and cancelling does not send', async context => {
  const { page, live } = await fixture(context);
  await open(page);
  await page.evaluate('window.confirm=()=>false');
  await page.click(action);
  assert.equal(live.posts, 0);
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(action)}).disabled`), false);
});

test('double click sends once, records partial acceptance and survives reload', async context => {
  const { page, live } = await fixture(context);
  await open(page);
  await page.evaluate('window.confirm=()=>true');
  await page.click(action);
  await page.wait(`document.querySelector(${JSON.stringify(action)}).disabled`);
  await page.evaluate(`document.querySelector(${JSON.stringify(action)}).click()`);
  await page.wait(`${body}.includes('Частично принято')`);
  assert.equal(live.posts, 1);
  await page.send('Page.reload', { ignoreCache: true });
  await page.wait(`${body}.includes('Частично принято')`);
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(action)}).disabled`), true);
  await openDetail(page);
  await page.wait(`${body}.includes('Доставка не подтверждена')`);
  assert.match(await page.evaluate(body), /Telegram.*ошибка/);
});

test('failed POST refreshes persistent history, not only the error toast', async context => {
  const { page, live } = await fixture(context, { failure: true });
  await open(page);
  await page.evaluate('window.confirm=()=>true');
  await page.click(action);
  await page.wait(`${body}.includes('Попыток за час: 1 из 3')`);
  assert.equal(live.posts, 1);
  await page.send('Page.reload', { ignoreCache: true });
  await page.wait(`${body}.includes('Попыток за час: 1 из 3')`);
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(action)}).disabled`), true);
  await openDetail(page);
  await page.wait(`${body}.includes('Fixture email unavailable')`);
});

test('countdown decreases despite browser clock skew and never triggers an automatic resend', async context => {
  const { page, live } = await fixture(context, { cooldown: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: 'const realNow=Date.now.bind(Date);Date.now=()=>realNow()+3600000;' });
  await open(page);
  const initial = await page.evaluate(`${body}.match(/Повторно через ([0-9:]+)/)?.[1]`);
  assert.ok(initial && !initial.startsWith('60:'), initial);
  await page.wait(`${body}.match(/Повторно через ([0-9:]+)/)?.[1] !== ${JSON.stringify(initial)}`, 5000);
  assert.equal(live.posts, 0);
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(action)}).disabled`), true);
});

test('history fetch errors are visible and cannot be mistaken for never sent', async context => {
  const { page } = await fixture(context, { loadFailure: true });
  await page.send('Page.navigate', { url: `${base}/web/admin/orders` });
  await page.wait(`!!document.querySelector('[role="alert"]')`);
  assert.match(await page.evaluate(body), /Не удалось загрузить/);
  assert.equal(await page.evaluate(`!!document.querySelector(${JSON.stringify(action)})`), false);
});
