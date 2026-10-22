import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const A = '11111111-1111-4111-8111-111111111111';
const text = '(document.body?.textContent || "")';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(context, { paid = false, rejected = false, historyFailure = false, telegram = false } = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  if (telegram) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.Telegram={WebApp:{
      initData:'fixture-telegram-data',initDataUnsafe:{user:{id:999999998,first_name:'Fixture'}},
      colorScheme:'light',themeParams:{},version:'8.0',platform:'web',
      ready(){},expand(){},enableClosingConfirmation(){},onEvent(){},offEvent(){},
      setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},isVersionAtLeast(){return true},
      BackButton:{show(){},hide(){},onClick(){},offClick(){}},
      MainButton:{show(){},hide(){},onClick(){},offClick(){},setText(){},setParams(){}},
      HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}
    }};` });
  const live = {
    order: { id: A, createdAt: '2026-10-22T10:00:00.000Z', status: paid ? 'ОПЛАЧЕН' : 'СОБРАН',
      paymentMethod: 'yookassa', customerName: 'Тестовый клиент', customerPhone: 'fixture-phone',
      amount: '100.00', items: [], deliveryAddress: 'Тестовый адрес' },
    logs: [], patches: 0, prints: [], requests: [], rejected, historyFailure,
  };
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' }, { urlPattern: '*telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const url = new URL(event.request.url);
    const path = url.pathname.replace(/^\/api\/admin/, '/web-api/admin');
    live.requests.push(`${event.request.method} ${path}`);
    let status = 200; let result = [];
    if (path === '/web-api/auth/refresh') {
      result = { accessToken: 'fixture-admin-token',
        user: { id: 'fixture-admin', firstName: 'Fixture', isAdmin: true, isEmailVerified: true } };
    } else if (path === '/web-api/admin/check') result = { ok: true, isAdmin: true, isMasterAdmin: false };
    else if (path.startsWith('/api/analytics') && event.request.method === 'POST') result = { ok: true };
    else if (path === `/web-api/admin/orders/${A}/payment-method` && event.request.method === 'PATCH') {
      live.patches++;
      if (live.rejected) { status = 409; result = { error: 'Для заказа уже создана оплата.' }; }
      else {
        const method = JSON.parse(event.request.postData).paymentMethod;
        live.logs.unshift({ id: `log-${live.patches}`, orderId: A, adminUserId: 'fixture-admin',
          changeType: 'payment_method_changed', createdAt: new Date().toISOString(),
          changeData: { oldPaymentMethod: live.order.paymentMethod, newPaymentMethod: method } });
        live.order = { ...live.order, paymentMethod: method };
        result = live.order;
      }
    } else if (event.request.method !== 'GET') {
      await page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      throw new Error(`Unexpected mutation blocked: ${path}`);
    } else if (path === '/web-api/admin/orders') result = [live.order];
    else if (path === `/web-api/admin/orders/${A}`) result = live.order;
    else if (path === `/web-api/admin/orders/${A}/logs`) {
      if (live.historyFailure) { status = 500; result = { error: 'Fixture audit unavailable' }; }
      else result = live.logs;
    } else if (path === `/web-api/admin/orders/${A}/print`) {
      live.prints.push(url.searchParams.get('format'));
      result = { html: `<!doctype html><html lang="ru"><body><h1>${url.searchParams.get('format')}</h1><p>${A}</p><p>${live.order.paymentMethod}</p></body></html>` };
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: path.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(path.includes('telegram-web-app') ? '' : JSON.stringify(result)).toString('base64'),
    });
  });
  return { page, live };
}

async function openDetail(page) {
  await page.send('Page.navigate', { url: `${base}/web/admin/orders` });
  await page.wait('!!document.querySelector("tbody tr")');
  await page.click('tbody tr td:first-child');
  try {
    await page.wait('!!document.querySelector("#order-payment-method")', 6000);
  } catch (error) {
    console.error('Order details diagnostic:', await page.evaluate('(document.body?.innerText || "").slice(0,2200)'));
    throw error;
  }
}

test('operator confirms method change; refreshed details preserve the method and log with actor', async context => {
  const { page, live } = await fixture(context);
  await openDetail(page);
  await page.evaluate('window.confirm=()=>true');
  await page.click('#order-payment-method');
  await page.wait(`document.querySelectorAll('[role="option"]').length===2`);
  await page.click('[role="option"]:last-child');
  await page.wait(`${text}.includes('оператор fixture-admin')`);
  assert.equal(live.patches, 1);
  assert.equal(live.logs[0].changeData.oldPaymentMethod, 'yookassa');
  assert.equal(live.logs[0].changeData.newPaymentMethod, 'cash_on_delivery');
  const screenshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75, captureBeyondViewport: true });
  await writeFile('/tmp/order-operator-admin-fixture.jpg', Buffer.from(screenshot.data, 'base64'));
  await page.send('Page.reload', { ignoreCache: true });
  await page.wait('!!document.querySelector("tbody tr")');
  await page.click('tbody tr td:first-child');
  await page.wait(`${text}.includes('оператор fixture-admin')`);
  assert.equal(live.patches, 1);
  assert.equal(live.order.paymentMethod, 'cash_on_delivery');
});

test('paid orders cannot be switched, and failed history is not shown as empty', async context => {
  const { page, live } = await fixture(context, { paid: true, historyFailure: true });
  await openDetail(page);
  await page.wait(`${text}.includes('Не удалось загрузить историю изменений')`);
  assert.equal(await page.evaluate('document.querySelector("#order-payment-method")?.hasAttribute("data-disabled")'), true);
  assert.equal(live.patches, 0);
  live.historyFailure = false;
  await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Повторить'))?.click()`);
  await page.wait(`${text}.includes('Изменений способа оплаты пока нет')`);
});

test('server payment conflict surfaces an error without changing the visible method', async context => {
  const { page, live } = await fixture(context, { rejected: true });
  await openDetail(page);
  await page.evaluate('window.confirm=()=>true');
  await page.click('#order-payment-method');
  await page.wait(`document.querySelectorAll('[role="option"]').length===2`);
  await page.click('[role="option"]:last-child');
  await page.wait(`${text}.includes('Для заказа уже создана оплата')`);
  assert.equal(live.patches, 1);
  assert.equal(live.order.paymentMethod, 'yookassa');
  assert.equal(live.logs.length, 0);
});

test('each print action requests the fresh authenticated document for its own paper format', async context => {
  const { page, live } = await fixture(context);
  await openDetail(page);
  await page.evaluate(`window.fixturePrintWindows=[]; window.open=()=>{
    const output={html:'', printed:0}; window.fixturePrintWindows.push(output);
    return {document:{open(){output.html=''},write(html){output.html+=html},close(){}},
      focus(){},print(){output.printed++},closed:false};
  }`);
  await page.click('[data-testid="button-print-packing-list"]');
  await page.wait('window.fixturePrintWindows[0]?.printed===1');
  await page.click('[data-testid="button-print-order-label"]');
  await page.wait('window.fixturePrintWindows[1]?.printed===1');
  assert.deepEqual(live.prints, ['packing-list', 'label']);
  const documents = await page.evaluate('window.fixturePrintWindows');
  assert.match(documents[0].html, /packing-list/);
  assert.match(documents[1].html, /label/);
  assert.ok(documents.every(doc => doc.html.includes(A)));
});

test('Telegram admin offers the same payment change, history, and two print formats', async context => {
  const { page, live } = await fixture(context, { telegram: true });
  await page.send('Page.navigate', { url: `${base}/admin?section=orders` });
  try {
    await page.wait(`!!document.querySelector('[data-testid="button-edit-order-${A}"]')`, 6000);
  } catch (error) {
    console.error('Telegram fixture diagnostic:', live.requests, await page.evaluate('(document.body?.innerText || "").slice(0,2000)'));
    throw error;
  }
  await page.click(`[data-testid="button-edit-order-${A}"]`);
  await page.wait('!!document.querySelector(\'button[aria-label="Способ оплаты заказа"]\')');
  await page.evaluate('window.confirm=()=>true');
  await page.click('button[aria-label="Способ оплаты заказа"]');
  await page.wait(`document.querySelectorAll('[role="option"]').length===2`);
  await page.click('[role="option"]:last-child');
  await page.wait(`${text}.includes('Оператор: fixture-admin')`);
  assert.equal(live.patches, 1);
  assert.equal(live.order.paymentMethod, 'cash_on_delivery');
  assert.match(await page.evaluate('document.querySelector(\'button[aria-label="Способ оплаты заказа"]\')?.textContent'), /Наличными/);
  assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="button-print-packing-list"]')`), true);
  assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="button-print-order-label"]')`), true);
  await page.evaluate(`window.fixturePrintWindows=[]; window.open=()=>{
    const output={html:'', printed:0}; window.fixturePrintWindows.push(output);
    return {document:{open(){output.html=''},write(html){output.html+=html},close(){}},
      focus(){},print(){output.printed++},closed:false};
  }`);
  await page.click('[data-testid="button-print-packing-list"]');
  await page.wait('window.fixturePrintWindows[0]?.printed===1');
  await page.click('[data-testid="button-print-order-label"]');
  await page.wait('window.fixturePrintWindows[1]?.printed===1');
  assert.deepEqual(live.prints, ['packing-list', 'label']);
});

test('Telegram admin shows the server reason when a payment already exists', async context => {
  const { page, live } = await fixture(context, { telegram: true, rejected: true });
  await page.send('Page.navigate', { url: `${base}/admin?section=orders` });
  await page.wait(`!!document.querySelector('[data-testid="button-edit-order-${A}"]')`);
  await page.click(`[data-testid="button-edit-order-${A}"]`);
  await page.wait('!!document.querySelector(\'button[aria-label="Способ оплаты заказа"]\')');
  await page.evaluate('window.confirm=()=>true');
  await page.click('button[aria-label="Способ оплаты заказа"]');
  await page.wait(`document.querySelectorAll('[role="option"]').length===2`);
  await page.click('[role="option"]:last-child');
  await page.wait(`${text}.includes('Для заказа уже создана оплата')`);
  assert.equal(live.patches, 1);
  assert.equal(live.order.paymentMethod, 'yookassa');
});
