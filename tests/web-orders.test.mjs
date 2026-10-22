import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';
import { ordersBase, customerOrder, historyOrder, ordersPage, buildReorderPreview } from './helpers/orders-fixture.mjs';

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

const repeatId = `repeat-order-${customerOrder.id}`;
const repeatReady = `${exists(repeatId)} && !document.querySelector(${JSON.stringify(selector(repeatId))}).disabled`;
async function cartItems(page) {
  return page.evaluate(`JSON.parse(localStorage.getItem('dgs-web-cart') || '{"state":{"items":[]}}').state.items`);
}
async function seedCart(page) {
  // Seed persistence and reload the real UI. An unversioned dynamic import
  // during Vite HMR can create a second, detached Zustand store.
  await page.evaluate(`localStorage.setItem('dgs-web-cart', JSON.stringify({ state: {
    items: [
      { productId: 'test-cheese', productName: 'Old cart cheese', price: '1000.00', unit: 'кг', quantity: 0.165 },
      { productId: 'test-bread', productName: 'Bread', price: '100.00', unit: 'шт', quantity: 2 }
    ], itemCount: 2, subtotal: 365
  }, version: 0 }))`);
  await page.send('Page.reload');
  await page.wait(repeatReady);
}

async function reviewAndOpenCart(page) {
  await page.wait(exists('reorder-review'));
  await page.click(selector('reorder-go-to-cart'));
  await page.wait(`location.pathname === '/web/cart'`);
}

test('repeat from the mobile list adds original quantities with fresh prices, not historical totals', async context => {
  const { page, requests } = await ordersPage(browser, context);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(repeatReady);
  assert.equal(await page.evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  const snapshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  await writeFile('/tmp/dg-repeat-list-mobile.jpg', Buffer.from(snapshot.data, 'base64'));
  await page.click(selector(repeatId));
  await page.wait(exists('reorder-price-summary'));
  const summary = await page.evaluate(`document.querySelector('[data-testid="reorder-price-summary"]').textContent`);
  assert.match(summary, /Цена выросла/);
  assert.match(summary, /Скидки и доставка прежнего заказа не включены/);
  const totals = await page.evaluate(`document.querySelector('[data-testid="reorder-product-totals"]').textContent.replace(/\\s/g, '')`);
  assert.match(totals, /Было:1970,00₽Сейчас:2290,50₽Разница:\+320,50₽/);
  assert.doesNotMatch(totals, /1954,73|15,27/);
  assert.equal(await page.evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  await reviewAndOpenCart(page);
  const items = await cartItems(page);
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 0.735);
  assert.equal(items[0].price, '2300.00');
  assert.match(items[0].productName, /актуальный каталог/);
  assert.equal(items[1].price, '600.00');
  assert.equal(items[1].quantity, 1);
  assert.equal(await page.evaluate(`JSON.parse(localStorage.getItem('dgs-web-cart')).state.subtotal`), 2290.5);
  assert.equal(requests.some(request => request.method !== 'GET' && request.path !== '/web-api/auth/refresh'), false);
  assert.equal(requests.filter(request => request.path.endsWith('/reorder')).length, 1);
});

test('repeat from detail preserves existing cart products, sums exact weights and refreshes matching prices', async context => {
  const { page } = await ordersPage(browser, context);
  await page.send('Page.navigate', { url: `${ordersBase}/web/orders/${customerOrder.id}` });
  await page.wait(repeatReady);
  await seedCart(page);
  await page.click(selector(repeatId));
  await reviewAndOpenCart(page);
  const items = await cartItems(page);
  assert.equal(items.length, 3);
  const cheese = items.find(item => item.productId === 'test-cheese');
  assert.equal(cheese.quantity, 0.9);
  assert.equal(cheese.price, '2300.00');
  assert.equal(items.find(item => item.productId === 'test-bread').quantity, 2);
  assert.equal(items.find(item => item.productId === 'test-bread').price, '100.00');
});

for (const [oldUnit, oldQuantity, oldPrice, unit, quantity, currentPrice] of [
  ['г', 735, '2', 'кг', 0.735, '2000'],
  ['кг', 0.735, '2000', 'г', 735, '2'],
]) {
  test(`mobile price summary normalizes ${oldUnit} to ${unit}, showing unchanged and lower prices`, async context => {
    const original = { ...customerOrder.items[0], unit: oldUnit, quantity: oldQuantity, price: oldPrice };
    const reduced = { ...customerOrder.items[1] };
    const preview = buildReorderPreview([original, reduced], [
      { id: original.productId, name: original.productName, unit, price: currentPrice, isVisible: true, inStock: true, images: [] },
      { id: reduced.productId, name: reduced.productName, unit: reduced.unit, price: '400', isVisible: true, inStock: true, images: [] },
    ]);
    const { page } = await ordersPage(browser, context, { reorderPreview: preview });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
    await page.wait(repeatReady);
    await page.click(selector(repeatId));
    await page.wait(exists('reorder-price-summary'));
    const content = await page.evaluate(`document.querySelector('[data-testid="reorder-price-summary"]').textContent`);
    assert.match(content, /Цена не изменилась/);
    assert.match(content, /Цена снизилась/);
    assert.doesNotMatch(content, /Цена выросла/);
    assert.match(content.replace(/\s/g, ''), /Разница:−100,00₽/);
    assert.equal((await cartItems(page))[0].quantity, quantity);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth > innerWidth'), false);
    await reviewAndOpenCart(page);
  });
}

test('cart conflicts stay excluded from the price summary and do not change the existing item', async context => {
  const { page } = await ordersPage(browser, context);
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(repeatReady);
  await page.evaluate(`localStorage.setItem('dgs-web-cart', JSON.stringify({state: {items: [
    {productId: 'test-cheese', productName: 'Incompatible cart cheese', unit: 'шт', quantity: 2, price: '99'}
  ]}, version: 0}))`);
  await page.send('Page.reload');
  await page.wait(repeatReady);
  await page.click(selector(repeatId));
  await page.wait(exists('reorder-review'));
  assert.match(await page.evaluate(text), /Сначала проверьте количество/);
  const totals = await page.evaluate(`document.querySelector('[data-testid="reorder-product-totals"]').textContent.replace(/\\s/g, '')`);
  assert.match(totals, /Было:500,00₽Сейчас:600,00₽Разница:\+100,00₽/);
  assert.equal((await cartItems(page))[0].price, '99');
});

test('partially unavailable repeat adds available products and explains each skipped product', async context => {
  const { page } = await ordersPage(browser, context, { reorderPreview: {
    items: buildReorderPreview([customerOrder.items[0]], [{
      id: 'test-cheese', name: 'Сыр', price: '2500.00', unit: 'кг', images: [], isVisible: true, inStock: true,
    }]).items,
    skipped: [
      { productId: 'test-salami', productName: 'Салями итальянская', reason: 'unavailable' },
      { productId: 'deleted', productName: 'Удалённый сыр', reason: 'removed' },
    ],
  } });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(repeatReady);
  await page.click(selector(repeatId));
  await page.wait(exists('reorder-review'));
  const content = await page.evaluate(`document.querySelector(${JSON.stringify(selector('reorder-review'))}).textContent`);
  assert.match(content, /Заказ повторён частично/);
  assert.match(content, /Нет в наличии/);
  assert.match(content, /Товар больше не продаётся/);
  assert.equal((await cartItems(page)).length, 1);
  assert.equal((await cartItems(page))[0].price, '2500.00');
  assert.equal(await page.evaluate('location.pathname'), '/web/account/orders');
  await page.click(selector('reorder-go-to-cart'));
  await page.wait(`location.pathname === '/web/cart'`);
});

test('no available products leaves the existing cart unchanged and gives an explicit explanation', async context => {
  const { page } = await ordersPage(browser, context, { reorderPreview: {
    items: [], skipped: customerOrder.items.map(item => ({ ...item, reason: 'unavailable' })),
  } });
  await page.send('Page.navigate', { url: `${ordersBase}/web/orders/${customerOrder.id}` });
  await page.wait(repeatReady);
  await seedCart(page);
  const before = await cartItems(page);
  await page.click(selector(repeatId));
  await page.wait(exists('reorder-review'));
  assert.match(await page.evaluate(text), /Корзина не изменена/);
  assert.deepEqual(await cartItems(page), before);
});

test('catalogue errors do not change the cart or fall back to old prices; retry is explicit', async context => {
  const { page, state, requests } = await ordersPage(browser, context, { reorderFailure: true });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(repeatReady);
  await seedCart(page);
  const before = await cartItems(page);
  await page.click(selector(repeatId));
  await page.wait(`document.body.textContent.includes('Не удалось повторить заказ')`);
  await page.wait(repeatReady);
  assert.deepEqual(await cartItems(page), before);
  assert.equal(requests.filter(request => request.path.endsWith('/reorder')).length, 1);
  state.reorderFailure = false;
  await page.click(selector(repeatId));
  await reviewAndOpenCart(page);
  assert.equal((await cartItems(page)).find(item => item.productId === 'test-cheese').price, '2300.00');
  assert.equal(requests.filter(request => request.path.endsWith('/reorder')).length, 2);
});

test('rapid clicks on two repeat buttons cannot duplicate products', async context => {
  const { page, requests } = await ordersPage(browser, context, { reorderDelay: 300 });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(repeatReady);
  await page.evaluate(`(() => {
    document.querySelector(${JSON.stringify(selector(repeatId))}).click();
    document.querySelector(${JSON.stringify(selector(`repeat-order-${historyOrder.id}`))}).click();
  })()`);
  await reviewAndOpenCart(page);
  assert.equal(requests.filter(request => request.path.endsWith('/reorder')).length, 1);
  assert.equal((await cartItems(page))[0].quantity, 0.735);
});

test('switching customer during a repeat request never adds the previous customer order', async context => {
  const { page } = await ordersPage(browser, context, { reorderDelay: 700 });
  await page.send('Page.navigate', { url: `${ordersBase}/web/account/orders` });
  await page.wait(repeatReady);
  await page.click(selector(repeatId));
  await page.evaluate(`(async () => {
    const { useWebAuth } = await import('/src/web/hooks/useWebAuth.ts');
    useWebAuth.setState({ user: { ...useWebAuth.getState().user, id: 'other-customer' } });
  })()`);
  await page.wait(`document.body.textContent.includes('Аккаунт изменился')`);
  assert.deepEqual(await cartItems(page), []);
});
