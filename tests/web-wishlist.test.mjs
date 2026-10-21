import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';
import { wishlistBase, wishlistProduct as product, wishlistUser, wishlistPage } from './helpers/wishlist-fixture.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const selector = id => `[data-testid="${id}"]`;
const favorite = `button-favorite-${product.id}`;
const ready = id => `!!document.querySelector(${JSON.stringify(selector(id))}) && !document.querySelector(${JSON.stringify(selector(id))}).disabled`;
const selected = (id, value) => `${ready(id)} && document.querySelector(${JSON.stringify(selector(id))}).getAttribute('aria-pressed') === '${value}'`;
const postCount = requests => requests.filter(r => r.path === `/web-api/wishlist/${product.id}` && r.method === 'POST').length;

async function signIn(page) {
  await page.wait(ready('input-login-email'));
  await page.fill(selector('input-login-email'), wishlistUser.email);
  await page.fill(selector('input-login-password'), 'test-only-password');
  await page.click(selector('button-login-submit'));
}

test('catalog cheese wedge adds a favourite without opening the product or changing the cart', async context => {
  const { page, favorites, requests } = await wishlistPage(browser, context);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await page.wait(selected(favorite, false));
  assert.equal(await page.evaluate(`!!document.querySelector(${JSON.stringify(selector(favorite))} + ' svg[data-cheese-slice] circle')`), true);
  const height = await page.evaluate(`document.querySelector(${JSON.stringify(selector(favorite))}).getBoundingClientRect().height`);
  assert.ok(height >= 44);
  const cartBefore = await page.evaluate(`localStorage.getItem('dgs-web-cart')`);
  await page.click(selector(favorite));
  await page.wait(selected(favorite, true));
  assert.equal(await page.evaluate('location.pathname'), '/web/catalog');
  assert.equal(await page.evaluate(`localStorage.getItem('dgs-web-cart')`), cartBefore);
  assert.ok(favorites.get(wishlistUser.id).has(product.id));
  assert.equal(postCount(requests), 1);
  const image = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  await writeFile('/tmp/dg-wishlist-mobile.jpg', Buffer.from(image.data, 'base64'));
  await page.send('Page.navigate', { url: `${wishlistBase}/web/wishlist` });
  await page.wait(`!!document.querySelector(${JSON.stringify(selector(`wishlist-item-${product.id}`))})`);
});

test('product detail, reload and wishlist removal share the saved selection', async context => {
  const { page, favorites, requests } = await wishlistPage(browser, context, { initiallySelected: true });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/product/${product.slug}` });
  await page.wait(selected(favorite, true));
  await page.send('Page.reload');
  await page.wait(selected(favorite, true));
  await page.send('Page.navigate', { url: `${wishlistBase}/web/wishlist` });
  const remove = `button-remove-wishlist-${product.id}`;
  await page.wait(selected(remove, true));
  await page.click(selector(remove));
  await page.wait(`document.body?.textContent?.includes('Нет избранных товаров')`);
  assert.equal(favorites.get(wishlistUser.id).size, 0);
  assert.equal(postCount(requests), 1);
  await page.send('Page.navigate', { url: `${wishlistBase}/web/product/${product.slug}` });
  await page.wait(selected(favorite, false));
});

test('guest selection opens sign-in on the same page and adds the intended favourite afterwards', async context => {
  const { page, requests } = await wishlistPage(browser, context, { authenticated: false });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await page.wait(ready(favorite));
  await page.click(selector(favorite));
  await signIn(page);
  await page.wait(selected(favorite, true));
  assert.equal(await page.evaluate('location.pathname'), '/web/catalog');
  assert.equal(postCount(requests), 1);
});

test('guest signing in to an existing favourite does not accidentally remove it', async context => {
  const { page, favorites, requests } = await wishlistPage(browser, context, { authenticated: false, initiallySelected: true });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await page.wait(ready(favorite));
  await page.click(selector(favorite));
  await signIn(page);
  await page.wait(selected(favorite, true));
  assert.ok(favorites.get(wishlistUser.id).has(product.id));
  assert.equal(postCount(requests), 0);
});

test('failed save is visible, does not falsely select, and retries only on a new click', async context => {
  const { page, state, requests } = await wishlistPage(browser, context, { toggleFailure: true });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await page.wait(selected(favorite, false));
  await page.click(selector(favorite));
  await page.wait(`document.body?.textContent?.includes('Не удалось изменить избранное')`);
  await page.wait(selected(favorite, false));
  assert.equal(postCount(requests), 1);
  state.toggleFailure = false;
  await page.click(selector(favorite));
  await page.wait(selected(favorite, true));
  assert.equal(postCount(requests), 2);
});

test('rapid repeated clicks cannot send two toggle requests and undo the selection', async context => {
  const { page, requests } = await wishlistPage(browser, context, { toggleDelay: 250 });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await page.wait(selected(favorite, false));
  await page.evaluate(`(() => { const button = document.querySelector(${JSON.stringify(selector(favorite))}); button.click(); button.click(); })()`);
  await page.wait(selected(favorite, true));
  assert.equal(postCount(requests), 1);
});

test('wishlist load failure is not presented as an empty list and can be retried', async context => {
  const { page, state } = await wishlistPage(browser, context, { readFailure: true, initiallySelected: true });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/wishlist` });
  await page.wait(ready('button-retry-wishlist'));
  assert.equal(await page.evaluate(`document.body.textContent.includes('Нет избранных товаров')`), false);
  state.readFailure = false;
  await page.click(selector('button-retry-wishlist'));
  await page.wait(selected(`button-remove-wishlist-${product.id}`, true));
});

test('switching customers never exposes the previous account selection', async context => {
  const { page, state, favorites } = await wishlistPage(browser, context, { initiallySelected: true });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await page.wait(selected(favorite, true));
  state.userId = 'test-customer-b';
  await page.evaluate(`(async () => {
    const { useWebAuth } = await import('/src/web/hooks/useWebAuth.ts');
    useWebAuth.setState({ user: { ...useWebAuth.getState().user, id: 'test-customer-b' } });
  })()`);
  await page.wait(selected(favorite, false));
  await page.click(selector(favorite));
  await page.wait(selected(favorite, true));
  assert.ok(favorites.get(wishlistUser.id).has(product.id));
  assert.ok(favorites.get('test-customer-b').has(product.id));
});

test('cancelling sign-in cancels the pending favourite, even if the customer signs in later', async context => {
  const { page, requests } = await wishlistPage(browser, context, { authenticated: false });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/catalog` });
  await page.wait(ready(favorite));
  await page.click(selector(favorite));
  await page.wait(ready('input-login-email'));
  await page.evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(button => button.textContent.trim() === 'Close').click()`);
  assert.equal(await page.evaluate('location.pathname'), '/web/catalog');
  await page.evaluate(`(async () => {
    const { useWebAuth } = await import('/src/web/hooks/useWebAuth.ts');
    await useWebAuth.getState().login('wishlist-test@example.invalid', 'test-only-password');
  })()`);
  await page.wait(selected(favorite, false));
  assert.equal(postCount(requests), 0);
});

test('out-of-stock product can be selected and removed from its detail page', async context => {
  const { page, requests } = await wishlistPage(browser, context, { inStock: false });
  await page.send('Page.navigate', { url: `${wishlistBase}/web/product/${product.slug}` });
  await page.wait(selected(favorite, false));
  assert.equal(await page.evaluate(`document.querySelector('[data-testid="button-add-to-cart"]').disabled`), true);
  await page.click(selector(favorite));
  await page.wait(selected(favorite, true));
  await page.click(selector(favorite));
  await page.wait(selected(favorite, false));
  assert.equal(postCount(requests), 2);
});
