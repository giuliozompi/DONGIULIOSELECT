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
    printFailure: null, releasePrint: null,
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
      if (live.printFailure === 'closed-loading') {
        await new Promise(resolve => { live.releasePrint = resolve; });
      }
      result = { html: `<!doctype html><html lang="ru"><body><h1>${url.searchParams.get('format')}</h1><p>${A}</p><p>${live.order.paymentMethod}</p></body></html>` };
      if ([401, 403, 500].includes(live.printFailure)) {
        status = live.printFailure;
        result = { error: `Не удалось получить документ: HTTP ${status}. Повторите попытку.` };
      } else if (live.printFailure === 'missing') result = {};
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responsePhrase: { 401: 'Unauthorized', 403: 'Forbidden', 500: 'Internal Server Error' }[status] || 'OK',
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
  await page.click('[data-testid="button-print-order-summary"]');
  await page.wait('window.fixturePrintWindows[2]?.printed===1');
  assert.deepEqual(live.prints, ['packing-list', 'label', 'order-summary']);
  const documents = await page.evaluate('window.fixturePrintWindows');
  assert.match(documents[0].html, /packing-list/);
  assert.match(documents[1].html, /label/);
  assert.match(documents[2].html, /order-summary/);
  assert.ok(documents.every(doc => doc.html.includes(A)));
});

test('Telegram admin offers the same payment change, history, and three print formats', async context => {
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
  await page.click('[data-testid="button-print-order-summary"]');
  await page.wait('window.fixturePrintWindows[2]?.printed===1');
  assert.deepEqual(live.prints, ['packing-list', 'label', 'order-summary']);
});

test('Telegram order viewer also opens the complete priced order through the print helper', async context => {
  const { page, live } = await fixture(context, { telegram: true });
  await page.send('Page.navigate', { url: `${base}/admin?section=orders` });
  await page.wait(`!!document.querySelector('[data-testid="button-view-order-${A}"]')`);
  await page.click(`[data-testid="button-view-order-${A}"]`);
  await page.wait('!!document.querySelector(\'[data-testid="dialog-order-view"] [data-testid="button-print-order-summary"]\')');
  await page.evaluate(`window.fixturePrintWindows=[]; window.open=()=>{
    const output={html:'',printed:0};window.fixturePrintWindows.push(output);
    return {document:{open(){output.html=''},write(html){output.html+=html},close(){}},
      focus(){},print(){output.printed++},closed:false};
  }`);
  await page.click('[data-testid="dialog-order-view"] [data-testid="button-print-order-summary"]');
  await page.wait('window.fixturePrintWindows[0]?.printed===1');
  assert.deepEqual(live.prints, ['order-summary']);
  assert.match(await page.evaluate('window.fixturePrintWindows[0].html'), /order-summary/);
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

const printActions = [
  ['packing-list', 'button-print-packing-list'],
  ['label', 'button-print-order-label'],
  ['order-summary', 'button-print-order-summary'],
];

for (const entry of ['web', 'telegram-editor', 'telegram-viewer']) {
  test(`${entry}: failed print actions report errors, never print, and permit a manual retry`, async context => {
    const { page, live } = await fixture(context, { telegram: entry !== 'web' });
    if (entry === 'web') await openDetail(page);
    else {
      await page.send('Page.navigate', { url: `${base}/admin?section=orders` });
      const action = entry === 'telegram-editor' ? 'edit' : 'view';
      await page.click(`[data-testid="button-${action}-order-${A}"]`);
      await page.wait('!!document.querySelector(\'[data-testid="button-print-order-summary"]\')');
    }
    await page.evaluate(`window.fixturePrintWindows=[]; window.fixtureBlockPrint=false;
      window.fixtureUnhandled=[];
      window.addEventListener('unhandledrejection', e=>window.fixtureUnhandled.push(String(e.reason)));
      window.open=()=>{
        if(window.fixtureBlockPrint) return null;
        const output={html:'',printed:0,closed:false};
        window.fixturePrintWindows.push(output);
        return {document:{
          open(){if(output.closed) throw new Error('Closed window'); output.html=''},
          write(html){if(output.closed) throw new Error('Closed window'); output.html+=html},
          close(){}
        },focus(){},print(){output.printed++},get closed(){return output.closed}};
      }`);
    for (const [format, testId] of printActions) {
      for (const failure of ['blocked', 401, 403, 500, 'missing', 'closed-loading']) {
        await context.test(`${format}: ${failure}`, async () => {
          // Dismiss the preceding error so an old toast cannot satisfy this assertion.
          await page.evaluate(`document.querySelector('[toast-close]')?.click()`);
          await page.wait(`!Array.from(document.querySelectorAll('[data-state="open"]')).some(e=>e.textContent.includes('Ошибка печати') && e.hasAttribute('role'))`);
          const before = live.prints.length;
          const windowCount = await page.evaluate('window.fixturePrintWindows.length');
          live.printFailure = failure;
          await page.evaluate(`window.fixtureBlockPrint=${failure === 'blocked'}`);
          const selector = `${entry === 'telegram-viewer' ? '[data-testid="dialog-order-view"] ' : ''}[data-testid="${testId}"]`;
          await page.click(selector);
          if (failure === 'closed-loading') {
            await page.wait(`window.fixturePrintWindows.length===${windowCount + 1}`);
            // Wait for the intercepted request, then close before its response arrives.
            const deadline = Date.now() + 5000;
            while (!live.releasePrint && Date.now() < deadline) {
              await new Promise(resolve => setTimeout(resolve, 20));
            }
            assert.equal(typeof live.releasePrint, 'function');
            await page.evaluate('window.fixturePrintWindows.at(-1).closed=true');
            live.releasePrint();
            live.releasePrint = null;
          }
          await page.wait(`${text}.includes('Ошибка печати')`);
          const errorText = await page.evaluate(`Array.from(document.querySelectorAll('[role="status"]')).find(e=>e.textContent.includes('Ошибка печати'))?.textContent`);
          assert.match(errorText, failure === 'blocked' ? /Разрешите всплывающие окна/
            : failure === 'closed-loading' ? /Окно печати закрыто.*Повторите/
            : failure === 'missing' ? /Сервер не вернул документ/
            : entry === 'web' ? new RegExp(`HTTP ${failure}`)
            : failure === 401 ? /Sessione scaduta/
            : failure === 403 ? /Forbidden/ : /Internal Server Error/);
          // The web API may refresh once on 401; both intercepted attempts must fail.
          const expectedRequests = failure === 'blocked' ? 0 : failure === 401 && entry === 'web' ? 2 : 1;
          assert.deepEqual(live.prints.slice(before), Array(expectedRequests).fill(format));
          assert.equal(await page.evaluate('window.fixturePrintWindows.length'), windowCount + (failure === 'blocked' ? 0 : 1));
          if (failure !== 'blocked') {
            const output = await page.evaluate('window.fixturePrintWindows.at(-1)');
            assert.equal(output.printed, 0);
            if (failure !== 'closed-loading') {
              assert.match(output.html, /Не удалось подготовить печать/);
              assert.match(output.html, /повторите печать из заказа/);
            }
          }
          // Only this next user click may produce a successful document.
          live.printFailure = null;
          await page.evaluate(`window.fixtureBlockPrint=false; document.querySelector('[toast-close]')?.click()`);
          await page.click(selector);
          await page.wait('window.fixturePrintWindows.at(-1)?.printed===1');
          const output = await page.evaluate('window.fixturePrintWindows.at(-1)');
          assert.match(output.html, new RegExp(format));
          assert.match(output.html, new RegExp(A));
          assert.equal(live.prints.length, before + expectedRequests + 1);
          assert.equal(live.prints.at(-1), format);
          const failedWindows = await page.evaluate(`window.fixturePrintWindows.slice(${windowCount}, -1)`);
          assert.ok(failedWindows.every(output => output.printed === 0));
          assert.deepEqual(await page.evaluate('window.fixtureUnhandled'), []);
        });
      }
    }
  });
}
