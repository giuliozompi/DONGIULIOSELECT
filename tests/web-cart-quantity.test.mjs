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

const mobileItems = [
  {
    productId: 'mobile-cheese',
    productName: 'Пармиджано Реджано выдержанный итальянский сыр с очень длинным названием производителя',
    price: '99999.99', unit: 'кг', quantity: 123.735, image: '/favicon.ico',
  },
  {
    productId: 'mobile-salami',
    productName: 'SalameArtigianaleItalianoConUnNomeMoltoLungoSenzaSpaziPerVerificareIlCarrello',
    price: '87654.32', unit: 'kg', quantity: 98.765,
  },
  {
    productId: 'mobile-pack',
    productName: 'Набор итальянских деликатесов в подарочной упаковке с длинным названием',
    price: '123456.78', unit: 'уп', quantity: 123,
  },
];
const mobileControl = (action, id) => `[data-testid="button-${action}-${id}"]`;
const mobileRow = id => `[data-testid="cart-item-${id}"]`;

async function assertMobileCart(page, expectedItems, width) {
  const subtotal = expectedItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  await page.wait(`document.querySelectorAll('[data-testid^="cart-item-"]').length === ${expectedItems.length}`);
  const state = await readCart(page);
  assert.deepEqual(state.items, expectedItems, 'Only the touched product may change');
  assert.equal(state.itemCount, expectedItems.length);
  assert.equal(state.subtotal, subtotal);
  for (const item of expectedItems) {
    const text = await page.evaluate(`document.querySelector(${JSON.stringify(mobileRow(item.productId))}).textContent`);
    assert.ok(text.includes(item.productName), 'Long product name is preserved');
    assert.ok(text.includes(`${item.unit === 'уп' ? item.quantity : item.quantity.toFixed(3)} ${item.unit}`), text);
    assert.ok(text.includes(money(Number(item.price) * item.quantity)), text);
  }
  const summary = await page.evaluate(`document.querySelector('[data-testid="button-checkout"]').parentElement.textContent`);
  assert.ok(summary.includes(money(subtotal)), summary);

  const problems = await page.evaluate(`(() => {
    const problems = [];
    const width = document.documentElement.clientWidth;
    if (innerWidth !== ${width} || width !== ${width}) problems.push('Unexpected viewport: ' + width + '/' + innerWidth);
    if (document.documentElement.scrollWidth > width || document.body.scrollWidth > width) {
      problems.push('Horizontal page overflow: ' + document.documentElement.scrollWidth + '/' + document.body.scrollWidth);
    }
    const overlaps = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 &&
      a.top < b.bottom - 1 && a.bottom > b.top + 1;
    for (const row of document.querySelectorAll('[data-testid^="cart-item-"]')) {
      // Include labels and amounts, not just the buttons: an overflow-hidden
      // ancestor must not make a clipped quantity/price appear to pass.
      const elements = [...row.querySelectorAll('button, span')];
      const bounds = row.getBoundingClientRect();
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.left < 0 || rect.right > width ||
            rect.left < bounds.left || rect.right > bounds.right ||
            rect.top < bounds.top || rect.bottom > bounds.bottom ||
            element.scrollWidth > element.clientWidth + 1) {
          problems.push('Clipped/overflowing element: ' + row.dataset.testid + '/' + element.textContent);
        }
      }
      for (let a = 0; a < elements.length; a++) {
        for (let b = a + 1; b < elements.length; b++) {
          if (overlaps(elements[a].getBoundingClientRect(), elements[b].getBoundingClientRect())) {
            problems.push('Overlapping controls/labels: ' + row.dataset.testid);
          }
        }
      }
    }
    const checkout = document.querySelector('[data-testid="button-checkout"]');
    const rect = checkout.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.left < 0 || rect.right > width ||
        checkout.scrollWidth > checkout.clientWidth + 1) problems.push('Clipped checkout');
    return problems;
  })()`);
  assert.deepEqual(problems, [], `Cart layout at ${width}px`);
}

for (const width of [320, 375, 390, 430]) {
  test(`mobile cart ${width}px: long names, large totals and independent touch targets`, async context => {
    const { page } = await wishlistPage(browser, context, { authenticated: false });
    await page.setViewport({ width, height: 844, mobile: true, deviceScaleFactor: 2 });
    const items = structuredClone(mobileItems);
    const state = {
      items, itemCount: items.length,
      subtotal: items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0),
    };
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      if (!sessionStorage.getItem('mobile-cart-seeded')) {
        localStorage.setItem('dgs-web-cart', ${JSON.stringify(JSON.stringify({ state, version: 0 }))});
        sessionStorage.setItem('mobile-cart-seeded', 'yes');
      }
    ` });
    await page.send('Page.navigate', { url: `${wishlistBase}/web/cart` });
    await assertMobileCart(page, items, width);
    assert.equal(await page.evaluate('navigator.maxTouchPoints > 0'), true);
    for (const item of items) {
      const original = item.quantity;
      await page.tap(mobileControl('increase', item.productId));
      item.quantity = Number((original + (item.unit === 'уп' ? 1 : 0.1)).toFixed(3));
      await assertMobileCart(page, items, width);
      await page.tap(mobileControl('decrease', item.productId));
      item.quantity = original;
      await assertMobileCart(page, items, width);
    }
    // Remove the middle row: the rows above/below must retain their data.
    await page.tap(mobileControl('remove', items[1].productId));
    items.splice(1, 1);
    await assertMobileCart(page, items, width);
    await page.send('Page.reload');
    await assertMobileCart(page, items, width);
    await page.tap('[data-testid="button-checkout"]');
    await page.wait(`location.pathname === '/web/checkout'`);
    assert.deepEqual((await readCart(page)).items, items, 'Checkout must not edit the remaining rows');
  });
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
