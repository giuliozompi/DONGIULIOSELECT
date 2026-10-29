import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import express from 'express';
import type { Server } from 'node:http';
import { saveEditorial, deleteEditorial, moderateEditorial, listEditorial, EditorialError } from '../server/services/editorial';
import { registerAdminEditorialRoutes } from '../server/adminEditorialRoutes';
import { videoDataSchema, cheeseDataSchema, priceDataSchema, pricePerKg, type CheeseData, type PriceData } from '../shared/editorial';

const exec = promisify(execFile);
let directory: string;
let database: pg.Pool;
let started = false;
let server: Server;
let base: string;
const video = () => videoDataSchema.parse({
  title: 'Разговор с производителем', url: 'https://www.youtube.com/watch?v=abc123', category: 'interview',
});
const cheese = (): CheeseData => cheeseDataSchema.parse({ title: 'Test cheese', country: 'Италия' });
const price = (cheeseId: string): PriceData => priceDataSchema.parse({
  cheeseId, sourceType: 'user', price: 12.5, currency: 'EUR', country: 'Италия',
  store: 'Example shop', sourceUrl: 'https://example.org/price',
  observedOn: '2026-01-01', packageQuantity: 250, packageUnit: 'g',
});
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'editorial-test-'));
  await exec('initdb', ['-D', join(directory, 'data'), '-U', 'editorial_test', '-A', 'trust', '--no-locale']);
  await exec('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
  started = true;
  database = new pg.Pool({ host: directory, port: 5432, user: 'editorial_test', database: 'postgres', max: 10 });
  await database.query(`CREATE TABLE products(id varchar PRIMARY KEY, price numeric NOT NULL DEFAULT 100);
    CREATE TABLE admin_action_logs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id varchar NOT NULL, action_type text NOT NULL,
      entity_type text NOT NULL, entity_id varchar, action_data jsonb NOT NULL, created_at timestamptz DEFAULT now());`);
  await database.query(await readFile('migrations/editorial-admin.sql', 'utf8'));
  const app = express();
  app.use(express.json());
  registerAdminEditorialRoutes(app, [
    (req, res, next) => req.headers.authorization ? next() : void res.status(401).json({ error: 'auth' }),
    (req, res, next) => req.headers.authorization === 'test-admin' ? next() : void res.status(403).json({ error: 'admin' }),
  ], () => 'operator-test', database);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/web-api/admin/editorial`;
}, { timeout: 30000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await database?.end();
  if (started) await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await database.query('TRUNCATE editorial_entries,admin_action_logs,products');
  await database.query("INSERT INTO products(id) VALUES('catalogue-test')");
});
async function api(method: string, path = '', body?: unknown, token: string | null = 'test-admin') {
  return fetch(`${base}${path}`, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
const expectStatus = (status: number) => (e: unknown) => e instanceof EditorialError && e.status === status;

test('separate video/cheese CRUD persists all metadata and operator audit', async () => {
  const c = await saveEditorial('cheese', cheese(), 'operator', undefined, database);
  const v = await saveEditorial('video', { ...video(), cheeseIds: [c.id] }, 'operator', undefined, database);
  const edited = await saveEditorial('cheese', { ...cheese(), videoIds: [v.id], productIds: ['catalogue-test'],
    productionCountry: 'Россия', history: 'Documented history' }, 'operator2', c, database);
  assert.equal(edited.revision, 2);
  assert.equal(edited.createdBy, 'operator');
  assert.equal(edited.updatedBy, 'operator2');
  assert.equal((await listEditorial('video', 0, 50, database)).total, 1);
  const stored = (await listEditorial('cheese', 0, 50, database)).items[0];
  assert.equal((stored.data as CheeseData).productionCountry, 'Россия');
  assert.deepEqual((stored.data as CheeseData).productIds, ['catalogue-test']);
  const audits = (await database.query('SELECT * FROM admin_action_logs ORDER BY created_at')).rows;
  assert.equal(audits.length, 3);
  assert.equal(audits[2].admin_user_id, 'operator2');
  assert.equal(audits[2].action_data.oldData.revision, 1);
  assert.equal(audits[2].action_data.newData.revision, 2);
});
test('videos and cheese drafts can exist independently; ready is not published', async () => {
  await saveEditorial('video', { ...video(), status: 'ready' }, 'operator', undefined, database);
  await saveEditorial('cheese', cheese(), 'operator', undefined, database);
  assert.equal((await listEditorial('video', 0, 50, database)).items[0].data.status, 'ready');
  assert.equal((await listEditorial('cheese', 0, 50, database)).total, 1);
  assert.equal((await fetch(base.replace('/admin/editorial', '/editorial'))).status, 404);
});
test('price observations preserve country/currency, normalize only known weights and require moderation', async () => {
  const c = await saveEditorial('cheese', cheese(), 'operator', undefined, database);
  const p = await saveEditorial('price', price(c.id), 'operator', undefined, database);
  assert.equal(p.moderation, 'pending');
  assert.equal(pricePerKg(p.data as PriceData), 50);
  assert.equal(pricePerKg({ ...price(c.id), packageUnit: 'kg', packageQuantity: 1 }), 12.5);
  assert.equal(pricePerKg({ ...price(c.id), packageUnit: 'piece' }), null);
  const approved = await moderateEditorial(p.id, p.revision, 'approved', 'Источник проверен', 'moderator', database);
  assert.equal(approved.moderation, 'approved');
  assert.equal(approved.moderationNote, 'Источник проверен');
  assert.equal(approved.updatedBy, 'moderator');
  const edited = await saveEditorial('price', { ...price(c.id), price: 15 }, 'operator', approved, database);
  assert.equal(edited.moderation, 'pending');
  assert.equal(edited.moderationNote, '');
  const rejected = await moderateEditorial(edited.id, edited.revision, 'rejected', 'Нужна другая ссылка', 'moderator', database);
  assert.equal(rejected.moderation, 'rejected');
  const internet = await saveEditorial('price', { ...price(c.id), sourceType: 'internet', currency: 'RUB', country: 'Россия' }, 'operator', undefined, database);
  assert.equal(internet.moderation, 'pending');
  const offline = await saveEditorial('price', { ...price(c.id), sourceUrl: '', notes: 'Наблюдение в магазине' }, 'operator', undefined, database);
  assert.equal(offline.moderation, 'pending');
  assert.equal(priceDataSchema.safeParse({ ...price(c.id), sourceType: 'internet', sourceUrl: '' }).success, false);
  assert.equal((await database.query("SELECT price::text FROM products WHERE id='catalogue-test'")).rows[0].price, '100');
});
test('moderation and saves reject stale revisions and racing duplicate decisions', async () => {
  const c = await saveEditorial('cheese', cheese(), 'operator', undefined, database);
  await saveEditorial('cheese', { ...cheese(), title: 'New title' }, 'operator2', c, database);
  await assert.rejects(saveEditorial('cheese', cheese(), 'operator', c, database), expectStatus(409));
  await assert.rejects(deleteEditorial(c.id, c.revision, 'operator', database), expectStatus(409));
  const p = await saveEditorial('price', price(c.id), 'operator', undefined, database);
  const results = await Promise.allSettled([
    moderateEditorial(p.id, p.revision, 'approved', 'OK', 'moderator1', database),
    moderateEditorial(p.id, p.revision, 'rejected', 'No', 'moderator2', database),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await database.query("SELECT count(*)::int n FROM admin_action_logs WHERE action_type IN ('approved','rejected')")).rows[0].n, 1);
});
test('references must exist and deletion cannot orphan relations or price history', async () => {
  const c = await saveEditorial('cheese', cheese(), 'operator', undefined, database);
  const v = await saveEditorial('video', { ...video(), cheeseIds: [c.id] }, 'operator', undefined, database);
  await assert.rejects(deleteEditorial(c.id, c.revision, 'operator', database), expectStatus(409));
  await assert.rejects(saveEditorial('cheese', { ...cheese(), productIds: ['missing'] }, 'operator', c, database), expectStatus(400));
  await deleteEditorial(v.id, v.revision, 'operator', database);
  const p = await saveEditorial('price', price(c.id), 'operator', undefined, database);
  await assert.rejects(deleteEditorial(c.id, c.revision, 'operator', database), expectStatus(409));
  await deleteEditorial(p.id, p.revision, 'operator', database);
  await deleteEditorial(c.id, c.revision, 'operator', database);
  assert.equal((await listEditorial('cheese', 0, 50, database)).total, 0);
  assert.equal((await database.query("SELECT count(*)::int n FROM admin_action_logs WHERE action_type='deleted'")).rows[0].n, 3);
});
test('audit failure rolls back create, edit, moderation and delete', async () => {
  const c = await saveEditorial('cheese', cheese(), 'operator', undefined, database);
  const p = await saveEditorial('price', price(c.id), 'operator', undefined, database);
  await database.query(`CREATE FUNCTION fail_editorial_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
    CREATE TRIGGER fail_audit BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION fail_editorial_audit();`);
  try {
    await assert.rejects(saveEditorial('video', video(), 'operator', undefined, database));
    await assert.rejects(saveEditorial('cheese', { ...cheese(), title: 'Lost' }, 'operator', c, database));
    await assert.rejects(moderateEditorial(p.id, p.revision, 'approved', 'OK', 'operator', database));
    await assert.rejects(deleteEditorial(p.id, p.revision, 'operator', database));
    assert.equal((await listEditorial('video', 0, 50, database)).total, 0);
    assert.equal((await listEditorial('cheese', 0, 50, database)).items[0].data.title, 'Test cheese');
    assert.equal((await listEditorial('price', 0, 50, database)).items[0].moderation, 'pending');
  } finally {
    await database.query('DROP TRIGGER fail_audit ON admin_action_logs; DROP FUNCTION fail_editorial_audit()');
  }
});
test('all editorial API methods reject guests and non-admins before work', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  for (const [method, path, body] of [
    ['GET', '?kind=video', undefined], ['POST', '', {}], ['PATCH', `/${id}`, {}],
    ['DELETE', `/${id}?revision=1`, undefined], ['POST', `/${id}/moderate`, {}],
  ] as const) {
    assert.equal((await api(method, path, body, null)).status, 401);
    assert.equal((await api(method, path, body, 'test-client')).status, 403);
  }
  assert.equal((await listEditorial('video', 0, 50, database)).total, 0);
});
test('API validation, pagination and all success operations use real database', async () => {
  assert.equal((await api('POST', '', { kind: 'video', data: { ...video(), url: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await api('POST', '', { kind: 'video', data: { ...video(), url: 'https://youtube.com.evil.test/watch?v=1' } })).status, 400);
  assert.equal((await api('POST', '', { kind: 'video', data: { ...video(), url: 'https://t.me/channel' } })).status, 400);
  const create = await api('POST', '', { kind: 'cheese', data: cheese() });
  assert.equal(create.status, 201);
  const c = await create.json();
  const update = await api('PATCH', `/${c.id}`, { kind: 'cheese', revision: c.revision, data: { ...cheese(), title: 'Saved' } });
  assert.equal(update.status, 200);
  const priceResponse = await api('POST', '', { kind: 'price', data: price(c.id) });
  const p = await priceResponse.json();
  assert.equal((await api('POST', `/${p.id}/moderate`, { revision: p.revision, decision: 'approved', note: '' })).status, 400);
  assert.equal((await api('POST', `/${p.id}/moderate`, { revision: p.revision, decision: 'approved', note: 'Verified' })).status, 200);
  const page = await api('GET', '?kind=cheese&limit=1&offset=1');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await page.json(), { items: [], total: 1 });
  assert.equal((await api('GET', '?kind=price&limit=201')).status, 400);
  assert.equal((await api('PATCH', '/bad', { kind: 'video', revision: 1, data: video() })).status, 400);
  assert.equal((await api('DELETE', `/${p.id}?revision=2`)).status, 204);
});
test('reject malformed dates, prices, currencies, invalid ready articles, unknown fields and missing actor', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  for (const change of [{ observedOn: '2026-02-30' }, { observedOn: '2099-01-01' },
    { currency: 'ZZZ' }, { price: -1 }, { packageQuantity: 0 }, { moderation: 'approved' }]) {
    assert.equal(priceDataSchema.safeParse({ ...price(id), ...change }).success, false);
  }
  assert.equal(cheeseDataSchema.safeParse({ ...cheese(), status: 'ready' }).success, false);
  assert.equal(cheeseDataSchema.safeParse({ ...cheese(), latitude: 10 }).success, false);
  assert.equal(videoDataSchema.safeParse({ ...video(), cover: 'data:image/svg+xml,xxx' }).success, false);
  await assert.rejects(saveEditorial('video', video(), '', undefined, database), expectStatus(401));
});
