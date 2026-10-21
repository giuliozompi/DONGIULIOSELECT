import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';
import { ordersBase, customerOrder, historyOrder, ordersPage } from './helpers/orders-fixture.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const selector = id => `[data-testid="${id}"]`;
const exists = id => `!!document.querySelector(${JSON.stringify(selector(id))})`;
const text = `document.body.textContent`;

test('mobile list has exact order reference and total, a labelled touch target and keyboard navigation', async context => {
  const { page } = await ordersPage(browser, context);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(exists(`open-order-${customerOrder.id}`));
  const card = await page.evaluate(`document.querySelector(${JSON.stringify(selector(`card-order-${customerOrder.id}`))}).textContent`);
  assert.match(card, /CB7780/);
  assert.match(card.replace(/\s/g, ''), /1954,73₽/);
  assert.match(card, /2 позиции/);
  assert.match(card, /Подробнее/);
  const height = await page.evaluate(`document.querySelector(${JSON.stringify(selector(`open-order-${customerOrder.id}`))}).getBoundingClientRect().height`);
  assert.ok(height >= 44);
  await page.evaluate(`document.querySelector(${JSON.stringify(selector(`open-order-${customerOrder.id}`))}).focus()`);
  assert.equal(await page.evaluate('document.activeElement.dataset.testid'), `open-order-${customerOrder.id}`);
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r',
  });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await page.wait(exists('order-detail'));
  assert.equal(await page.evaluate('location.pathname'), `/web/orders/${customerOrder.id}`);
  await page.click(selector('back-to-orders'));
  await page.wait(exists(`card-order-${customerOrder.id}`));
  assert.equal(await page.evaluate('location.pathname'), '/web/account/orders');
});

test('direct mobile order link fetches its own detail and preserves grams, kopeks and delivery data', async context => {
  const { page, requests } = await ordersPage(browser, context, { listFailure: true });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.navigate', { url: `${ordersBase}/web/orders/${customerOrder.id}` });
  await page.wait(exists('order-detail'));
  const content = await page.evaluate(`${text}`);
  for (const value of ['CB7780', '0,735 кг', 'Test Customer', customerOrder.deliveryAddress, customerOrder.deliveryNotes]) {
    assert.ok(content.includes(value), `Missing ${value}`);
  }
  assert.match(content.replace(/\s/g, ''), /1954,73₽/);
  assert.match(content.replace(/\s/g, ''), /15,27₽/);
  assert.match(content, /Состав заказа/);
  assert.equal(requests.some(request => request.path === '/web-api/orders'), false);
  assert.ok(requests.some(request => request.path === `/web-api/orders/${customerOrder.id}`));
  assert.equal(await page.evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  const metrics = await page.send('Page.getLayoutMetrics');
  const screenshot = await page.send('Page.captureScreenshot', {
    format: 'jpeg', quality: 80, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 390, height: Math.min(metrics.cssContentSize.height, 2800), scale: 1 },
  });
  await writeFile('/tmp/dg-orders-mobile.jpg', Buffer.from(screenshot.data, 'base64'));
});

test('empty orders are distinct from a failed load', async context => {
  const { page } = await ordersPage(browser, context, { orders: [] });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(exists('orders-empty'));
  assert.equal(await page.evaluate(exists('orders-error')), false);
});

test('failed list shows an error and retry reloads the orders', async context => {
  const { page, state } = await ordersPage(browser, context, { listFailure: true });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(exists('orders-error'));
  assert.equal(await page.evaluate(exists('orders-empty')), false);
  state.listFailure = false;
  await page.click(selector('orders-retry'));
  await page.wait(exists(`card-order-${customerOrder.id}`));
});

test('missing order shows not-found and provides a return to the list', async context => {
  const { page } = await ordersPage(browser, context);
  await page.send('Page.navigate', { url: `${ordersBase}/web/orders/missing-order` });
  await page.wait(exists('order-not-found'));
  assert.equal(await page.evaluate(exists('orders-empty')), false);
  await page.click(selector('back-to-orders'));
  await page.wait(exists(`card-order-${customerOrder.id}`));
});

test('unauthenticated visitor cannot load customer order APIs', async context => {
  const { page, requests } = await ordersPage(browser, context, { authenticated: false });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(`document.body?.textContent?.includes('Войдите в аккаунт, чтобы просматривать заказы')`);
  assert.equal(requests.some(request => request.path.startsWith('/web-api/orders')), false);
});

test('cash receipt and courier-called status do not invent online payment or tracking progress', async context => {
  const called = { ...customerOrder, id: 'test-called-cc3344', status: 'ВЫЗВАН КУРЬЕР' };
  const { page } = await ordersPage(browser, context, { orders: [historyOrder, called] });
  await page.send('Page.navigate', { url: `${ordersBase}/web/orders/${historyOrder.id}` });
  await page.wait(exists('order-detail'));
  assert.match(await page.evaluate(text), /наличными при получении/);
  assert.doesNotMatch(await page.evaluate(text), /Оплата отмечена в заказе как полученная/);
  await page.send('Page.navigate', { url: `${ordersBase}/web/orders/${called.id}` });
  await page.wait(exists('order-detail'));
  assert.match(await page.evaluate(text), /не подтверждает, что заказ уже забран/);
});

test('long product and address strings stay readable on a narrow screen', async context => {
  const longOrder = {
    ...customerOrder, deliveryAddress: 'Адрес'.repeat(30),
    items: [{ ...customerOrder.items[0], productName: 'Сыр'.repeat(45) }],
  };
  const { page } = await ordersPage(browser, context, { orders: [longOrder] });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.navigate', { url: `${ordersBase}/web/orders/${customerOrder.id}` });
  await page.wait(exists('order-detail'));
  assert.equal(await page.evaluate('document.documentElement.scrollWidth > innerWidth'), false);
});
