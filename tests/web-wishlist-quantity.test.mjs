import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';
import { wishlistBase, wishlistProduct as product, wishlistPage } from './helpers/wishlist-fixture.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const add = `[data-testid="button-add-wishlist-item-${product.id}"]`;
const status = `[data-testid="wishlist-cart-quantity-${product.id}"]`;
const readCart = page => page.evaluate(`JSON.parse(localStorage.getItem('dgs-web-cart')).state`);
const unrelated = { productId: 'other-product', productName: 'Altro prodotto', price: '350', unit: 'шт', quantity: 3 };

async function openWishlist(context, { unit = 'кг', quantity = 0, inStock = true } = {}) {
  const { page } = await wishlistPage(browser, context, {
    initiallySelected: true, productOverrides: { unit }, inStock,
  });
  if (unit === 'кг') {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  }
  const items = [unrelated];
  if (quantity) items.push({
    productId: product.id, productName: 'Nome già salvato', price: '1900',
    unit, quantity, image: '/existing-image.png',
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (!sessionStorage.getItem('cart-seeded')) {
      localStorage.setItem('dgs-web-cart', ${JSON.stringify(JSON.stringify({
        state: { items, itemCount: items.length, subtotal: items.reduce((s, i) => s + Number(i.price) * i.quantity, 0) },
        version: 0,
      }))});
      sessionStorage.setItem('cart-seeded', 'yes');
    }
  ` });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/wishlist` });
  await page.wait(`!!document.querySelector(${JSON.stringify(add)})`);
  return page;
}

for (const unit of ['кг', 'kg', 'шт', 'уп']) {
  test(`wishlist ${unit}: first addition, repeated and rapid clicks, persisted totals`, async context => {
    const page = await openWishlist(context, { unit });
    const weighted = ['кг', 'kg'].includes(unit);
    const expectedLabel = weighted ? '0,200' : '1';
    assert.match(await page.evaluate(`document.querySelector(${JSON.stringify(add)}).getAttribute('aria-label')`), new RegExp(`${expectedLabel} ${unit}`));
    await page.click(add);
    await page.wait(`document.querySelector(${JSON.stringify(status)})?.textContent.includes('${expectedLabel} ${unit}')`);
    const afterFirst = await readCart(page);
    assert.equal(afterFirst.items.find(i => i.productId === product.id).quantity, weighted ? 0.2 : 1);
    assert.match(await page.evaluate(`document.querySelector(${JSON.stringify(add)}).getAttribute('aria-label')`), new RegExp(`${weighted ? '0,100' : '1'} ${unit}`));
    await page.click(add);
    await page.wait(`document.querySelector(${JSON.stringify(status)}).textContent.includes('${weighted ? '0,300' : '2'} ${unit}')`);
    if (unit === 'кг') {
      const screenshot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
      await writeFile('/tmp/wishlist-quantity-mobile.jpg', Buffer.from(screenshot.data, 'base64'));
    }
    await page.evaluate(`(() => { const button = document.querySelector(${JSON.stringify(add)}); for (let i = 0; i < 7; i++) button.click(); })()`);
    const cart = await readCart(page);
    assert.equal(cart.items.find(i => i.productId === product.id).quantity, weighted ? 1 : 9);
    assert.deepEqual(cart.items.find(i => i.productId === unrelated.productId), unrelated);
    assert.equal(cart.itemCount, 2);
    assert.equal(cart.subtotal, 1050 + 2000 * (weighted ? 1 : 9));
    await page.send('Page.reload');
    await page.wait(`document.querySelector(${JSON.stringify(status)})?.textContent.includes('${weighted ? '1,000' : '9'} ${unit}')`);
    assert.deepEqual(await readCart(page), cart);
  });
}

for (const [unit, quantity, expected] of [['кг', 0.735, 0.935], ['шт', 4, 6]]) {
  test(`wishlist ${unit}: existing quantities and metadata are preserved`, async context => {
    const page = await openWishlist(context, { unit, quantity });
    const original = (await readCart(page)).items.find(i => i.productId === product.id);
    await page.click(add);
    await page.click(add);
    const cart = await readCart(page);
    assert.deepEqual(cart.items.find(i => i.productId === product.id), { ...original, quantity: expected });
    assert.deepEqual(cart.items.find(i => i.productId === unrelated.productId), unrelated);
    assert.equal(cart.subtotal, 1050 + 1900 * expected);
  });
}

test('unavailable favourite cannot change the cart', async context => {
  const page = await openWishlist(context, { inStock: false });
  const cart = await readCart(page);
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(add)}).disabled`), true);
  await page.click(add);
  assert.deepEqual(await readCart(page), cart);
});

for (const unit of ['кг', 'шт']) {
  test(`${unit}: wishlist, catalog and product detail increment the same cart item`, async context => {
    const page = await openWishlist(context, { unit });
    await page.click(add);
    await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
    const card = `[data-testid="card-product-${product.id}"]`;
    await page.wait(`!!document.querySelector(${JSON.stringify(card)})`);
    await page.click(`[data-testid="button-increase-cart-${product.id}"]`);
    assert.equal((await readCart(page)).items.find(i => i.productId === product.id).quantity, unit === 'кг' ? 0.3 : 2);
    await page.send('Page.navigate', { url: `${wishlistBase}/web/product/${product.slug}` });
    await page.wait(`!!document.querySelector('[data-testid="button-qty-plus"]')`);
    await page.click('[data-testid="button-qty-plus"]');
    const cart = await readCart(page);
    assert.equal(cart.items.find(i => i.productId === product.id).quantity, unit === 'кг' ? 0.4 : 3);
    assert.deepEqual(cart.items.find(i => i.productId === unrelated.productId), unrelated);
  });
}
