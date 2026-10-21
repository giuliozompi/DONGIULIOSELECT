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
} = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const requests = [];
  const savedAddresses = [];
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
      body: ['/web-api/addresses', '/web-api/orders'].includes(path) && event.request.postData
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
      } else body = savedAddresses;
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
  return { page, requests, savedAddresses };
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
