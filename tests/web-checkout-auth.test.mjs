import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const cart = {
  state: {
    items: [{ productId: 'test-product', productName: 'Test cheese', quantity: 0.735,
      price: '2000.00', unit: 'кг' }],
    itemCount: 1, subtotal: 1470,
  }, version: 0,
};
const profile = { id: 'test-web-user', firstName: 'Test', lastName: 'Customer',
  email: 'checkout-test@example.invalid', phone: '', isEmailVerified: false,
  marketingConsent: false, createdAt: '2026-01-01T00:00:00Z' };
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function openPage(context, {
  authenticated = false, registrationError = false, emptyCart = false,
  suggestions = [], suggestionsUnavailable = false, allowOrder = false,
  initialAddresses = [], holdAddresses = false, addressesUnavailable = false,
  addressesByUser = {}, addressUpdateError = false,
  addressDeleteError = false, holdAddressDelete = false,
  holdSuggestions = false,
  orderResponses = [],
  promoValidation = { valid: true, discountPercent: 10 },
} = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const requests = [];
  const savedAddresses = [...initialAddresses];
  let releaseAddresses;
  const addressesReady = new Promise(resolve => { releaseAddresses = resolve; });
  let releaseAddressDelete;
  const addressDeleteReady = new Promise(resolve => { releaseAddressDelete = resolve; });
  let releaseSuggestions;
  const suggestionsReady = new Promise(resolve => { releaseSuggestions = resolve; });
  let savedOrder;
  let currentUser = profile;
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/address/suggest*' },
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    requests.push({
      path, method: event.request.method,
      userId: authenticated ? currentUser.id : null,
      body: (path.startsWith('/web-api/addresses') || path === '/web-api/orders') && event.request.postData
        ? JSON.parse(event.request.postData) : undefined,
    });
    let status = 200;
    let body = [];
    if (path === '/api/address/suggest') {
      if (holdSuggestions) await suggestionsReady;
      status = suggestionsUnavailable ? 503 : 200;
      body = suggestionsUnavailable ? { error: 'Suggestions unavailable' } : { suggestions };
    } else if (path === '/web-api/addresses') {
      if (event.request.method === 'POST') {
        const address = { ...JSON.parse(event.request.postData), id: 'test-address', createdAt: profile.createdAt };
        savedAddresses.push(address);
        status = 201;
        body = address;
      } else if (!authenticated) {
        status = 401;
        body = { error: 'Not signed in' };
      } else {
        // Capture the requesting identity before any delayed response.
        body = addressesByUser[currentUser.id] || savedAddresses;
        if (holdAddresses) await addressesReady;
        if (addressesUnavailable) {
          status = 503;
          body = { error: 'Address book unavailable' };
        }
      }
    } else if (path.startsWith('/web-api/addresses/') && event.request.method === 'DELETE') {
      if (holdAddressDelete) await addressDeleteReady;
      const index = savedAddresses.findIndex(address => address.id === path.split('/').pop());
      if (addressDeleteError) {
        status = 500;
        body = { error: 'Не удалось удалить адрес' };
      } else if (index < 0) {
        status = 404;
        body = { error: 'Адрес не найден' };
      } else {
        savedAddresses.splice(index, 1);
        status = 204;
        body = undefined;
      }
    } else if (path.startsWith('/web-api/addresses/') && event.request.method === 'PATCH') {
      const index = savedAddresses.findIndex(address => address.id === path.split('/').pop());
      if (addressUpdateError) {
        status = 500;
        body = { error: 'Не удалось сохранить адрес' };
      } else if (index < 0) {
        status = 404;
        body = { error: 'Адрес не найден' };
      } else {
        savedAddresses[index] = { ...savedAddresses[index], ...JSON.parse(event.request.postData) };
        body = savedAddresses[index];
      }
    } else if (path.endsWith('/auth/refresh')) {
      status = authenticated ? 200 : 401;
      body = authenticated ? { accessToken: 'test-token', user: currentUser } : { error: 'Not signed in' };
    } else if (path.endsWith('/auth/register')) {
      if (registrationError) { status = 409; body = { error: 'Email уже зарегистрирован' }; }
      else {
        const input = JSON.parse(event.request.postData);
        currentUser = { ...profile, firstName: input.firstName, lastName: input.lastName, email: input.email };
        authenticated = true;
        body = { accessToken: 'test-token', user: currentUser };
      }
    } else if (path.endsWith('/auth/login')) {
      authenticated = true;
      body = { accessToken: 'test-token', user: currentUser };
    } else if (path === '/web-api/promo/validate') {
      body = promoValidation;
    } else if (path === '/web-api/orders' && event.request.method === 'POST') {
      if (!allowOrder) throw new Error('This test must not submit an order');
      // Fulfilled entirely in the browser: never create real orders or payments.
      const response = orderResponses.shift();
      if (response) {
        status = response.status;
        body = response.body;
      } else {
        savedOrder = { ...JSON.parse(event.request.postData), id: 'test-order', status: 'НОВЫЙ', createdAt: profile.createdAt };
        status = 201;
        body = savedOrder;
      }
    } else if (path === '/web-api/orders/test-order') {
      body = savedOrder;
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: path.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(path.includes('telegram-web-app') || status === 204 ? '' : JSON.stringify(body)).toString('base64'),
    });
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('dgs-web-cart', ${JSON.stringify(JSON.stringify(emptyCart ? { ...cart, state: { items: [], itemCount: 0, subtotal: 0 } } : cart))});`,
  });
  return {
    page, requests, savedAddresses, releaseAddresses, releaseAddressDelete, releaseSuggestions,
    async switchUser(user) {
      currentUser = user;
      authenticated = !!user;
      await page.evaluate(`(async () => {
        const { useWebAuth } = await import('/src/web/hooks/useWebAuth.ts');
        useWebAuth.setState({ user: ${JSON.stringify(user)}, isAuthenticated: ${!!user}, isLoading: false });
      })()`);
    },
  };
}

const selector = id => `[data-testid="${id}"]`;
const exists = id => `!!document.querySelector(${JSON.stringify(selector(id))})`;
const revisedQuote = {
  items: [{ ...cart.state.items[0], productName: 'Current cheese', price: '2400.00' }],
  subtotal: '1764.00', amount: '1764.00', discount: '0.00', discountPercent: 0,
};
const changedResponse = quote => ({ status: 409, body: {
  code: 'CHECKOUT_CHANGED', error: 'Условия заказа изменились', quote,
} });
async function fillCheckout(page) {
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-checkout-name'));
  await page.fill(selector('input-checkout-phone'), '+79999999999');
  await page.fill(selector('input-checkout-address'), 'Test delivery address, building 1');
}
test('checkout pricing requires a second explicit confirmation and retains cart and draft', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, allowOrder: true, orderResponses: [changedResponse(revisedQuote)],
  });
  await fillCheckout(page);
  await page.click(selector('button-place-order'));
  await page.wait(exists('checkout-revised'));
  assert.equal(requests.filter(r => r.path === '/web-api/orders' && r.method === 'POST').length, 1);
  assert.equal(await page.evaluate('location.pathname'), '/web/checkout');
  await assertCartPreserved(page);
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-checkout-address'))}).value`), 'Test delivery address, building 1');
  assert.match(await page.evaluate('document.body.textContent'), /Current cheese/);
  assert.match(await page.evaluate(`document.querySelector(${JSON.stringify(selector('button-place-order'))}).textContent`), /Подтвердить обновлённый заказ/);
  await page.click(selector('button-place-order'));
  await page.wait(`location.pathname === '/web/order-success/test-order'`);
  const posts = requests.filter(r => r.path === '/web-api/orders' && r.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[1].body.amount, '1764.00');
  assert.equal(posts[1].body.items[0].price, '2400.00');
  assert.equal(posts[1].body.items[0].quantity, 0.735);
});
test('checkout pricing handles a second price change and invalid promo feedback without automatic retries', async context => {
  const removedPromo = { ...revisedQuote, message: 'Промокод уже использован. Скидка удалена.' };
  const secondQuote = { ...revisedQuote, items: [{ ...revisedQuote.items[0], price: '2500.00' }],
    subtotal: '1837.50', amount: '1837.50' };
  const { page, requests } = await openPage(context, {
    authenticated: true, allowOrder: true,
    orderResponses: [changedResponse(removedPromo), changedResponse(secondQuote)],
  });
  await fillCheckout(page);
  await page.fill(selector('input-promo-code'), 'BENVENUTO-TEST');
  await page.click(selector('button-apply-promo'));
  await page.wait(`document.body.textContent.includes('BENVENUTO-TEST (-10%)')`);
  await page.click(selector('button-place-order'));
  await page.wait(exists('checkout-revised'));
  assert.match(await page.evaluate('document.body.textContent'), /Скидка удалена/);
  assert.equal(await page.evaluate(`document.body.textContent.includes('BENVENUTO-TEST (-10%)')`), false);
  await page.click(selector('button-place-order'));
  await page.wait(`document.querySelector('[data-testid="checkout-revised"]')?.textContent.includes('Цены или итог обновлены')`);
  const posts = requests.filter(r => r.path === '/web-api/orders' && r.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.promoCode, 'BENVENUTO-TEST');
  assert.equal(posts[1].body.promoCode, undefined);
  await assertCartPreserved(page);
  assert.equal(await page.evaluate('location.pathname'), '/web/checkout');
});
test('checkout pricing shows unavailable products persistently and preserves the cart', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, allowOrder: true, orderResponses: [
      { status: 422, body: { error: 'Товар «Test cheese» недоступен. Вернитесь в корзину и удалите его.' } },
    ],
  });
  await fillCheckout(page);
  await page.click(selector('button-place-order'));
  await page.wait(exists('checkout-error'));
  assert.match(await page.evaluate(`document.querySelector('[data-testid="checkout-error"]').textContent`), /недоступен/);
  assert.equal(requests.filter(r => r.path === '/web-api/orders' && r.method === 'POST').length, 1);
  await assertCartPreserved(page);
});
async function register(page) {
  await page.wait(exists('input-register-firstname'));
  await page.fill(selector('input-register-firstname'), 'New');
  await page.fill(selector('input-register-lastname'), 'Customer');
  await page.fill(selector('input-register-email'), profile.email);
  await page.fill(selector('input-register-password'), 'test-password-only');
  await page.click(selector('button-register-submit'));
}
async function assertCartPreserved(page) {
  const saved = await page.evaluate(`JSON.parse(localStorage.getItem('dgs-web-cart')).state`);
  assert.deepEqual(saved, cart.state);
}

test('guest cart opens registration and resumes checkout after registering, without losing products', async context => {
  const { page, requests } = await openPage(context);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.navigate', { url: `${base}/web/cart` });
  await page.click(selector('button-checkout'));
  await register(page);
  await page.wait(exists('input-checkout-name'));
  assert.equal(await page.evaluate('location.pathname'), '/web/checkout');
  await page.wait(`document.querySelector(${JSON.stringify(selector('input-checkout-name'))}).value === 'New Customer'`);
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-checkout-email'))}).value`), profile.email);
  await assertCartPreserved(page);
  assert.equal(requests.filter(request => request.path.endsWith('/auth/register')).length, 1);
  assert.equal(requests.filter(request => request.path === '/web-api/orders' && request.method === 'POST').length, 0);
});

test('existing customer can switch to login and continue the same checkout', async context => {
  const { page } = await openPage(context);
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-register-firstname'));
  await page.click('[role="tab"][id$="-trigger-login"]');
  await page.wait(exists('input-login-email'));
  await page.fill(selector('input-login-email'), profile.email);
  await page.fill(selector('input-login-password'), 'test-password-only');
  await page.click(selector('button-login-submit'));
  await page.wait(exists('input-checkout-name'));
  assert.equal(await page.evaluate('location.pathname'), '/web/checkout');
  await assertCartPreserved(page);
});

test('registration errors preserve the cart and allow closing and reopening registration', async context => {
  const { page } = await openPage(context, { registrationError: true });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await register(page);
  await page.wait(`document.body.textContent.includes('Email уже зарегистрирован')`);
  assert.equal(await page.evaluate(exists('input-checkout-name')), false);
  await assertCartPreserved(page);
  await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === 'Close').click()`);
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  await page.click(selector('button-checkout-register'));
  await page.wait(exists('input-register-firstname'));
});

test('restored session skips registration and pre-fills checkout from the profile', async context => {
  const { page } = await openPage(context, { authenticated: true });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-checkout-name'));
  assert.equal(await page.evaluate(`!!document.querySelector('[role="dialog"]')`), false);
  await page.wait(`document.querySelector(${JSON.stringify(selector('input-checkout-name'))}).value === 'Test Customer'`);
  await assertCartPreserved(page);
});

test('empty cart goes back to the cart without opening registration', async context => {
  const { page } = await openPage(context, { emptyCart: true });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(`location.pathname === '/web/cart' && document.body.textContent.includes('Корзина пуста')`);
  assert.equal(await page.evaluate(`!!document.querySelector('[role="dialog"]')`), false);
});

test('reauthentication preserves contact edits and the delivery draft', async context => {
  const { page } = await openPage(context, { authenticated: true });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-checkout-name'));
  await page.fill(selector('input-checkout-name'), 'Custom recipient');
  await page.fill(selector('input-checkout-address'), 'Test delivery address, building 1');
  await page.evaluate(`(async () => {
    const { useWebAuth } = await import('/src/web/hooks/useWebAuth.ts');
    useWebAuth.setState({ user: null, isAuthenticated: false, isLoading: false });
  })()`);
  await register(page);
  await page.wait(exists('input-checkout-name'));
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-checkout-name'))}).value`), 'Custom recipient');
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-checkout-address'))}).value`), 'Test delivery address, building 1');
  await assertCartPreserved(page);
});

const normalizedAddress = {
  fullAddress: 'г Москва, ул Тверская, д 1, кв 42',
  city: 'Москва', street: 'Тверская', building: '1', flat: '42',
  postalCode: '125009', fiasId: 'test-fias', geoLat: '55.76', geoLon: '37.61',
};

async function pressKey(page, key) {
  const code = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9 }[key];
  await page.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key, windowsVirtualKeyCode: code,
    ...(key === 'Enter' ? { text: '\r' } : {}),
  });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code });
}

async function comboboxState(page, id) {
  return page.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector(id))});
    const activeId = input.getAttribute('aria-activedescendant');
    const list = document.getElementById(input.getAttribute('aria-controls'));
    const active = activeId && document.getElementById(activeId);
    return {
      role: input.getAttribute('role'), expanded: input.getAttribute('aria-expanded'),
      autocomplete: input.getAttribute('aria-autocomplete'), listRole: list?.getAttribute('role'),
      active: active?.getAttribute('data-testid') || null,
      selected: active?.getAttribute('aria-selected') || null,
      focused: document.activeElement === input, value: input.value,
      labelled: !!document.querySelector('label[for="' + input.id + '"]'),
      description: input.getAttribute('aria-describedby'),
    };
  })()`);
}

const alternateAddress = {
  ...normalizedAddress, fullAddress: 'г Москва, ул Тверская, д 2, кв 7',
  building: '2', flat: '7', fiasId: 'test-fias-2',
};

test('address book keyboard navigation keeps focus, requires explicit selection and never submits the open popup', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, suggestions: [normalizedAddress, alternateAddress],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-add-address'));
  await page.click(selector('input-saved-address'));
  const draft = 'Москва Тверская';
  await page.fill(selector('input-saved-address'), draft);
  await page.wait(exists('address-suggestions-list'));
  let state = await comboboxState(page, 'input-saved-address');
  assert.equal(state.role, 'combobox');
  assert.equal(state.autocomplete, 'list');
  assert.equal(state.listRole, 'listbox');
  assert.equal(state.expanded, 'true');
  assert.equal(state.active, null);
  assert.equal(state.labelled, true);
  assert.ok(state.description);
  await pressKey(page, 'Enter');
  assert.equal((await comboboxState(page, 'input-saved-address')).value, draft);
  await pressKey(page, 'ArrowDown');
  assert.equal((await comboboxState(page, 'input-saved-address')).active, 'address-suggestion-0');
  await pressKey(page, 'ArrowDown');
  assert.equal((await comboboxState(page, 'input-saved-address')).active, 'address-suggestion-1');
  await pressKey(page, 'ArrowDown');
  assert.equal((await comboboxState(page, 'input-saved-address')).active, 'address-suggestion-0');
  await pressKey(page, 'ArrowUp');
  state = await comboboxState(page, 'input-saved-address');
  assert.equal(state.active, 'address-suggestion-1');
  assert.equal(state.selected, 'true');
  assert.equal(state.focused, true);
  assert.equal(state.value, draft);
  // Typing invalidates the highlighted result, even if the next response is identical.
  await page.fill(selector('input-saved-address'), `${draft} 2`);
  assert.equal((await comboboxState(page, 'input-saved-address')).active, null);
  await page.wait(exists('address-suggestions-list'));
  assert.equal((await comboboxState(page, 'input-saved-address')).active, null);
  await pressKey(page, 'ArrowUp');
  // IME confirmation must not choose an address or consume its key event.
  assert.equal(await page.evaluate(`(() => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(event);
    return event.defaultPrevented;
  })()`), false);
  assert.equal((await comboboxState(page, 'input-saved-address')).expanded, 'true');
  await pressKey(page, 'Enter');
  state = await comboboxState(page, 'input-saved-address');
  assert.equal(state.value, alternateAddress.fullAddress);
  assert.equal(state.expanded, 'false');
  assert.equal(state.active, null);
  assert.equal(state.focused, true);
  assert.equal(requests.some(r => r.path === '/web-api/addresses' && r.method === 'POST'), false);
  await page.click(selector('button-save-address'));
  await page.wait(exists('card-address-test-address'));
  const saved = requests.find(r => r.path === '/web-api/addresses' && r.method === 'POST');
  assert.equal(saved.body.building, alternateAddress.building);
  assert.equal(saved.body.apartment, alternateAddress.flat);
});

test('editing an address supports Escape, Tab and fresh keyboard selection without saving implicitly', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress], suggestions: [normalizedAddress, alternateAddress],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-edit-address-home'));
  await page.click(selector('input-saved-address'));
  await page.wait(exists('address-suggestions-list'));
  await pressKey(page, 'ArrowUp');
  assert.equal((await comboboxState(page, 'input-saved-address')).active, 'address-suggestion-1');
  await pressKey(page, 'Escape');
  assert.equal((await comboboxState(page, 'input-saved-address')).value, homeAddress.fullAddress);
  assert.equal(await page.evaluate(`!!document.querySelector('[role="dialog"]')`), true);
  await delay(400);
  assert.equal(await page.evaluate(exists('address-suggestions-list')), false);
  await pressKey(page, 'Tab');
  await page.click(selector('input-saved-address'));
  await page.wait(exists('address-suggestions-list'));
  assert.equal((await comboboxState(page, 'input-saved-address')).active, null);
  await pressKey(page, 'ArrowDown');
  await pressKey(page, 'Tab');
  assert.equal((await comboboxState(page, 'input-saved-address')).expanded, 'false');
  assert.equal((await comboboxState(page, 'input-saved-address')).focused, false);
  assert.notEqual(await page.evaluate(`document.activeElement.getAttribute('role')`), 'option');
  await page.click(selector('input-saved-address'));
  await page.wait(exists('address-suggestions-list'));
  await pressKey(page, 'ArrowDown');
  await pressKey(page, 'Enter');
  assert.equal(requests.some(r => r.method === 'PATCH'), false);
  await page.click(selector('button-save-address'));
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  assert.equal(requests.find(r => r.method === 'PATCH').body.fullAddress, normalizedAddress.fullAddress);
});

test('Escape during debounce cancels suggestions; another Escape still closes the address dialog', async context => {
  const { page, requests } = await openPage(context, { authenticated: true, suggestions: [normalizedAddress] });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-add-address'));
  await page.click(selector('input-saved-address'));
  await page.fill(selector('input-saved-address'), 'Москва');
  await pressKey(page, 'Escape');
  await delay(450);
  assert.equal(await page.evaluate(`!!document.querySelector('[role="dialog"]')`), true);
  assert.equal(requests.some(r => r.path === '/api/address/suggest'), false);
  await pressKey(page, 'Escape');
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  assert.equal(requests.some(r => r.path === '/web-api/addresses' && r.method === 'POST'), false);
});

test('checkout keyboard selection prevents premature orders and preserves normal Enter submission after selection', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, suggestions: [normalizedAddress, alternateAddress], allowOrder: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-checkout-address'));
  await page.fill(selector('input-checkout-phone'), '+79990000000');
  await page.click(selector('input-checkout-address'));
  await page.fill(selector('input-checkout-address'), 'Москва Тверская');
  await page.wait(exists('address-suggestions-list'));
  await pressKey(page, 'Enter');
  await pressKey(page, 'ArrowDown');
  await pressKey(page, 'Enter');
  assert.equal(requests.some(r => r.path === '/web-api/orders' && r.method === 'POST'), false);
  assert.equal((await comboboxState(page, 'input-checkout-address')).value, normalizedAddress.fullAddress);
  await pressKey(page, 'Enter');
  await page.wait(`location.pathname === '/web/order-success/test-order'`);
  const orders = requests.filter(r => r.path === '/web-api/orders' && r.method === 'POST');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].body.deliveryAddress, normalizedAddress.fullAddress);
});

for (const dismissKey of ['Escape', 'Tab']) {
  test(`late suggestions stay closed after ${dismissKey} without changing the checkout draft`, async context => {
    const { page, requests, releaseSuggestions } = await openPage(context, {
      authenticated: true, suggestions: [normalizedAddress], holdSuggestions: true,
    });
    context.after(releaseSuggestions);
    await page.send('Page.navigate', { url: `${base}/web/checkout` });
    await page.wait(exists('input-checkout-address'));
    await page.click(selector('input-checkout-address'));
    await page.fill(selector('input-checkout-address'), 'Москва, ручной адрес');
    await page.wait(`!!document.querySelector('[data-testid="input-checkout-address"]').parentElement.querySelector('.animate-spin')`);
    await pressKey(page, dismissKey);
    releaseSuggestions();
    await delay(500);
    const state = await comboboxState(page, 'input-checkout-address');
    assert.equal(state.expanded, 'false');
    assert.equal(state.active, null);
    assert.equal(state.value, 'Москва, ручной адрес');
    assert.equal(await page.evaluate(exists('address-suggestions-list')), false);
    assert.equal(requests.filter(r => r.path === '/api/address/suggest').length, 1);
  });
}

test('checkout uses the Telegram DaData endpoint and submits the selected normalized address', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, suggestions: [normalizedAddress], allowOrder: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-checkout-address'));
  await page.fill(selector('input-checkout-address'), 'Москва Тверская 1');
  await page.click(selector('address-suggestion-0'));
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-checkout-address'))}).value`), normalizedAddress.fullAddress);
  await delay(500);
  assert.equal(await page.evaluate(exists('address-suggestions-list')), false);
  assert.equal(requests.filter(request => request.path === '/api/address/suggest').length, 1);
  await page.fill(selector('input-checkout-phone'), '+79990000000');
  await page.click(selector('button-place-order'));
  await page.wait(`location.pathname === '/web/order-success/test-order'`);
  const order = requests.find(request => request.path === '/web-api/orders' && request.method === 'POST');
  assert.equal(order.body.deliveryAddress, normalizedAddress.fullAddress);
});

test('address book saves normalized city, street, building, apartment and postal code', async context => {
  const { page, requests, savedAddresses } = await openPage(context, {
    authenticated: true, suggestions: [normalizedAddress],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-add-address'));
  await page.fill(selector('input-saved-address'), 'Москва Тверская 1');
  await page.click(selector('address-suggestion-0'));
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-address-city'))}).value`), 'Москва');
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-address-postal-code'))}).value`), '125009');
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-address-apartment'))}).value`), '42');
  await page.click(selector('button-save-address'));
  await page.wait(`!!document.querySelector('[data-testid="card-address-test-address"]')`);
  const saved = requests.find(request => request.path === '/web-api/addresses' && request.method === 'POST');
  assert.equal(saved.body.fullAddress, normalizedAddress.fullAddress);
  for (const key of ['city', 'street', 'building', 'postalCode']) {
    assert.equal(saved.body[key], normalizedAddress[key]);
  }
  assert.equal(saved.body.apartment, '42');
  assert.equal(savedAddresses.length, 1);
});

test('editing a selected address does not retain structured data from the previous selection', async context => {
  const { page, requests } = await openPage(context, { authenticated: true, suggestions: [normalizedAddress] });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-add-address'));
  await page.fill(selector('input-saved-address'), 'Москва Тверская 1');
  await page.click(selector('address-suggestion-0'));
  await page.fill(selector('input-saved-address'), 'Санкт-Петербург, Невский проспект, д 2');
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector('input-address-city'))}).value`), '');
  await page.fill(selector('input-address-city'), 'Санкт-Петербург');
  await page.click(selector('button-save-address'));
  await page.wait(`!!document.querySelector('[data-testid="card-address-test-address"]')`);
  const saved = requests.find(request => request.path === '/web-api/addresses' && request.method === 'POST');
  assert.equal(saved.body.city, 'Санкт-Петербург');
  for (const key of ['street', 'building', 'postalCode', 'apartment']) assert.equal(saved.body[key], '');
});

test('unavailable suggestions preserve manual address entry and do not block checkout', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, suggestionsUnavailable: true, allowOrder: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-checkout-address'));
  const manualAddress = 'Москва, улица Тверская, дом 1, квартира 42';
  await page.fill(selector('input-checkout-address'), manualAddress);
  await delay(650);
  assert.equal(await page.evaluate(exists('address-suggestions-list')), false);
  assert.equal(requests.filter(request => request.path === '/api/address/suggest').length, 1);
  await page.fill(selector('input-checkout-phone'), '+79990000000');
  await page.click(selector('button-place-order'));
  await page.wait(`location.pathname === '/web/order-success/test-order'`);
  const order = requests.find(request => request.path === '/web-api/orders' && request.method === 'POST');
  assert.equal(order.body.deliveryAddress, manualAddress);
});

const homeAddress = {
  id: 'home', label: 'Дом', fullAddress: 'г Москва, ул Тестовая, д 5',
  city: 'Москва', apartment: '42', notes: 'Подъезд 2, этаж 7, домофон 42',
  isDefault: true, createdAt: profile.createdAt,
};
const officeAddress = {
  ...homeAddress, id: 'office', label: 'Офис', isDefault: false,
  fullAddress: 'г Москва, ул Другая, д 10, кв 8', apartment: '8', notes: null,
};

test('address deletion requires confirmation and sends only one request while pending', async context => {
  const { page, requests, savedAddresses, releaseAddressDelete } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress, officeAddress], holdAddressDelete: true,
  });
  context.after(releaseAddressDelete);
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-delete-address-home'));
  await page.wait(`!!document.querySelector('[role="alertdialog"]')`);
  const dialog = await page.evaluate(`(() => {
    const dialog = document.querySelector('[role="alertdialog"]');
    return {
      title: document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,
      description: document.getElementById(dialog.getAttribute('aria-describedby')).textContent,
    };
  })()`);
  assert.equal(dialog.title, 'Удалить адрес?');
  assert.ok(dialog.description.includes(homeAddress.label));
  assert.ok(dialog.description.includes(`${homeAddress.fullAddress}, кв. 42`));
  assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
  // Dispatch both clicks in the same render to exercise the synchronous lock.
  await page.evaluate(`(() => {
    const button = document.querySelector('[data-testid="button-confirm-delete-address"]');
    button.click(); button.click();
  })()`);
  await page.wait(`document.querySelector('[data-testid="button-confirm-delete-address"]').disabled`);
  assert.equal(requests.filter(r => r.method === 'DELETE').length, 1);
  assert.equal(requests.find(r => r.method === 'DELETE').path, '/web-api/addresses/home');
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="button-cancel-delete-address"]').disabled`), true);
  assert.equal(await page.evaluate(exists('card-address-home')), true);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  assert.equal(await page.evaluate(`!!document.querySelector('[role="alertdialog"]')`), true);
  releaseAddressDelete();
  await page.wait(`!document.querySelector('[role="alertdialog"]') && !document.querySelector('[data-testid="card-address-home"]')`);
  assert.equal(await page.evaluate(exists('card-address-office')), true);
  assert.deepEqual(savedAddresses.map(address => address.id), ['office']);
  assert.equal(requests.filter(r => r.method === 'DELETE').length, 1);
  await page.wait(`document.body.textContent.includes('Адрес удалён')`);
});

test('address deletion can be cancelled by button or Escape with no request and restores focus', async context => {
  const { page, requests, savedAddresses } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  for (const method of ['button', 'keyboard']) {
    await page.click(selector('button-delete-address-home'));
    await page.wait(`document.activeElement?.dataset.testid === 'button-cancel-delete-address'`);
    if (method === 'button') {
      await page.click(selector('button-cancel-delete-address'));
    } else {
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', shiftKey: true, modifiers: 8 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
      assert.equal(await page.evaluate(`!!document.activeElement.closest('[role="alertdialog"]')`), true);
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    }
    await page.wait(`!document.querySelector('[role="alertdialog"]')`);
    await page.wait(`document.activeElement?.dataset.testid === 'button-delete-address-home'`);
    assert.equal(await page.evaluate(exists('card-address-home')), true);
  }
  assert.equal(requests.filter(r => r.method === 'DELETE').length, 0);
  assert.deepEqual(savedAddresses, [homeAddress]);
});

test('failed address deletion announces the error, keeps the card and allows retry or cancel', async context => {
  const { page, requests, savedAddresses } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress], addressDeleteError: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-delete-address-home'));
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.click(selector('button-confirm-delete-address'));
    await page.wait(`document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent.includes('Не удалось удалить адрес')
      && !document.querySelector('[data-testid="button-confirm-delete-address"]').disabled`);
    assert.equal(requests.filter(r => r.method === 'DELETE').length, attempt);
    assert.equal(await page.evaluate(exists('card-address-home')), true);
    assert.equal(await page.evaluate(`document.body.textContent.includes('Адрес удалён')`), false);
    assert.deepEqual(savedAddresses, [homeAddress]);
  }
  await page.click(selector('button-cancel-delete-address'));
  await page.wait(`!document.querySelector('[role="alertdialog"]')`);
  await page.click(selector('button-delete-address-home'));
  await page.wait(`!!document.querySelector('[role="alertdialog"]')`);
  assert.equal(await page.evaluate(`!!document.querySelector('[role="alertdialog"] [role="alert"]')`), false);
  assert.equal(await page.evaluate(exists('card-address-home')), true);
});

test('address editing prefills all fields, saves the same record and preserves apartment and notes', async context => {
  const initial = { ...homeAddress, street: 'ул Тестовая', building: '5', postalCode: '123456' };
  const { page, requests, savedAddresses } = await openPage(context, {
    authenticated: true, initialAddresses: [initial],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-edit-address-home'));
  for (const [id, expected] of [
    ['input-saved-address', initial.fullAddress], ['input-address-city', initial.city],
    ['input-address-apartment', initial.apartment], ['input-address-postal-code', initial.postalCode],
    ['input-address-notes', initial.notes],
  ]) {
    assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector(id))}).value`), expected);
  }
  await page.fill(selector('input-address-notes'), 'Новый код домофона');
  await page.click(selector('button-save-address'));
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  const patch = requests.find(r => r.method === 'PATCH');
  assert.equal(patch.path, '/web-api/addresses/home');
  assert.equal(patch.body.apartment, '42');
  assert.equal(patch.body.street, initial.street);
  assert.equal(patch.body.building, initial.building);
  assert.equal(patch.body.notes, 'Новый код домофона');
  assert.equal(savedAddresses.length, 1);
  assert.equal(savedAddresses[0].id, initial.id);
  await page.wait(`document.querySelector('[data-testid="card-address-home"]').textContent.includes('Новый код домофона')`);
});

test('existing address normalization requires selection and saving; absent flat preserves the saved apartment', async context => {
  const suggestion = { ...normalizedAddress, flat: null };
  const { page, requests, savedAddresses } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress], suggestions: [suggestion],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-edit-address-home'));
  await page.click(selector('input-saved-address'));
  await page.click(selector('address-suggestion-0'));
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 0);
  assert.equal(savedAddresses[0].fullAddress, homeAddress.fullAddress);
  await page.click(selector('button-save-address'));
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  const patch = requests.find(r => r.method === 'PATCH');
  for (const field of ['fullAddress', 'city', 'street', 'building', 'postalCode']) {
    assert.equal(patch.body[field], suggestion[field]);
  }
  assert.equal(patch.body.apartment, homeAddress.apartment);
  assert.equal(patch.body.notes, homeAddress.notes);
});

test('cancel, Escape and dialog close discard address edits, including a selected normalization', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress], suggestions: [normalizedAddress],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  for (const close of ['cancel', 'escape', 'close']) {
    await page.click(selector('button-edit-address-home'));
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="input-saved-address"]').value`), homeAddress.fullAddress);
    await page.click(selector('input-saved-address'));
    await page.click(selector('address-suggestion-0'));
    await page.fill(selector('input-address-notes'), 'Discard me');
    if (close === 'cancel') await page.click(selector('button-cancel-address'));
    else if (close === 'escape') {
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    } else {
      await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => b.textContent.trim() === 'Close').click()`);
    }
    await page.wait(`!document.querySelector('[role="dialog"]')`);
  }
  assert.equal(requests.filter(r => ['PATCH', 'POST', 'DELETE'].includes(r.method) && r.path.includes('/addresses')).length, 0);
  await page.click(selector('button-add-address'));
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="input-saved-address"]').value`), '');
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="input-address-notes"]').value`), '');
});

test('manual changes to a saved address clear obsolete structure but retain apartment and notes', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, initialAddresses: [{ ...homeAddress, street: 'Старая', building: '5', postalCode: '123456' }],
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-edit-address-home'));
  await page.fill(selector('input-saved-address'), 'Санкт-Петербург, Невский проспект, д 2');
  await page.fill(selector('input-address-city'), 'Санкт-Петербург');
  await page.click(selector('button-save-address'));
  await page.wait(`!document.querySelector('[role="dialog"]')`);
  const patch = requests.find(r => r.method === 'PATCH');
  for (const field of ['street', 'building', 'postalCode']) assert.equal(patch.body[field], '');
  assert.equal(patch.body.apartment, homeAddress.apartment);
  assert.equal(patch.body.notes, homeAddress.notes);
});

test('failed address save retains the draft and permits retry or cancellation', async context => {
  const { page, savedAddresses } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress], addressUpdateError: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.click(selector('button-edit-address-home'));
  await page.fill(selector('input-address-notes'), 'Unsaved draft');
  await page.click(selector('button-save-address'));
  await page.wait(`document.body.textContent.includes('Не удалось сохранить адрес')`);
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="input-address-notes"]').value`), 'Unsaved draft');
  assert.equal(savedAddresses[0].notes, homeAddress.notes);
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="button-save-address"]').disabled`), false);
  await page.click(selector('button-cancel-address'));
  await page.wait(`!document.querySelector('[role="dialog"]')`);
});
const checkoutValue = id => `document.querySelector(${JSON.stringify(selector(id))}).value`;
async function chooseAddress(page, id) {
  await page.wait(exists('select-checkout-saved-address'));
  await page.evaluate(`(() => {
    const select = document.querySelector(${JSON.stringify(selector('select-checkout-saved-address'))});
    select.value = ${JSON.stringify(id)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

test('saved address choice preserves apartment and courier notes in the order payload on mobile', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress, officeAddress], allowOrder: true,
  });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('select-checkout-saved-address'));
  // Even the default address is never applied without the customer's choice.
  assert.equal(await page.evaluate(checkoutValue('input-checkout-address')), '');
  await chooseAddress(page, 'home');
  const expected = `${homeAddress.fullAddress}, кв. 42`;
  assert.equal(await page.evaluate(checkoutValue('input-checkout-address')), expected);
  assert.equal(await page.evaluate(checkoutValue('input-checkout-notes')), homeAddress.notes);
  await page.fill(selector('input-checkout-phone'), '+79990000000');
  await page.click(selector('button-place-order'));
  await page.wait(`location.pathname === '/web/order-success/test-order'`);
  const order = requests.find(r => r.path === '/web-api/orders' && r.method === 'POST');
  assert.equal(order.body.deliveryAddress, expected);
  assert.equal(order.body.deliveryNotes, homeAddress.notes);
  assert.equal(order.userId, profile.id);
});

test('switching saved addresses avoids duplicated apartments and clears obsolete notes', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress, officeAddress], allowOrder: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await chooseAddress(page, 'home');
  await chooseAddress(page, 'office');
  assert.equal(await page.evaluate(checkoutValue('input-checkout-address')), officeAddress.fullAddress);
  assert.equal(await page.evaluate(checkoutValue('input-checkout-notes')), '');
  await chooseAddress(page, '');
  // Manual mode retains the fields and keeps DaData available.
  assert.equal(await page.evaluate(checkoutValue('input-checkout-address')), officeAddress.fullAddress);
  await page.fill(selector('input-checkout-address'), 'Москва, новый адрес, д 9, кв 3');
  await page.fill(selector('input-checkout-notes'), 'Позвонить за час');
  await page.fill(selector('input-checkout-phone'), '+79990000000');
  await page.click(selector('button-place-order'));
  await page.wait(`location.pathname === '/web/order-success/test-order'`);
  const order = requests.find(r => r.path === '/web-api/orders' && r.method === 'POST');
  assert.equal(order.body.deliveryAddress, 'Москва, новый адрес, д 9, кв 3');
  assert.equal(order.body.deliveryNotes, 'Позвонить за час');
});

test('late address loading and refetches never overwrite an edited delivery draft', async context => {
  const { page, releaseAddresses, savedAddresses } = await openPage(context, {
    authenticated: true, initialAddresses: [homeAddress], holdAddresses: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-checkout-address'));
  await page.fill(selector('input-checkout-address'), 'Москва, мой адрес, дом 12');
  await page.fill(selector('input-checkout-notes'), 'Мои инструкции курьеру');
  releaseAddresses();
  await page.wait(exists('select-checkout-saved-address'));
  assert.equal(await page.evaluate(checkoutValue('input-checkout-address')), 'Москва, мой адрес, дом 12');
  assert.equal(await page.evaluate(checkoutValue('input-checkout-notes')), 'Мои инструкции курьеру');
  await chooseAddress(page, 'home');
  await page.fill(selector('input-checkout-address'), 'Москва, исправленный адрес, дом 13');
  await page.fill(selector('input-checkout-notes'), 'Новый комментарий');
  savedAddresses.push(officeAddress);
  await page.evaluate(`(async () => {
    const { queryClient } = await import('/src/lib/queryClient.ts');
    await queryClient.invalidateQueries({ queryKey: ['/web-api/addresses'] });
  })()`);
  await page.wait(`!!document.querySelector('#checkout-saved-address option[value="office"]')`);
  assert.equal(await page.evaluate(checkoutValue('input-checkout-address')), 'Москва, исправленный адрес, дом 13');
  assert.equal(await page.evaluate(checkoutValue('input-checkout-notes')), 'Новый комментарий');
  assert.equal(await page.evaluate(checkoutValue('select-checkout-saved-address')), '');
});

test('address lists are authenticated and cache-isolated when customers change accounts', async context => {
  const otherUser = { ...profile, id: 'other-customer', email: 'other@example.invalid' };
  const otherAddress = { ...officeAddress, id: 'other-home', label: 'Другой клиент' };
  const { page, requests, switchUser } = await openPage(context, {
    addressesByUser: { [profile.id]: [homeAddress], [otherUser.id]: [otherAddress] },
  });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(exists('input-register-firstname'));
  assert.equal(requests.some(r => r.path === '/web-api/addresses'), false);
  await register(page);
  await page.wait(`!!document.querySelector('#checkout-saved-address option[value="home"]')`);
  assert.equal(await page.evaluate(`!!document.querySelector('#checkout-saved-address option[value="other-home"]')`), false);
  await switchUser(otherUser);
  await page.wait(`!!document.querySelector('#checkout-saved-address option[value="other-home"]')`);
  assert.equal(await page.evaluate(`!!document.querySelector('#checkout-saved-address option[value="home"]')`), false);
  const addressRequests = requests.filter(r => r.path === '/web-api/addresses');
  assert.deepEqual(addressRequests.map(r => r.userId), [profile.id, otherUser.id]);
  // The address book shares the same customer-scoped cache as checkout.
  await page.send('Page.navigate', { url: `${base}/web/account/addresses` });
  await page.wait(exists('card-address-other-home'));
  assert.equal(await page.evaluate(exists('card-address-home')), false);
});

test('address book failure is visible and does not block manual checkout', async context => {
  const { page, requests } = await openPage(context, {
    authenticated: true, addressesUnavailable: true, allowOrder: true,
  });
  await page.send('Page.navigate', { url: `${base}/web/checkout` });
  await page.wait(`document.body?.textContent.includes('Не удалось загрузить адреса')`);
  await page.fill(selector('input-checkout-address'), 'Москва, ручной адрес, дом 11');
  await page.fill(selector('input-checkout-phone'), '+79990000000');
  await page.click(selector('button-place-order'));
  await page.wait(`location.pathname === '/web/order-success/test-order'`);
  assert.equal(requests.find(r => r.path === '/web-api/orders' && r.method === 'POST').body.deliveryAddress,
    'Москва, ручной адрес, дом 11');
});
