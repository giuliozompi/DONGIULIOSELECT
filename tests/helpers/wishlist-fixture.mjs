import { setTimeout as delay } from 'node:timers/promises';

export const wishlistBase = `https://${process.env.REPLIT_DEV_DOMAIN}`;
export const wishlistProduct = {
  id: 'test-cheese', name: 'Пармиджано Реджано', slug: 'test-cheese',
  price: '2000.00', unit: 'кг', images: [], inStock: true,
  categoryId: 'test-category', sortPriority: 1,
};
export const wishlistUser = {
  id: 'test-customer-a', firstName: 'Test', email: 'wishlist-test@example.invalid',
  isEmailVerified: true, marketingConsent: false, createdAt: '2026-01-01T00:00:00Z',
};

// Fixtures never contact the database or real registration/payment services.
export async function wishlistPage(browser, context, {
  authenticated = true, initiallySelected = false, toggleFailure = false,
  readFailure = false, toggleDelay = 0, inStock = true, productOverrides = {},
} = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const state = { authenticated, userId: wishlistUser.id, toggleFailure, readFailure };
  const favorites = new Map([[wishlistUser.id, new Set(initiallySelected ? [wishlistProduct.id] : [])]]);
  const requests = [];
  const product = { ...wishlistProduct, inStock, ...productOverrides };
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' },
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    requests.push({ path, method: event.request.method });
    let status = 200;
    let body = [];
    if (path === '/web-api/auth/refresh' || path === '/web-api/auth/login' || path === '/web-api/auth/register') {
      if (path !== '/web-api/auth/refresh') state.authenticated = true;
      status = state.authenticated ? 200 : 401;
      body = state.authenticated
        ? { accessToken: 'test-only-token', user: { ...wishlistUser, id: state.userId } }
        : { error: 'Требуется авторизация' };
    } else if (path === '/web-api/wishlist') {
      status = state.readFailure ? 503 : 200;
      body = state.readFailure ? { error: 'Избранное временно недоступно' }
        : [...(favorites.get(state.userId) ?? [])].map(id => ({
          id: `favorite-${id}`, productId: id, createdAt: wishlistUser.createdAt, product,
        }));
    } else if (path === `/web-api/wishlist/${product.id}` && ['PUT', 'DELETE'].includes(event.request.method)) {
      await delay(toggleDelay);
      if (state.toggleFailure) { status = 500; body = { error: 'Не удалось сохранить' }; }
      else {
        const selected = favorites.get(state.userId) ?? new Set();
        if (event.request.method === 'PUT') selected.add(product.id);
        else selected.delete(product.id);
        favorites.set(state.userId, selected);
        body = { inWishlist: selected.has(product.id) };
      }
    } else if (event.request.method !== 'GET') {
      await page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      throw new Error('Unexpected mutation in wishlist test');
    } else if (path === '/web-api/products') {
      body = { products: [product], pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } };
    } else if (path === `/web-api/products/${product.slug}`) body = product;
    else if (path === '/web-api/categories') body = [{ id: 'test-category', name: 'Сыры', slug: 'cheese' }];
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: path.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(path.includes('telegram-web-app') ? '' : JSON.stringify(body)).toString('base64'),
    });
  });
  return { page, state, favorites, requests };
}
