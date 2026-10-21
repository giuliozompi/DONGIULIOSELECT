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
} = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const requests = [];
  const savedAddresses = [...initialAddresses];
  let releaseAddresses;
  const addressesReady = new Promise(resolve => { releaseAddresses = resolve; });
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
    } else if (path === '/web-api/orders' && event.request.method === 'POST') {
      if (!allowOrder) throw new Error('This test must not submit an order');
      // Fulfilled entirely in the browser: never create real orders or payments.
      savedOrder = { ...JSON.parse(event.request.postData), id: 'test-order', status: 'НОВЫЙ', createdAt: profile.createdAt };
      status = 201;
      body = savedOrder;
    } else if (path === '/web-api/orders/test-order') {
      body = savedOrder;
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: path.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(path.includes('telegram-web-app') ? '' : JSON.stringify(body)).toString('base64'),
    });
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('dgs-web-cart', ${JSON.stringify(JSON.stringify(emptyCart ? { ...cart, state: { items: [], itemCount: 0, subtotal: 0 } } : cart))});`,
  });
  return {
    page, requests, savedAddresses, releaseAddresses,
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
