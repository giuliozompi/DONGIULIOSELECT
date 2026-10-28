import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';
import { wishlistBase, wishlistProduct as product, wishlistPage } from './helpers/wishlist-fixture.mjs';

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

// Start with UI additions rather than seeded persistence: both the live store
// during client-side navigation and hydration after reload must agree.
const card = `[data-testid="card-product-${product.id}"]`;
const productRow = `[data-testid="cart-item-${product.id}"]`;
const normalize = text => text.replace(/\s+/g, ' ').trim();

async function assertContinuity(page, surface, unit, quantity) {
  const weighted = ['кг', 'kg'].includes(unit.trim().toLowerCase());
  const label = weighted ? quantity.toFixed(3) : String(quantity);
  const selector = surface === 'catalog'
    ? `[data-testid="button-increase-cart-${product.id}"]`
    : surface === 'detail' ? '[data-testid="button-qty-plus"]'
      : `[data-testid="button-increase-${product.id}"]`;
  await page.wait(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    const label = control?.parentElement.querySelector(${JSON.stringify(surface === 'detail' ? ':scope > div > div:first-child' : 'span')});
    return label?.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(normalize(surface === 'detail' ? label : `${label} ${unit}`))};
  })()`);
  const state = await readCart(page);
  assert.deepEqual(state, {
    items: [{
      productId: product.id, productName: product.name, price: product.price,
      unit, quantity,
    }],
    itemCount: 1, subtotal: Number(product.price) * quantity, repeatedOrders: {},
  }, 'One product row, unchanged metadata, quantity and subtotal across pages');
  assert.equal(await page.evaluate('location.pathname'),
    surface === 'cart' ? '/web/cart' : surface === 'catalog' ? '/web/catalog' : `/web/product/${product.slug}`);
  if (surface === 'cart') {
    assert.equal(await page.evaluate(`document.querySelectorAll('[data-testid^="cart-item-"]').length`), 1);
    const total = await page.evaluate(`document.querySelector(${JSON.stringify(productRow)}).querySelector('.font-semibold').textContent`);
    const summary = await page.evaluate(`document.querySelector('[data-testid="button-checkout"]').parentElement.querySelector('.font-bold').textContent`);
    assert.equal(normalize(total), normalize(money(state.subtotal)));
    assert.equal(normalize(summary), normalize(`Итого${money(state.subtotal)}`));
  } else if (surface === 'detail') {
    const total = await page.evaluate(`document.querySelector('[data-testid="button-qty-plus"]').parentElement.parentElement.querySelector('.text-right .font-bold').textContent`);
    assert.equal(normalize(total), normalize(money(state.subtotal)));
  } else {
    // The catalogue shows a unit price, not a line total.
    assert.equal(await page.evaluate(`document.querySelectorAll(${JSON.stringify(card)}).length`), 1);
    const price = await page.evaluate(`document.querySelector(${JSON.stringify(card)}).querySelector('.font-semibold').textContent`);
    assert.equal(normalize(price), normalize(money(Number(product.price))));
  }
  return state;
}

for (const surface of ['catalog', 'detail']) {
  for (const unit of ['кг', 'kg', ' КГ ', ' KG ', 'шт', 'уп', ' ШТ ', ' УП ']) {
    test(`${surface} ${JSON.stringify(unit)}: UI addition, cart edits and return keep one row and identical totals`, async context => {
      const { page } = await wishlistPage(browser, context, {
        authenticated: false, productOverrides: { unit },
      });
      const weighted = ['кг', 'kg'].includes(unit.trim().toLowerCase());
      const initial = weighted ? 0.2 : 1;
      const step = weighted ? 0.1 : 1;
      const path = surface === 'catalog' ? '/web/catalog' : `/web/product/${product.slug}`;
      await page.send('Page.navigate', { url: `${wishlistBase}${path}` });
      await page.click(surface === 'catalog'
        ? `[data-testid="button-add-cart-${product.id}"]` : '[data-testid="button-add-to-cart"]');
      await assertContinuity(page, surface, unit, initial);
      // Real app navigation, without replacing or re-seeding the cart.
      await page.click('header button:has(svg.lucide-shopping-cart)');
      await assertContinuity(page, 'cart', unit, initial);
      for (let count = 1; count <= 3; count++) {
        await page.click(`[data-testid="button-increase-${product.id}"]`);
        await assertContinuity(page, 'cart', unit, Number((initial + count * step).toFixed(3)));
      }
      await page.click(`[data-testid="button-decrease-${product.id}"]`);
      const quantity = Number((initial + 2 * step).toFixed(3));
      const updated = await assertContinuity(page, 'cart', unit, quantity);
      await page.click('[data-testid="button-checkout"] ~ button');
      await assertContinuity(page, 'catalog', unit, quantity);
      await page.click(`${card} p`);
      await assertContinuity(page, 'detail', unit, quantity);
      await page.send('Page.reload');
      assert.deepEqual(await assertContinuity(page, 'detail', unit, quantity), updated);
      // Adding again from the product must increment, not duplicate/reset it.
      await page.click('[data-testid="button-qty-plus"]');
      const finalQuantity = Number((quantity + step).toFixed(3));
      await assertContinuity(page, 'detail', unit, finalQuantity);
      await page.click('header button:has(svg.lucide-shopping-cart)');
      await assertContinuity(page, 'cart', unit, finalQuantity);
      await page.send('Page.reload');
      await assertContinuity(page, 'cart', unit, finalQuantity);
    });
  }
}
