import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';
import { wishlistBase, wishlistPage } from './helpers/wishlist-fixture.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

const unrelated = {
  productId: 'untouched', productName: 'Altro prodotto', price: '350.00',
  unit: 'шт', quantity: 3,
};
const readCart = page => page.evaluate(`JSON.parse(localStorage.getItem('dgs-web-cart')).state`);
const row = '[data-testid="cart-item-quantity-test"]';
const increase = '[data-testid="button-increase-quantity-test"]';
const decrease = '[data-testid="button-decrease-quantity-test"]';
const money = value => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

async function openCart(context, unit, quantity) {
  const { page } = await wishlistPage(browser, context, { authenticated: false });
  const item = {
    productId: 'quantity-test', productName: 'Quantità salvata', price: '1900.50',
    unit, quantity, image: '/favicon.ico',
  };
  const state = {
    items: [item, unrelated], itemCount: 2,
    subtotal: Number(item.price) * quantity + 1050,
  };
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (!sessionStorage.getItem('cart-seeded')) {
      localStorage.setItem('dgs-web-cart', ${JSON.stringify(JSON.stringify({ state, version: 0 }))});
      sessionStorage.setItem('cart-seeded', 'yes');
    }
  ` });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/cart` });
  await page.wait(`!!document.querySelector(${JSON.stringify(row)})`);
  return { page, item, state };
}

async function assertQuantity(page, original, quantity) {
  const label = `${['кг', 'kg'].includes(original.unit.trim().toLowerCase()) ? quantity.toFixed(3) : quantity} ${original.unit}`;
  await page.wait(`document.querySelector(${JSON.stringify(row)})?.textContent.includes(${JSON.stringify(label)})`);
  const state = await readCart(page);
  assert.deepEqual(state.items, [{ ...original, quantity }, unrelated]);
  assert.equal(state.itemCount, 2);
  assert.equal(state.subtotal, Number(original.price) * quantity + 1050);
  const rowText = await page.evaluate(`document.querySelector(${JSON.stringify(row)}).textContent`);
  assert.ok(rowText.includes(money(Number(original.price) * quantity)), rowText);
  const summary = await page.evaluate(`document.querySelector('[data-testid="button-checkout"]').parentElement.textContent`);
  assert.ok(summary.includes(money(state.subtotal)), summary);
}

for (const unit of ['кг', 'kg', ' КГ ', ' KG ', 'шт', 'уп']) {
  const weighted = ['кг', 'kg'].includes(unit.trim().toLowerCase());
  test(`cart ${JSON.stringify(unit)}: shared increments, repeated clicks and persistence`, async context => {
    const initial = weighted ? 0.2 : 1;
    const step = weighted ? 0.1 : 1;
    const { page, item, state } = await openCart(context, unit, initial);
    assert.deepEqual(await readCart(page), state);
    await assertQuantity(page, item, initial);
    for (let count = 1; count <= 8; count++) {
      await page.click(increase);
      await assertQuantity(page, item, Number((initial + count * step).toFixed(3)));
    }
    for (let count = 7; count >= 0; count--) {
      await page.click(decrease);
      await assertQuantity(page, item, Number((initial + count * step).toFixed(3)));
    }
    await page.send('Page.reload');
    await assertQuantity(page, item, initial);
    // Preserve the established minimum/removal behavior.
    await page.click(decrease);
    await page.wait(`!document.querySelector(${JSON.stringify(row)})`);
    assert.deepEqual(await readCart(page), { items: [unrelated], itemCount: 1, subtotal: 1050, repeatedOrders: {} });
  });
}

for (const unit of ['кг', 'kg', ' KG ', 'шт']) {
  test(`cart ${JSON.stringify(unit)}: existing quantities and prices are not reset`, async context => {
    const weighted = unit.trim().toLowerCase() !== 'шт';
    const quantity = weighted ? 0.735 : 4;
    const { page, item, state } = await openCart(context, unit, quantity);
    assert.deepEqual(await readCart(page), state);
    await assertQuantity(page, item, quantity);
    await page.click(increase);
    await assertQuantity(page, item, weighted ? 0.835 : 5);
    await page.click(decrease);
    await assertQuantity(page, item, quantity);
    await page.send('Page.reload');
    await assertQuantity(page, item, quantity);
  });
}
