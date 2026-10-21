export const ordersBase = `https://${process.env.REPLIT_DEV_DOMAIN}`;
export const customerOrder = {
  id: 'test-order-cb7780', status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
  amount: '1954.73', discount: '15.27', paymentMethod: 'yookassa',
  customerName: 'Test Customer', customerPhone: '+79990000000',
  customerEmail: 'test-orders@example.invalid',
  deliveryAddress: 'г Москва, ул Тверская, д 1, кв 42',
  deliveryNotes: 'Позвоните за 15 минут до доставки',
  deliveryMethod: 'don_giulio_courier', createdAt: '2026-10-21T08:30:00.000Z',
  items: [
    { productId: 'test-cheese', productName: 'Пармиджано Реджано выдержанный итальянский сыр 24 месяца',
      quantity: 0.735, price: '2000.00', unit: 'кг' },
    { productId: 'test-salami', productName: 'Салями итальянская', quantity: 1, price: '500.00', unit: 'шт' },
  ],
};
export const historyOrder = {
  ...customerOrder, id: 'test-history-aa1122', status: 'ПОЛУЧЕН',
  paymentMethod: 'cash_on_delivery', createdAt: '2026-10-01T08:30:00.000Z',
};

// All APIs are intercepted before navigation; the browser helper bypasses
// service workers so no order, payment, email or real customer record is touched.
export async function ordersPage(browser, context, {
  orders = [customerOrder, historyOrder], authenticated = true, listFailure = false,
} = {}) {
  const page = await browser.newPage();
  context.after(() => page.close());
  const requests = [];
  const state = { listFailure };
  await page.send('Fetch.enable', { patterns: [
    { urlPattern: '*/web-api/*' }, { urlPattern: '*/api/*' },
    { urlPattern: '*telegram.org/js/telegram-web-app.js*' },
  ] });
  page.on('Fetch.requestPaused', async event => {
    const path = new URL(event.request.url).pathname;
    requests.push({ path, method: event.request.method });
    let status = 200;
    let body = [];
    if (path === '/web-api/auth/refresh') {
      status = authenticated ? 200 : 401;
      body = authenticated ? {
        accessToken: 'test-only-token',
        user: { id: 'test-web-customer', firstName: 'Test', isEmailVerified: true },
      } : { error: 'Требуется авторизация' };
    } else if (event.request.method !== 'GET') {
      await page.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
      throw new Error('Order display must not perform mutation requests');
    } else if (path === '/web-api/orders') {
      status = state.listFailure ? 500 : 200;
      body = state.listFailure ? { error: 'Ошибка загрузки заказов' } : orders;
    } else if (path.startsWith('/web-api/orders/')) {
      body = orders.find(order => order.id === path.split('/').pop());
      status = body ? 200 : 404;
      body ||= { error: 'Заказ не найден' };
    }
    await page.send('Fetch.fulfillRequest', {
      requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: 'Content-Type', value: path.includes('telegram-web-app') ? 'text/javascript' : 'application/json' }],
      body: Buffer.from(path.includes('telegram-web-app') ? '' : JSON.stringify(body)).toString('base64'),
    });
  });
  return { page, requests, state };
}
