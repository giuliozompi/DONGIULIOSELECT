import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { launchBrowser } from './helpers/browser.mjs';

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

async function openPage(context, { authenticated = false, registrationError = false, emptyCart = false } = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const requests = [];
  let currentUser = profile;
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*/web-api/*' }, { urlPattern: '*telegram.org/js/telegram-web-app.js*' }] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    requests.push({ path, method: event.request.method });
    let status = 200;
    let body = [];
    if (path.endsWith('/auth/refresh')) {
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
      throw new Error('These tests must never submit an order');
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
  return { page, requests };
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
