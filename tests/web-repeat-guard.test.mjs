import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';
import { ordersBase, customerOrder, ordersPage, buildReorderPreview } from './helpers/orders-fixture.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const select = id => `[data-testid="${id}"]`;
const exists = id => `!!document.querySelector(${JSON.stringify(select(id))})`;
const repeat = select(`repeat-order-${customerOrder.id}`);
const cart = page => page.evaluate(`JSON.parse(localStorage.getItem('dgs-web-cart'))?.state`);
const calls = requests => requests.filter(request => request.path.endsWith('/reorder')).length;
async function open(page, detail = false) {
  await page.send('Page.navigate', { url: `${ordersBase}${detail ? `/web/orders/${customerOrder.id}` : '/web/account/orders'}` });
  await page.wait(`!!document.querySelector(${JSON.stringify(repeat)}) && !document.querySelector(${JSON.stringify(repeat)}).disabled`);
}
async function escape(page) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
}

test('list to detail: second repeat waits for confirmation; cancel changes neither quantities nor prices', async context => {
  const { page, requests, state } = await ordersPage(browser, context);
  await open(page);
  await page.click(repeat);
  await page.wait(exists('reorder-review'));
  assert.equal(await page.evaluate(exists('reorder-confirmation')), false);
  const first = await cart(page);
  assert.equal(first.items[0].quantity, 0.735);
  await escape(page);
  await page.wait(`!document.querySelector(${JSON.stringify(select('reorder-review'))})`);
  await page.click(select(`open-order-${customerOrder.id}`));
  await page.wait(exists('order-detail'));
  await page.click(repeat);
  await page.wait(exists('reorder-confirmation'));
  assert.equal(calls(requests), 1);
  assert.deepEqual(await cart(page), first);
  assert.equal(await page.evaluate('document.activeElement.dataset.testid'), 'reorder-confirm-cancel');
  await page.click(select('reorder-confirm-cancel'));
  await page.wait(`!document.querySelector(${JSON.stringify(select('reorder-confirmation'))})`);
  assert.deepEqual(await cart(page), first);
  assert.equal(calls(requests), 1);
  await page.click(repeat);
  await page.wait(exists('reorder-confirmation'));
  state.reorderPreview = buildReorderPreview(customerOrder.items, customerOrder.items.map(item => ({
    id: item.productId, name: item.productName, unit: item.unit, price: '2600',
    images: [], isVisible: true, inStock: true,
  })));
  await page.click(select('reorder-confirm-add'));
  await page.wait(exists('reorder-review'));
  await page.wait(`!document.querySelector(${JSON.stringify(select('reorder-confirmation'))})`);
  assert.equal(calls(requests), 2);
  assert.equal((await cart(page)).items[0].quantity, 1.47);
  assert.equal((await cart(page)).items[0].price, '2600');
});

test('mobile reload preserves the guard; Escape cancels and each later repeat still asks', async context => {
  const { page, requests } = await ordersPage(browser, context);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await open(page, true);
  await page.click(repeat);
  await page.wait(exists('reorder-review'));
  const first = await cart(page);
  await page.send('Page.reload', { ignoreCache: true });
  await page.wait(`!!document.querySelector(${JSON.stringify(repeat)})`);
  await page.click(repeat);
  await page.wait(exists('reorder-confirmation'));
  assert.equal(await page.evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  const screenshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  await writeFile('/tmp/repeat-order-confirmation-mobile.jpg', Buffer.from(screenshot.data, 'base64'));
  await escape(page);
  await page.wait(`!document.querySelector(${JSON.stringify(select('reorder-confirmation'))})`);
  assert.deepEqual(await cart(page), first);
  assert.equal(calls(requests), 1);
  await page.click(repeat);
  await page.wait(exists('reorder-confirmation'));
  await page.click(select('reorder-confirm-add'));
  await page.wait(exists('reorder-review'));
  await page.wait(`!document.querySelector(${JSON.stringify(select('reorder-confirmation'))})`);
  await escape(page);
  await page.wait(`!document.querySelector(${JSON.stringify(select('reorder-review'))})`);
  await page.click(repeat);
  await page.wait(exists('reorder-confirmation'));
  assert.equal(calls(requests), 2);
});

test('rapid first clicks fetch and add only once', async context => {
  const { page, requests } = await ordersPage(browser, context, { reorderDelay: 250 });
  await open(page);
  await page.evaluate(`(() => {const button=document.querySelector(${JSON.stringify(repeat)});for(let i=0;i<8;i++)button.click()})()`);
  await page.wait(exists('reorder-review'));
  assert.equal(calls(requests), 1);
  assert.equal((await cart(page)).items[0].quantity, 0.735);
});

test('failed requests do not count as a successful first repeat', async context => {
  const { page, requests, state } = await ordersPage(browser, context, { reorderFailure: true });
  await open(page, true);
  await page.click(repeat);
  await page.wait(`document.body.textContent.includes('Не удалось повторить заказ')`);
  await page.wait(`!document.querySelector(${JSON.stringify(repeat)}).disabled`);
  state.reorderFailure = false;
  await page.click(repeat);
  await page.wait(exists('reorder-review'));
  assert.equal(await page.evaluate(exists('reorder-confirmation')), false);
  assert.equal(calls(requests), 2);
  assert.equal((await cart(page)).items[0].quantity, 0.735);
});
