import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { PgDialect } from 'drizzle-orm/pg-core';
import { orders, products } from '../shared/schema';
import { buildReorderPreview, convertReorderQuantity, mergeReorderCart } from '../shared/reorder';
import { registerWebReorder } from '../server/webReorderRoutes';

const source = { productId: 'cheese', productName: 'Old cheese', quantity: 0.735, price: '2000.00', unit: 'кг' };
const product = { id: 'cheese', name: 'Current cheese', price: '2400.00', unit: 'кг', images: ['current.jpg'], inStock: true, isVisible: true };

test('preview restores exact grams and uses current price, name and image without copying totals or discounts', () => {
  const result = buildReorderPreview([source], [product]);
  assert.deepEqual(result, { items: [{
    productId: 'cheese', productName: 'Current cheese', quantity: 0.735,
    price: '2400.00', unit: 'кг', image: 'current.jpg', priceChanged: true,
  }], skipped: [] });
});

test('missing, hidden, unavailable and invalid-price products are explicitly skipped', () => {
  for (const [catalogue, reason] of [
    [[], 'removed'], [[{ ...product, isVisible: false }], 'removed'],
    [[{ ...product, inStock: false }], 'unavailable'],
    [[{ ...product, price: 'bad' }], 'invalid_price'],
  ] as const) {
    const result = buildReorderPreview([source], [...catalogue]);
    assert.equal(result.items.length, 0);
    assert.equal(result.skipped[0].reason, reason);
  }
});

test('quantity conversion preserves physical weight and rejects incompatible sale units', () => {
  assert.equal(convertReorderQuantity(735, 'г', 'кг'), 0.735);
  assert.equal(convertReorderQuantity(0.735, 'kg', 'г'), 735);
  assert.equal(convertReorderQuantity(0.735, 'кг', 'kg'), 0.735);
  assert.equal(convertReorderQuantity(0.735, 'кг', 'шт'), null);
  assert.equal(convertReorderQuantity(0.7351, 'кг', 'кг'), null);
  assert.equal(buildReorderPreview([{ ...source, unit: 'г', quantity: 735 }], [product]).items[0].quantity, 0.735);
});

test('invalid and legacy missing quantities never silently become one item', () => {
  for (const quantity of [undefined, null, true, 0, -1, NaN, Infinity, 'bad']) {
    assert.equal(buildReorderPreview([{ ...source, quantity }], [product]).skipped[0].reason, 'invalid_quantity');
  }
  assert.equal(buildReorderPreview([{ productName: 'Legacy cheese' }], [product]).skipped[0].reason, 'removed');
});

test('cart merge sums precise quantities and refreshes existing prices while retaining unrelated items', () => {
  const bread = { productId: 'bread', productName: 'Bread', quantity: 2, price: '100.00', unit: 'шт' };
  const existing = [{ ...source, quantity: 0.165 }, bread];
  const incoming = buildReorderPreview([source], [product]).items;
  const result = mergeReorderCart(existing, incoming);
  assert.equal(result.items[0].quantity, 0.9);
  assert.equal(result.items[0].price, '2400.00');
  assert.equal(result.items[0].productName, 'Current cheese');
  assert.deepEqual(result.items[1], bread);
  assert.equal(result.addedCount, 1);
  assert.equal(result.skipped.length, 0);
  assert.equal(existing[0].price, '2000.00');
  assert.equal(existing[0].quantity, 0.165);
});

test('cart merge converts compatible weight units and leaves incompatible existing items unchanged', () => {
  const incoming = buildReorderPreview([source], [product]).items;
  assert.equal(mergeReorderCart([{ ...source, unit: 'г', quantity: 165 }], incoming).items[0].quantity, 0.9);
  const existing = [{ ...source, unit: 'шт', quantity: 2 }];
  const result = mergeReorderCart(existing, incoming);
  assert.deepEqual(result.items, existing);
  assert.equal(result.addedCount, 0);
  assert.equal(result.skipped[0].reason, 'cart_conflict');
});

async function api(context: any) {
  let price = product.price;
  let fail = false;
  let productReads = 0;
  const dialect = new PgDialect();
  const database = {
    select: () => ({ from: (table: unknown) => ({ where: async (predicate: any) => {
      if (fail) throw new Error('Offline');
      const params = dialect.sqlToQuery(predicate).params;
      if (table === orders) {
        return [
          { id: 'own', userId: 'web:customer-a', items: [source] },
          { id: 'foreign', userId: 'web:customer-b', items: [source] },
        ].filter(row => params.includes(row.id) && params.includes(row.userId));
      }
      assert.equal(table, products);
      productReads++;
      return params.includes(product.id) ? [{ ...product, price }] : [];
    } }) }),
  };
  const app = express();
  registerWebReorder(app, database as any, (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'Требуется авторизация' });
    (req as any).webUser = { sub: 'customer-a' };
    next();
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const port = (server.address() as any).port;
  return {
    get: (id: string, authenticated = true) => fetch(`http://127.0.0.1:${port}/web-api/orders/${id}/reorder`, {
      headers: authenticated ? { Authorization: 'Bearer test-only-token' } : {},
    }),
    setPrice: (value: string) => { price = value; },
    setFailure: () => { fail = true; },
    productReads: () => productReads,
  };
}

test('reorder API requires authentication and never reads products for foreign or missing orders', async context => {
  const fixture = await api(context);
  assert.equal((await fixture.get('own', false)).status, 401);
  assert.equal((await fixture.get('foreign')).status, 404);
  assert.equal((await fixture.get('missing')).status, 404);
  assert.equal(fixture.productReads(), 0);
});

test('read-only reorder API obtains fresh prices on every request and prevents caching', async context => {
  const fixture = await api(context);
  const first = await fixture.get('own');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal((await first.json()).items[0].price, '2400.00');
  fixture.setPrice('2700.00');
  const second = await fixture.get('own');
  assert.equal((await second.json()).items[0].price, '2700.00');
  assert.equal(fixture.productReads(), 2);
});

test('catalogue or order database failure returns an explicit error, never historical prices', async context => {
  const fixture = await api(context);
  fixture.setFailure();
  const response = await fixture.get('own');
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /текущие цены/);
});
