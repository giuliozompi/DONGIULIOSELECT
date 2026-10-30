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

async function assertSharedCart(pages, items) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  for (const page of pages) {
    await page.wait(`document.querySelectorAll('[data-testid^="cart-item-"]').length === ${items.length}`);
    for (const item of items) {
      const label = `${['кг', 'kg'].includes(item.unit.trim().toLowerCase()) ? item.quantity.toFixed(3) : item.quantity} ${item.unit}`;
      const selector = `[data-testid="cart-item-${item.productId}"]`;
      await page.wait(`document.querySelector(${JSON.stringify(selector)})?.textContent.includes(${JSON.stringify(label)})`);
      const text = await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
      assert.ok(text.includes(money(Number(item.price) * item.quantity)), text);
    }
    const saved = await readCart(page);
    assert.deepEqual(saved.items, items);
    assert.equal(saved.itemCount, items.length);
    assert.equal(saved.subtotal, subtotal);
    if (items.length) {
      const summary = await page.evaluate(`document.querySelector('[data-testid="button-checkout"]').parentElement.textContent`);
      assert.ok(summary.includes(money(subtotal)), summary);
    } else {
      assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="button-checkout"]')`), false);
      assert.deepEqual(saved.repeatedOrders, {});
    }
  }
}

async function openSharedCart(context, unit, quantity) {
  const first = await openCart(context, unit, quantity);
  const second = await wishlistPage(browser, context, { authenticated: false, sharedWith: first.page });
  await second.page.send('Page.navigate', { url: `${wishlistBase}/web/cart` });
  await second.page.wait(`!!document.querySelector(${JSON.stringify(row)})`);
  assert.equal(first.page.browserContextId, second.page.browserContextId);
  context.after(() => {
    assert.ok(second.requests.some(request => request.path === '/web-api/auth/refresh'),
      'The second tab must also intercept its API calls');
    assert.ok(second.requests.every(request =>
      request.method === 'GET' || request.path === '/web-api/auth/refresh'),
    'Cross-tab cart changes must not call real customer mutation endpoints');
  });
  return { ...first, second: second.page };
}

for (const unit of ['кг', 'шт']) {
  test(`two tabs ${unit}: quantities, removals, empty cart and totals stay in sync without reload`, async context => {
    const initial = unit === 'кг' ? 0.735 : 4;
    const step = unit === 'кг' ? 0.1 : 1;
    const { page, second, item } = await openSharedCart(context, unit, initial);
    const pages = [page, second];
    await assertSharedCart(pages, [item, unrelated]);
    await page.send('Page.bringToFront');
    await page.click(increase);
    const changed = { ...item, quantity: Number((initial + step).toFixed(3)) };
    await assertSharedCart(pages, [changed, unrelated]);
    await second.send('Page.bringToFront');
    await second.click(increase);
    changed.quantity = Number((initial + 2 * step).toFixed(3));
    await assertSharedCart(pages, [changed, unrelated]);
    await page.send('Page.bringToFront');
    await page.click(decrease);
    changed.quantity = Number((initial + step).toFixed(3));
    await assertSharedCart(pages, [changed, unrelated]);
    await second.click('[data-testid="button-remove-untouched"]');
    await assertSharedCart(pages, [changed]);
    await page.click(increase);
    changed.quantity = Number((initial + 2 * step).toFixed(3));
    await assertSharedCart(pages, [changed]);
    await second.click('[data-testid="button-remove-quantity-test"]');
    await assertSharedCart(pages, []);
    for (const tab of pages) await tab.send('Page.reload');
    await assertSharedCart(pages, []);
    // Add through the UI after emptying; neither tab may revive deleted rows.
    await second.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
    await second.click(`[data-testid="button-add-cart-${product.id}"]`);
    const added = {
      productId: product.id, productName: product.name, price: product.price,
      unit: product.unit, quantity: 0.2,
    };
    await assertSharedCart([page], [added]);
    await second.click('header button:has(svg.lucide-shopping-cart)');
    await assertSharedCart(pages, [added]);
    for (const tab of pages) await tab.send('Page.reload');
    await assertSharedCart(pages, [added]);
  });
}

test('two tabs: an edit before queued storage notifications preserves newer changes to another row', async context => {
  const { page, second, item } = await openSharedCart(context, 'кг', 0.735);
  // Suppress just the receiving tab's storage listener, as if delivery were
  // delayed in a background tab. Its visible row remains stale on purpose.
  await second.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.addEventListener('storage', event => {
      if (window.holdCartEvents && event.key === 'dgs-web-cart') event.stopImmediatePropagation();
    });
    window.holdCartEvents = true;
  ` });
  await second.send('Page.reload');
  await assertSharedCart([second], [item, unrelated]);
  await page.click(increase);
  const changed = { ...item, quantity: 0.835 };
  await assertSharedCart([page], [changed, unrelated]);
  await second.wait(`document.querySelector(${JSON.stringify(row)})?.textContent.includes('0.735 кг')`);
  await second.click('[data-testid="button-increase-untouched"]');
  const other = { ...unrelated, quantity: 4 };
  await assertSharedCart([page, second], [changed, other]);
  // Removal must also survive a later edit from an out-of-date tab.
  await page.click('[data-testid="button-remove-quantity-test"]');
  await assertSharedCart([page], [other]);
  await second.click('[data-testid="button-increase-untouched"]');
  other.quantity = 5;
  await assertSharedCart([page, second], [other]);
  // A late event contains an obsolete snapshot; read the current storage.
  const before = await readCart(second);
  await second.evaluate(`(() => {
    window.holdCartEvents = false;
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'dgs-web-cart', storageArea: localStorage,
      newValue: ${JSON.stringify(JSON.stringify({ state: { items: [item, unrelated] }, version: 0 }))},
    }));
  })()`);
  await assertSharedCart([page, second], [other]);
  assert.deepEqual(await readCart(second), before, 'Receiving events must not write stale data back');
});

test('two tabs: returning to a tab refreshes missed changes; storage deletion empties both tabs', async context => {
  const { page, second, item } = await openSharedCart(context, 'шт', 4);
  await second.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.addEventListener('storage', event => event.stopImmediatePropagation());
  ` });
  await second.send('Page.reload');
  await assertSharedCart([second], [item, unrelated]);
  await page.click(increase);
  const changed = { ...item, quantity: 5 };
  await assertSharedCart([page], [changed, unrelated]);
  await second.evaluate(`window.dispatchEvent(new Event('focus'))`);
  await assertSharedCart([page, second], [changed, unrelated]);
  await page.click(increase);
  changed.quantity = 6;
  await assertSharedCart([page], [changed, unrelated]);
  assert.equal(await second.evaluate('document.visibilityState'), 'visible');
  await second.evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
  await assertSharedCart([page, second], [changed, unrelated]);
  // removeItem is not the only way storage can disappear (e.g. browser cleanup).
  await second.evaluate(`localStorage.removeItem('dgs-web-cart')`);
  await page.wait(`document.querySelectorAll('[data-testid^="cart-item-"]').length === 0`);
  assert.equal(await page.evaluate(`localStorage.getItem('dgs-web-cart')`), null,
    'Receiving a storage deletion must not echo a write');
  await second.evaluate(`window.dispatchEvent(new Event('focus'))`);
  await second.wait(`document.querySelectorAll('[data-testid^="cart-item-"]').length === 0`);
  await second.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await second.click(`[data-testid="button-add-cart-${product.id}"]`);
  const added = {
    productId: product.id, productName: product.name, price: product.price,
    unit: product.unit, quantity: 0.2,
  };
  await assertSharedCart([page], [added]);
  await second.click('header button:has(svg.lucide-shopping-cart)');
  await assertSharedCart([page, second], [added]);
  await second.evaluate('localStorage.clear()');
  await page.wait(`document.querySelectorAll('[data-testid^="cart-item-"]').length === 0`);
  assert.equal(await page.evaluate(`localStorage.getItem('dgs-web-cart')`), null);
});

for (const action of ['quantity', 'remove-linked', 'remove-other']) {
  test(`two tabs: delayed editorial purchase preserves the other tab's ${action} edit`, async context => {
    const { page, item } = await openCart(context, 'кг', 0.735);
    let releaseProduct;
    let productRequested = false;
    const productResponse = new Promise(resolve => { releaseProduct = resolve; });
    // Release on failure too, so a pending interception cannot block cleanup.
    const latest = { ...product, id: item.productId, name: 'Prezzo aggiornato', price: '2300.00' };
    context.after(() => releaseProduct(latest));
    const article = {
      id: 'cart-sync-article', title: 'Formaggio di prova', country: 'Italia',
      description: '', photos: [], history: '', characteristics: '', culinaryUses: '',
      productionCountry: '', sources: [], externalVideoUrls: [], relatedVideos: [],
      products: [latest],
    };
    const { page: editorial, requests } = await wishlistPage(browser, context, {
      authenticated: false, sharedWith: page,
      responses: {
        '/web-api/editorial/cheeses/cart-sync-article': article,
        '/web-api/editorial/cheeses/cart-sync-article/prices': { items: [], page: 1, limit: 10, total: 0 },
        [`/web-api/products/${latest.slug}`]: () => {
          productRequested = true;
          return productResponse;
        },
      },
    });
    // Make the editorial store stale while the product check is in flight.
    await editorial.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.addEventListener('storage', event => event.stopImmediatePropagation());
    ` });
    await editorial.send('Page.navigate', { url: `${wishlistBase}/web/cheeses/${article.id}` });
    await editorial.click('.ed-product button');
    await editorial.wait(`document.querySelector('.ed-product button')?.disabled`);
    assert.equal(productRequested, true, 'The product check must reach the mocked API before editing');
    let expected;
    const refreshed = {
      ...item, productName: latest.name, price: latest.price, image: undefined,
      quantity: action === 'quantity' ? 0.935 : action === 'remove-linked' ? 0.2 : 0.835,
    };
    // JSON persistence omits undefined image values.
    delete refreshed.image;
    if (action === 'quantity') {
      await page.click(increase);
      await assertSharedCart([page], [{ ...item, quantity: 0.835 }, unrelated]);
      expected = [refreshed, unrelated];
    } else if (action === 'remove-linked') {
      await page.click('[data-testid="button-remove-quantity-test"]');
      await assertSharedCart([page], [unrelated]);
      // The pending user-requested addition is intentional, but must start at
      // the initial quantity, not resurrect the removed quantity of 0.735.
      expected = [unrelated, refreshed];
    } else {
      await page.click('[data-testid="button-remove-untouched"]');
      await assertSharedCart([page], [item]);
      expected = [refreshed];
    }
    releaseProduct(latest);
    await editorial.wait(`document.querySelector('.ed-product [role="status"]')?.textContent.includes('Добавлено')`);
    assert.ok(requests.some(request => request.path === `/web-api/products/${latest.slug}`));
    await assertSharedCart([page], expected);
    // The article is long and its purchase button is below the fold. Navigate
    // explicitly rather than depending on header scrolling/animation timing.
    await editorial.send('Page.navigate', { url: `${wishlistBase}/web/cart` });
    await assertSharedCart([page, editorial], expected);
    await editorial.send('Page.reload');
    await assertSharedCart([page, editorial], expected);
  });
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
