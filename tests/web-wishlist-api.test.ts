import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { products, webWishlists } from '../shared/schema';
import { registerWebWishlistRoutes } from '../server/webWishlistRoutes';

// Real PostgreSQL concurrency/constraint tests, never DATABASE_URL or customer data.
// Requires initdb and pg_ctl on PATH. All data lives in a disposable temp cluster.
const exec = promisify(execFile);
let directory: string;
let pool: pg.Pool;
let base: string;
let server: ReturnType<ReturnType<typeof express>['listen']>;
let started = false;
const migration = await readFile(new URL('../migrations/web-wishlist-uniqueness.sql', import.meta.url), 'utf8');

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'wishlist-pg-'));
  const data = join(directory, 'data');
  await exec('initdb', ['-D', data, '-U', 'wishlist_test', '-A', 'trust', '--no-locale']);
  await exec('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
  started = true;
  pool = new pg.Pool({ host: directory, port: 5432, user: 'wishlist_test', database: 'postgres', max: 12 });
  // Match every product column so the actual joined GET handler is exercised.
  const productColumns = getTableConfig(products).columns.map(column =>
    `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`).join(',');
  await pool.query(`
    CREATE TABLE web_users (id varchar PRIMARY KEY);
    CREATE TABLE products (${productColumns});
    CREATE TABLE web_wishlists (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
      product_id varchar NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await pool.query(migration);
  const app = express();
  app.use(express.json());
  registerWebWishlistRoutes(app, drizzle(pool), (req, res, next) => {
    // Authentication fixture only: production uses the existing JWT middleware.
    const userId = req.headers.authorization;
    if (!['customer-a', 'customer-b'].includes(userId ?? '')) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    (req as any).webUser = { sub: userId };
    next();
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/web-api/wishlist`;
}, { timeout: 30000 });

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pool?.end();
  if (started) await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await pool.query(`
    TRUNCATE web_wishlists, products, web_users CASCADE;
    INSERT INTO web_users VALUES ('customer-a'), ('customer-b');
    INSERT INTO products (id, name, slug, price) VALUES ('cheese', 'Test cheese', 'cheese', 100);
  `);
});

const request = (method: string, user = 'customer-a', product = 'cheese', body?: unknown) =>
  fetch(method === 'GET' ? base : `${base}/${encodeURIComponent(product)}`, {
    method, headers: { Authorization: user, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const count = async () => Number((await pool.query('SELECT count(*) AS n FROM web_wishlists')).rows[0].n);
const expectState = async (response: Response, inWishlist: boolean) => {
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { inWishlist });
};

test('repeated PUT and DELETE preserve explicit state, row identity and timestamp', async () => {
  await expectState(await request('PUT'), true);
  const original = (await request('GET').then(r => r.json()))[0];
  for (let i = 0; i < 3; i++) await expectState(await request('PUT'), true);
  const items = await request('GET').then(r => r.json());
  assert.equal(items.length, 1);
  assert.equal(items[0].id, original.id);
  assert.equal(items[0].createdAt, original.createdAt);
  assert.equal(items[0].product.id, 'cheese');
  for (let i = 0; i < 3; i++) await expectState(await request('DELETE'), false);
  assert.equal(await count(), 0);
});

test('concurrent additions from multiple clients produce one row; concurrent removals are safe', async () => {
  await Promise.all(Array.from({ length: 24 }, async () => expectState(await request('PUT'), true)));
  assert.equal(await count(), 1);
  await Promise.all(Array.from({ length: 24 }, async () => expectState(await request('DELETE'), false)));
  assert.equal(await count(), 0);
});

test('opposing concurrent intentions are atomic; a subsequent explicit request determines final state', async () => {
  const results = await Promise.all(Array.from({ length: 24 }, (_, i) => request(i % 2 ? 'PUT' : 'DELETE')));
  assert.ok(results.every(result => result.status === 200));
  assert.ok(await count() <= 1);
  await expectState(await request('PUT'), true);
  assert.equal(await count(), 1);
  await expectState(await request('DELETE'), false);
  assert.equal(await count(), 0);
});

test('GET and all writes are scoped to the authenticated customer, ignoring supplied owner fields', async () => {
  await expectState(await request('PUT', 'customer-a', 'cheese', { userId: 'customer-b' }), true);
  assert.deepEqual(await request('GET', 'customer-b').then(r => r.json()), []);
  await expectState(await request('DELETE', 'customer-b', 'cheese', { userId: 'customer-a' }), false);
  assert.equal((await request('GET').then(r => r.json())).length, 1);
  await Promise.all(['customer-a', 'customer-b'].map(async user => {
    await expectState(await request('PUT', user), true);
  }));
  assert.equal(await count(), 2);
  await expectState(await request('DELETE'), false);
  assert.equal((await request('GET', 'customer-b').then(r => r.json())).length, 1);
});

test('guests cannot read or mutate; legacy POST never toggles a selection', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'POST']) {
    assert.equal((await request(method, '')).status, 401);
  }
  await request('PUT');
  for (let i = 0; i < 3; i++) {
    const response = await request('POST');
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'PUT, DELETE');
  }
  assert.equal(await count(), 1);
});

test('missing products cannot be added, and repeated removal of a missing product succeeds', async () => {
  assert.equal((await request('PUT', 'customer-a', 'missing')).status, 404);
  await expectState(await request('DELETE', 'customer-a', 'missing'), false);
  assert.equal(await count(), 0);
});

test('schema declares a composite unique index and database rejects direct duplicate writes', async () => {
  const index = getTableConfig(webWishlists).indexes.find(index =>
    index.config.name === 'web_wishlists_user_product_unique');
  assert.equal(index?.config.unique, true);
  assert.deepEqual(index?.config.columns.map(column => (column as any).name), ['user_id', 'product_id']);
  await request('PUT');
  await assert.rejects(pool.query(
    `INSERT INTO web_wishlists (user_id, product_id) VALUES ('customer-a', 'cheese')`,
  ), { code: '23505' });
});

test('migration is repeatable and refuses existing duplicates without deleting them', async () => {
  await pool.query(migration);
  await pool.query('DROP INDEX web_wishlists_user_product_unique');
  await pool.query(`INSERT INTO web_wishlists (user_id, product_id)
    VALUES ('customer-a', 'cheese'), ('customer-a', 'cheese')`);
  // Hold one connection for BEGIN/failure/ROLLBACK; no transaction leaks into the pool.
  const client = await pool.connect();
  try {
    await assert.rejects(client.query(migration), /Duplicate wishlist pairs exist/);
    await client.query('ROLLBACK');
    assert.equal(await count(), 2);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    // Only synthetic test rows in this disposable cluster are cleaned up.
    await pool.query('TRUNCATE web_wishlists');
    await pool.query(migration);
  }
});
