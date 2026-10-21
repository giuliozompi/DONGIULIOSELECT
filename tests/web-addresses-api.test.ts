import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { PgDialect } from 'drizzle-orm/pg-core';
import { registerWebAddressUpdate } from '../server/webAddressRoutes';

// Run the actual Express handler with an isolated, SQL-predicate-aware store.
// Never connect these tests to customer data.
async function fixture(context: any) {
  const rows = [
    { id: 'home', userId: 'customer-a', fullAddress: 'Москва, Тестовая, д 5', city: 'Москва',
      label: 'Дом', street: 'Тестовая', building: '5', postalCode: '123456',
      apartment: '42', notes: 'Домофон 42', isDefault: false },
    { id: 'office', userId: 'customer-a', fullAddress: 'Москва, Другая, д 1', city: 'Москва', isDefault: true },
    { id: 'foreign', userId: 'customer-b', fullAddress: 'Чужой адрес', city: 'Москва', isDefault: true },
  ];
  let writes = 0;
  const dialect = new PgDialect();
  const matches = (predicate: any) => {
    const { sql, params } = dialect.sqlToQuery(predicate);
    // Both reads and writes must restrict by owner in the actual Drizzle SQL.
    assert.match(sql, /"web_addresses"\."user_id" =/);
    const excluding = sql.includes('"web_addresses"."id" <>');
    if (excluding) return (row: any) => row.userId === params[0] && row.id !== params[1];
    assert.match(sql, /"web_addresses"\."id" =/);
    return (row: any) => row.id === params[0] && row.userId === params[1];
  };
  const transaction = {
    select: () => ({ from: () => ({ where: (predicate: any) => rows.filter(matches(predicate)) }) }),
    update: () => ({ set: (values: any) => ({ where: (predicate: any) => {
      const selected = rows.filter(matches(predicate));
      writes += selected.length;
      selected.forEach(row => Object.assign(row, values));
      return { returning: async () => selected };
    } }) }),
  };
  const app = express();
  app.use(express.json());
  registerWebAddressUpdate(app, { transaction: async (run: any) => run(transaction) } as any, (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ error: 'Требуется авторизация' });
    (req as any).webUser = { sub: 'customer-a' };
    next();
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  context.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address() as { port: number };
  return {
    rows, writes: () => writes,
    patch: (id: string, body: unknown, authenticated = true) => fetch(`http://127.0.0.1:${address.port}/web-api/addresses/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'test-only' } : {}) },
      body: JSON.stringify(body),
    }),
  };
}

test('PATCH updates only the owned record and preserves omitted apartment, notes and default', async context => {
  const { patch, rows, writes } = await fixture(context);
  const response = await patch('home', { label: 'Casa' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, 'home');
  assert.equal(rows[0].label, 'Casa');
  assert.equal(rows[0].apartment, '42');
  assert.equal(rows[0].notes, 'Домофон 42');
  assert.equal(rows[1].isDefault, true);
  assert.equal(writes(), 1);
});

test('PATCH cannot change another customer address, even when changing the default', async context => {
  const { patch, rows, writes } = await fixture(context);
  const before = structuredClone(rows);
  assert.equal((await patch('foreign', { city: 'Казань', isDefault: true })).status, 404);
  assert.equal((await patch('missing', { notes: 'New note' })).status, 404);
  assert.deepEqual(rows, before);
  assert.equal(writes(), 0);
});

test('normalized and manual address changes update structure and preserve independent details', async context => {
  const { patch, rows } = await fixture(context);
  assert.equal((await patch('home', {
    fullAddress: 'Москва, Тверская, д 1', city: 'Москва',
    street: 'Тверская', building: '1', postalCode: '125009',
  })).status, 200);
  assert.equal(rows[0].street, 'Тверская');
  assert.equal(rows[0].building, '1');
  assert.equal(rows[0].postalCode, '125009');
  assert.equal((await patch('home', { fullAddress: 'Казань, Новый адрес, д 2', city: 'Казань' })).status, 200);
  assert.equal(rows[0].street, '');
  assert.equal(rows[0].building, '');
  assert.equal(rows[0].postalCode, '');
  assert.equal(rows[0].apartment, '42');
  assert.equal(rows[0].notes, 'Домофон 42');
  assert.equal((await patch('home', { apartment: '', notes: '' })).status, 200);
  assert.equal(rows[0].apartment, '');
  assert.equal(rows[0].notes, '');
});

test('changing default affects only this customer, never another customer', async context => {
  const { patch, rows } = await fixture(context);
  assert.equal((await patch('home', { isDefault: true })).status, 200);
  assert.deepEqual(rows.map(row => row.isDefault), [true, false, true]);
});

test('invalid, empty, unauthenticated and ownership-changing input never writes', async context => {
  const { patch, writes } = await fixture(context);
  for (const body of [
    {}, { city: '' }, { fullAddress: '' }, { fullAddress: 'Казань, д 1' },
    { userId: 'customer-b' }, { id: 'foreign' }, { isDefault: 'true' },
  ]) assert.equal((await patch('home', body)).status, 400);
  assert.equal((await patch('home', { notes: 'Not allowed' }, false)).status, 401);
  assert.equal(writes(), 0);
});
