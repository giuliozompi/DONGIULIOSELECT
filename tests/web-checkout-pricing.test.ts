import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { products, orders, webUsers, welcomeNotifications, abandonedCartNotifications } from '../shared/schema';
import { registerWebCheckout } from '../server/webCheckoutRoutes';
import { buildReorderPreview } from '../shared/reorder';
import { quoteItems, applyQuoteDiscount, createOrderSchema } from '../shared/checkout';

// Disposable PostgreSQL only: never reads DATABASE_URL or writes customer data.
const exec = promisify(execFile);
let directory: string;
let pool: pg.Pool;
let base: string;
let server: ReturnType<ReturnType<typeof express>['listen']>;
let started = false;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'checkout-pricing-pg-'));
  await exec('initdb', ['-D', join(directory, 'data'), '-U', 'checkout_test', '-A', 'trust', '--no-locale']);
  await exec('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
  started = true;
  pool = new pg.Pool({ host: directory, port: 5432, user: 'checkout_test', database: 'postgres', max: 10 });
  for (const table of [products, orders, webUsers, welcomeNotifications, abandonedCartNotifications]) {
    const config = getTableConfig(table);
    const columns = config.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? ' PRIMARY KEY' : ''}`);
    await pool.query(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
  }
  const app = express();
  app.use(express.json());
  registerWebCheckout(app, drizzle(pool), (req, res, next) => {
    if (!['a', 'b'].includes(req.headers.authorization ?? '')) return res.sendStatus(401);
    (req as any).webUser = { sub: req.headers.authorization };
    next();
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/web-api`;
}, { timeout: 30000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pool?.end();
  if (started) await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query(`
    TRUNCATE products, orders, web_users, welcome_notifications, abandoned_cart_notifications;
    INSERT INTO products (id,name,price,unit,is_visible,in_stock)
      VALUES ('cheese','Current cheese',2400,'кг',true,true);
    INSERT INTO web_users (id,telegram_user_id) VALUES ('a','tg-a'),('b','tg-b');
  `);
});
const item = { productId: 'cheese', productName: 'Old cheese', price: '2400.00', quantity: 0.735, unit: 'кг' };
const input = { customerName: 'Test Customer', customerPhone: '1234567890', deliveryAddress: 'Test address',
  paymentMethod: 'yookassa', items: [item], amount: '1764.00' };
async function post(body: unknown = input, user = 'a', path = '/orders') {
  return fetch(`${base}${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: user,
  }, body: JSON.stringify(body) });
}
const count = async () => Number((await pool.query('SELECT count(*) AS n FROM orders')).rows[0].n);
async function promo(overrides: Record<string, unknown> = {}, table = 'welcome_notifications') {
  const row = { id: 'promo', user_id: 'tg-a', discount_code: 'BENVENUTO-TEST', status: 'sent',
    expires_at: new Date(Date.now() + 3600000), discount_percent: 10, ...overrides };
  const keys = Object.keys(row);
  await pool.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
}

test('server stores catalogue names/prices and exact 0.735 kg; no payment is initiated', async () => {
  const response = await post();
  assert.equal(response.status, 201);
  const order = await response.json();
  assert.equal(order.items[0].productName, 'Current cheese');
  assert.equal(order.items[0].price, '2400.00');
  assert.equal(order.items[0].quantity, 0.735);
  assert.equal(order.amount, '1764.00');
  assert.equal(order.discount, '0.00');
  assert.equal(order.userId, 'web:a');
  assert.equal(order.paymentId, null);
});
test('altered browser price, amount or discount require confirmation without inserting', async () => {
  for (const body of [
    { ...input, items: [{ ...item, price: '1.00' }], amount: '0.74' },
    { ...input, amount: '-1' },
    { ...input, discount: '9999.00', discountPercent: 99, amount: '1.00' },
  ]) {
    const response = await post(body);
    assert.equal(response.status, 409);
    const { quote } = await response.json();
    assert.equal(quote.amount, '1764.00');
    assert.equal(quote.discount, '0.00');
    assert.equal(await count(), 0);
  }
});
test('change after Repeat order and again after first quote requires a fresh confirmation', async () => {
  const catalogue = [{ id: 'cheese', name: 'Cheese', price: '2000.00', unit: 'кг', images: [], isVisible: true, inStock: true }];
  const repeated = buildReorderPreview([item], catalogue).items;
  const first = await post({ ...input, items: repeated, amount: '1470.00' });
  assert.equal(first.status, 409);
  const { quote } = await first.json();
  assert.equal(await count(), 0);
  await pool.query("UPDATE products SET price=2500 WHERE id='cheese'");
  const second = await post({ ...input, ...quote });
  assert.equal(second.status, 409);
  const updated = (await second.json()).quote;
  assert.equal(updated.amount, '1837.50');
  assert.equal(await count(), 0);
  assert.equal((await post({ ...input, ...updated })).status, 201);
  assert.equal(await count(), 1);
});
test('missing, hidden or out-of-stock products prevent order creation', async () => {
  for (const statement of [
    'UPDATE products SET in_stock=false',
    'UPDATE products SET in_stock=true,is_visible=false',
    'DELETE FROM products',
  ]) {
    await pool.query(statement);
    assert.equal((await post()).status, 422);
    assert.equal(await count(), 0);
  }
});
test('invalid quantities, changed units, duplicate lines and malformed bodies never insert', async () => {
  for (const change of [
    { quantity: 0 }, { quantity: -1 }, { quantity: 0.7351 }, { quantity: 100001 },
    { unit: 'г' }, { price: 'NaN' },
  ]) {
    const result = await post({ ...input, items: [{ ...item, ...change }] });
    assert.ok([400, 409, 422].includes(result.status));
  }
  assert.equal((await post({ ...input, items: [item, item] })).status, 422);
  assert.equal((await post({ ...input, items: [] })).status, 400);
  await pool.query("UPDATE products SET unit='шт'");
  assert.equal((await post({ ...input, items: [{ ...item, unit: 'шт', quantity: 1.5 }] })).status, 422);
  assert.equal(await count(), 0);
});
test('invalid, expired, failed, used, foreign and minimum-spend promos are removed, not silently charged', async () => {
  for (const overrides of [
    { status: 'used' }, { status: 'expired' }, { status: 'failed' },
    { expires_at: new Date(Date.now() - 1000) }, { user_id: 'tg-b' },
    { min_order_amount: 5000 }, { discount_percent: 101 },
  ]) {
    await pool.query('TRUNCATE welcome_notifications');
    await promo(overrides);
    const response = await post({ ...input, promoCode: ' BENVENUTO-TEST ', discountPercent: 10, discount: '176.40', amount: '1587.60' });
    assert.equal(response.status, 409);
    const { quote } = await response.json();
    assert.ok(quote.message);
    assert.equal(quote.promoCode, undefined);
    assert.equal(quote.amount, '1764.00');
    assert.equal(await count(), 0);
  }
  assert.equal((await post({ ...input, promoCode: 'UNKNOWN' })).status, 409);
});
test('both promo types validate ownership and consume only on successful creation', async () => {
  for (const [table, code] of [['welcome_notifications', 'BENVENUTO-TEST'], ['abandoned_cart_notifications', 'CART7-TEST']]) {
    await promo({ discount_code: code, ...(table === 'welcome_notifications' ? { min_order_amount: 1000 } : {}) }, table);
    const preview = await post({ code: code.toLowerCase() }, 'b', '/promo/validate');
    assert.equal((await preview.json()).valid, false);
    assert.equal((await (await post({ code }, 'a', '/promo/validate')).json()).valid, true);
    const response = await post({ ...input, promoCode: code });
    assert.equal(response.status, 409);
    assert.equal((await pool.query(`SELECT status FROM ${table}`)).rows[0].status, 'sent');
    const { quote } = await response.json();
    assert.equal(quote.discount, '176.40');
    assert.equal((await post({ ...input, ...quote })).status, 201);
    const saved = (await pool.query(`SELECT status,used_in_order_id FROM ${table}`)).rows[0];
    assert.equal(saved.status, 'used');
    assert.ok(saved.used_in_order_id);
    await pool.query(`TRUNCATE ${table}`);
  }
});
test('concurrent checkouts cannot reuse a promo', async () => {
  await promo();
  const body = { ...input, promoCode: 'BENVENUTO-TEST', discountPercent: 10, discount: '176.40', amount: '1587.60' };
  const responses = await Promise.all([post(body), post(body)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(await count(), 1);
});
test('promo update failure rolls back the order insert', async () => {
  await promo();
  await pool.query(`ALTER TABLE welcome_notifications ADD CONSTRAINT test_no_used CHECK (status != 'used')`);
  try {
    const response = await post({ ...input, promoCode: 'BENVENUTO-TEST', discountPercent: 10, discount: '176.40', amount: '1587.60' });
    assert.equal(response.status, 500);
    assert.equal(await count(), 0);
    assert.equal((await pool.query('SELECT status FROM welcome_notifications')).rows[0].status, 'sent');
  } finally { await pool.query('ALTER TABLE welcome_notifications DROP CONSTRAINT test_no_used'); }
});
test('integer-kopeck line rounding and percentage discount retain cents', () => {
  const parsed = createOrderSchema.parse(input);
  const quote = quoteItems([{ ...parsed.items[0], quantity: 0.001 }], [{
    id: 'cheese', name: 'Cheese', price: '1234.56', unit: 'кг', isVisible: true, inStock: true,
  }]);
  assert.equal(quote.subtotal, '1.23');
  assert.equal(applyQuoteDiscount(quote, 10, 'CODE').discount, '0.12');
  assert.equal(applyQuoteDiscount(quote, 10, 'CODE').amount, '1.11');
});
test('unauthenticated checkout has no side effects', async () => {
  assert.equal((await post(input, '')).status, 401);
  assert.equal(await count(), 0);
});
