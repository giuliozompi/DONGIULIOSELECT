import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';
import express from 'express';
import type { Server } from 'node:http';
import { saveEditorial, deleteEditorial, moderateEditorial, listEditorial, approveDraftCheeses, EditorialError } from '../server/services/editorial';
import { registerAdminEditorialRoutes } from '../server/adminEditorialRoutes';
import { registerPublicEditorialRoutes } from '../server/publicEditorialRoutes';
import { registerPriceSubmissionRoutes } from '../server/priceSubmissionRoutes';
import { submitPrice, ownPriceSubmissions, PriceSubmissionLimitError } from '../server/services/price-submissions';
import { priceSubmissionSchema } from '../shared/price-submissions';
import { changePublication, publishApprovedCheeses } from '../server/services/editorial-publication';
import { publicEditorialList, publicCheeseMap, publicCheeseDetail, publicCheesePrices, publicVideoDetail } from '../server/services/public-editorial';
import { videoDataSchema, cheeseDataSchema, priceDataSchema, pricePerKg, type CheeseData, type PriceData } from '../shared/editorial';
import { cheeseEditorialStage } from '../shared/editorial-stages';

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
  await database.query(`CREATE TABLE web_users(id varchar PRIMARY KEY);
    CREATE TABLE products(id varchar PRIMARY KEY, price numeric NOT NULL DEFAULT 100,
      name text DEFAULT 'Test product',slug text DEFAULT 'test-product',images text[] DEFAULT '{}',
      price_old numeric,unit text DEFAULT 'кг',in_stock boolean DEFAULT true,is_visible boolean DEFAULT true,
      description_short text);
    CREATE TABLE admin_action_logs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id varchar NOT NULL, action_type text NOT NULL,
      entity_type text NOT NULL, entity_id varchar, action_data jsonb NOT NULL, created_at timestamptz DEFAULT now());`);
  await database.query(await readFile('migrations/editorial-admin.sql', 'utf8'));
  await database.query(await readFile('migrations/editorial-publication.sql', 'utf8'));
  await database.query(await readFile('migrations/editorial-price-submissions.sql', 'utf8'));
  const app = express();
  app.use(express.json());
  registerAdminEditorialRoutes(app, [
    (req, res, next) => req.headers.authorization ? next() : void res.status(401).json({ error: 'auth' }),
    (req, res, next) => req.headers.authorization === 'test-admin' ? next() : void res.status(403).json({ error: 'admin' }),
  ], () => 'operator-test', database);
  registerPublicEditorialRoutes(app, database);
  registerPriceSubmissionRoutes(app,
    (req, res, next) => req.headers.authorization ? next() : void res.status(401).json({ error: 'auth' }),
    req => ['owner-a', 'owner-b'].includes(req.headers.authorization ?? '') ? req.headers.authorization : undefined,
    database);
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
  await database.query('TRUNCATE editorial_price_submissions,editorial_publications,editorial_entries,admin_action_logs,products,web_users');
  await database.query("INSERT INTO web_users(id) VALUES('owner-a'),('owner-b')");
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
test('production points validate and persist separately from origin without changing the public snapshot', async () => {
  const origin = { latitude: 41.9, longitude: 12.5 };
  const points = [
    { id: 'sardinia', label: 'Сардиния', latitude: 40.1, longitude: 9.1 },
    { id: 'lazio', label: 'Лацио', latitude: 41.8, longitude: 12.8 },
  ];
  assert.equal(cheeseDataSchema.safeParse({ ...cheese(), productionPoints: points }).success, true);
  for (const invalid of [
    [{ ...points[0], latitude: 91 }],
    [{ ...points[0], longitude: -181 }],
    [{ ...points[0], label: ' ' }],
    [points[0], points[0]],
    Array.from({ length: 21 }, (_, i) => ({ ...points[0], id: String(i) })),
  ]) assert.equal(cheeseDataSchema.safeParse({ ...cheese(), productionPoints: invalid }).success, false);
  let entry = await saveEditorial('cheese', { ...readyCheese(), ...origin, productionPoints: points }, 'operator', undefined, database);
  entry = await changePublication(entry.id, entry.revision, true, 'operator', database);
  assert.deepEqual((await publicCheeseDetail(entry.id, database)).productionPoints, points);
  const moved = [{ ...points[0], latitude: 40.2, longitude: 9.2 }];
  entry = await saveEditorial('cheese', { ...entry.data, status: 'pending_review', productionPoints: moved }, 'operator', entry, database);
  assert.deepEqual((entry.data as CheeseData).productionPoints, moved);
  assert.equal((entry.data as CheeseData).latitude, origin.latitude);
  assert.equal((entry.data as CheeseData).longitude, origin.longitude);
  assert.deepEqual((await publicCheeseDetail(entry.id, database)).productionPoints, points);
  await assert.rejects(saveEditorial('cheese', { ...entry.data, productionPoints: points }, 'operator',
    { ...entry, revision: entry.revision - 1 }, database), expectStatus(409));
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
    ['POST', `/${id}/publish`, {}], ['POST', `/${id}/unpublish`, {}],
    ['POST', '/cheese/publish-batch', {}], ['POST', '/cheese/approve-batch', {}],
  ] as const) {
    assert.equal((await api(method, path, body, null)).status, 401);
    assert.equal((await api(method, path, body, 'test-client')).status, 403);
  }
  assert.equal((await listEditorial('video', 0, 50, database)).total, 0);
});

const publicFilters = { search: '', page: 1, limit: 12 };
const observation = (store = 'Example shop') => priceSubmissionSchema.parse({
  price: 12.5, currency: 'EUR', country: 'Италия', store, sourceUrl: '',
  observedOn: '2026-01-01', packageQuantity: 250, packageUnit: 'g', channel: 'shop',
});
async function publishedCheese() {
  const c = await saveEditorial('cheese', readyCheese(), 'operator', undefined, database);
  return changePublication(c.id, c.revision, true, 'operator', database);
}
function submissionsApi(cheeseId: string, method: string, body?: unknown, token: string | null = 'owner-a', query = '') {
  const url = base.replace('/admin/editorial', `/editorial/cheeses/${cheeseId}/price-submissions`);
  return fetch(`${url}${query}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
function readyCheese(): CheeseData {
  return cheeseDataSchema.parse({ ...cheese(), status: 'ready', latitude: 45, longitude: 9,
    photos: ['https://example.org/cheese.jpg'], history: 'History', characteristics: 'Characteristics',
    culinaryUses: 'Uses', sources: ['https://example.org/source'] });
}
test('cheese menu filters before pagination, includes review drafts and keeps live snapshots in published', async () => {
  const drafts = [];
  for (let i = 0; i < 21; i++)
    drafts.push(await saveEditorial('cheese', { ...cheese(), title: `Draft ${i}` }, 'operator', undefined, database));
  const pending = await saveEditorial('cheese', { ...cheese(), status: 'pending_review' }, 'operator', undefined, database);
  const approved = await saveEditorial('cheese', readyCheese(), 'operator', undefined, database);
  let live = await publishedCheese();
  const liveReady = await publishedCheese();
  live = await saveEditorial('cheese', { ...cheese(), title: 'Unpublished next revision' }, 'operator', live, database);
  const expected = {
    drafts: [...drafts.map(d => d.id), pending.id],
    approved: [approved.id],
    published: [live.id, liveReady.id],
  };
  for (const stage of ['drafts', 'approved', 'published'] as const) {
    const response = await api('GET', `?kind=cheese&stage=${stage}&limit=20`);
    assert.equal(response.status, 200);
    const first = await response.json();
    const second = await (await api('GET', `?kind=cheese&stage=${stage}&limit=20&offset=20`)).json();
    assert.equal(first.total, expected[stage].length);
    assert.equal(second.total, expected[stage].length);
    const all = [...first.items, ...second.items];
    assert.deepEqual(all.map(item => item.id).sort(), expected[stage].sort());
    assert.ok(all.every(item => cheeseEditorialStage(item) === stage));
  }
  assert.equal((await listEditorial('cheese', 0, 50, database)).total, 25, 'legacy relation selectors still receive every stage');
  await changePublication(live.id, live.revision, false, 'operator', database);
  assert.equal((await listEditorial('cheese', 0, 50, database, 'drafts')).total, 23);
  await changePublication(liveReady.id, liveReady.revision, false, 'operator', database);
  assert.equal((await listEditorial('cheese', 0, 50, database, 'approved')).total, 2);
  assert.equal((await listEditorial('cheese', 0, 50, database, 'published')).total, 0);
});
test('cheese menu validates filters and does not weaken admin authorization or video/price lists', async () => {
  for (const path of [
    '?kind=cheese&stage=unknown', '?kind=cheese&stage[]=drafts',
    '?kind=video&stage=drafts', '?kind=price&stage=approved',
  ]) assert.equal((await api('GET', path)).status, 400);
  for (const token of [null, 'test-client'])
    assert.equal((await api('GET', '?kind=cheese&stage=published', undefined, token)).status, token ? 403 : 401);
  await saveEditorial('video', video(), 'operator', undefined, database);
  assert.equal((await (await api('GET', '?kind=video')).json()).total, 1);
  const draft = await saveEditorial('cheese', cheese(), 'operator', undefined, database);
  const approved = await saveEditorial('cheese', readyCheese(), 'operator', draft, database);
  assert.equal((await listEditorial('cheese', 0, 20, database, 'drafts')).total, 0);
  assert.equal((await listEditorial('cheese', 0, 20, database, 'approved')).items[0].id, approved.id);
  await changePublication(approved.id, approved.revision, true, 'operator', database);
  assert.equal((await listEditorial('cheese', 0, 20, database, 'approved')).total, 0);
  assert.equal((await listEditorial('cheese', 0, 20, database, 'published')).items[0].id, approved.id);
});
test('explicit combined save approves and publishes the submitted cheese revision with both audits', async () => {
  const created = await api('POST', '', { kind: 'cheese', data: readyCheese(), publish: true });
  assert.equal(created.status, 201);
  const saved = await created.json();
  assert.equal(saved.data.status, 'ready');
  assert.equal(saved.publication.publishedRevision, saved.revision);
  assert.equal((await publicCheeseDetail(saved.id, database)).history, readyCheese().history);
  assert.deepEqual((await database.query('SELECT action_type FROM admin_action_logs WHERE entity_id=$1', [saved.id])).rows.map(r => r.action_type).sort(), ['created', 'published']);
  const updated = await api('PATCH', `/${saved.id}`, { kind: 'cheese', revision: saved.revision,
    data: { ...saved.data, history: 'Expanded verified history' }, publish: true });
  assert.equal(updated.status, 200);
  const live = await updated.json();
  assert.equal(live.publication.publishedRevision, live.revision);
  assert.equal((await publicCheeseDetail(saved.id, database)).history, 'Expanded verified history');
  assert.equal((await api('PATCH', `/${saved.id}`, { kind: 'cheese', revision: saved.revision, data: saved.data, publish: true })).status, 409);
  // The next ordinary save must not silently republish.
  await api('PATCH', `/${live.id}`, { kind: 'cheese', revision: live.revision, data: { ...live.data, history: 'Private next revision' } });
  assert.equal((await publicCheeseDetail(saved.id, database)).history, 'Expanded verified history');
});
test('combined save rejects incomplete data, other kinds, malformed flags and unauthorized callers before publishing', async () => {
  for (const data of [cheese(), { ...readyCheese(), history: '' }, { ...readyCheese(), photos: [] }, { ...readyCheese(), latitude: null }]) {
    assert.equal((await api('POST', '', { kind: 'cheese', data, publish: true })).status, 400);
  }
  assert.equal((await api('POST', '', { kind: 'video', data: video(), publish: true })).status, 400);
  assert.equal((await api('POST', '', { kind: 'cheese', data: readyCheese(), publish: 'true' })).status, 400);
  for (const token of [null, 'test-client'])
    assert.equal((await api('POST', '', { kind: 'cheese', data: readyCheese(), publish: true }, token)).status, token ? 403 : 401);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM editorial_entries')).rows[0].n, 0);
});
test('combined save rolls back draft, public snapshot and both logs when publication audit fails', async () => {
  const original = await saveEditorial('cheese', readyCheese(), 'operator', undefined, database, true);
  const count = (await database.query('SELECT count(*)::int AS n FROM admin_action_logs')).rows[0].n;
  await database.query(`CREATE FUNCTION fail_combined_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action_type='published' THEN RAISE EXCEPTION 'test publication audit unavailable'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_combined BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION fail_combined_audit();`);
  try {
    await assert.rejects(saveEditorial('cheese', readyCheese(), 'operator', undefined, database, true));
    await assert.rejects(saveEditorial('cheese', { ...original.data, history: 'Must not leak' }, 'operator', original, database, true));
    const current = (await listEditorial('cheese', 0, 10, database)).items;
    assert.equal(current.length, 1);
    assert.equal(current[0].revision, original.revision);
    assert.equal(current[0].data.history, readyCheese().history);
    assert.equal((await publicCheeseDetail(original.id, database)).history, readyCheese().history);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM admin_action_logs')).rows[0].n, count);
  } finally { await database.query('DROP TRIGGER fail_combined ON admin_action_logs; DROP FUNCTION fail_combined_audit()'); }
});
test('concurrent combined saves accept only one editor revision and publish that exact snapshot', async () => {
  const original = await saveEditorial('cheese', readyCheese(), 'operator', undefined, database);
  const results = await Promise.allSettled(['First history', 'Second history'].map(history =>
    saveEditorial('cheese', { ...original.data, history }, 'operator', original, database, true)));
  const fulfilled = results.filter(result => result.status === 'fulfilled');
  assert.equal(fulfilled.length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(rejected?.status === 'rejected' && expectStatus(409)(rejected.reason));
  if (fulfilled[0].status === 'fulfilled')
    assert.equal((await publicCheeseDetail(original.id, database)).history, fulfilled[0].value.data.history);
});
const batchItem = ({ id, revision }: { id: string; revision: number }) => ({ id, revision });
const batchPath = '/cheese/publish-batch';
const approvalPath = '/cheese/approve-batch';

test('bulk approval moves complete drafts and review requests only to the private approved queue', async () => {
  const draft = await saveEditorial('cheese', { ...readyCheese(), title: 'Draft selection', status: 'draft' }, 'editor', undefined, database);
  const review = await saveEditorial('cheese', { ...readyCheese(), title: 'Review selection', status: 'pending_review' }, 'editor', undefined, database);
  const unselected = await saveEditorial('cheese', { ...readyCheese(), status: 'draft' }, 'editor', undefined, database);
  const selection = [draft, review].map(batchItem);
  const response = await api('POST', approvalPath, { entries: selection });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { approvedCount: 2 });
  const approved = await listEditorial('cheese', 0, 20, database, 'approved');
  assert.equal(approved.total, 2);
  for (const old of [draft, review]) {
    const current = approved.items.find(item => item.id === old.id);
    assert.ok(current);
    assert.deepEqual(current.data, { ...old.data, status: 'ready' });
    assert.equal(current.revision, old.revision + 1);
    assert.equal(current.publication, null);
  }
  assert.deepEqual((await listEditorial('cheese', 0, 20, database, 'drafts')).items.map(item => item.id), [unselected.id]);
  assert.equal((await publicEditorialList('cheese', publicFilters, database)).total, 0);
  const logs = (await database.query(`SELECT entity_id, admin_user_id, action_data FROM admin_action_logs WHERE action_type='approved'`)).rows;
  assert.equal(logs.length, 2);
  assert.deepEqual(new Set(logs.map(log => log.entity_id)), new Set(selection.map(item => item.id)));
  assert.ok(logs.every(log => log.admin_user_id === 'operator-test' && log.action_data.newData.data.status === 'ready'));
  assert.equal((await api('POST', approvalPath, { entries: selection })).status, 409);
  assert.equal((await api('POST', batchPath, { entries: approved.items.map(batchItem) })).status, 200, 'publication is a separate confirmed operation');
  assert.equal((await publicEditorialList('cheese', publicFilters, database)).total, 2);
});

test('bulk approval rejects incomplete, changed, approved or public records without approving the rest', async () => {
  const draftData = { ...readyCheese(), status: 'draft' as const };
  const first = await saveEditorial('cheese', draftData, 'editor', undefined, database);
  const incomplete = await saveEditorial('cheese', cheese(), 'editor', undefined, database);
  const approved = await saveEditorial('cheese', readyCheese(), 'editor', undefined, database);
  const published = await publishedCheese();
  const editedPublic = await saveEditorial('cheese', draftData, 'editor', published, database);
  const videoEntry = await saveEditorial('video', video(), 'editor', undefined, database);
  const outdated = await saveEditorial('cheese', draftData, 'editor', undefined, database);
  await saveEditorial('cheese', { ...draftData, title: 'Edited' }, 'another', outdated, database);
  const approveWith = (item: { id: string; revision: number }) => api('POST', approvalPath, { entries: [batchItem(first), batchItem(item)] });
  for (const item of [incomplete, approved, editedPublic, videoEntry, outdated])
    assert.equal((await approveWith(item)).status, 409);
  assert.equal((await approveWith({ id: randomUUID(), revision: 1 })).status, 404);
  assert.equal((await approveWith(first)).status, 400);
  const stillDraft = (await listEditorial('cheese', 0, 20, database, 'drafts')).items.find(item => item.id === first.id);
  assert.deepEqual(stillDraft, first);
  assert.deepEqual((await listEditorial('cheese', 0, 20, database, 'approved')).items.map(item => item.id), [approved.id]);
  assert.equal((await publicEditorialList('cheese', publicFilters, database)).total, 1);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM admin_action_logs WHERE action_type='approved'")).rows[0].n, 0);
});

test('a failed audit on the second approval leaves both revisions in preparation', async () => {
  const draft = { ...readyCheese(), status: 'pending_review' as const };
  const first = await saveEditorial('cheese', draft, 'editor', undefined, database);
  const second = await saveEditorial('cheese', { ...draft, title: 'Reject approval audit' }, 'editor', undefined, database);
  await database.query(`CREATE FUNCTION fail_second_approval_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action_type='approved' AND NEW.action_data #>> '{newData,data,title}'='Reject approval audit'
      THEN RAISE EXCEPTION 'test bulk approval audit failure'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_approval BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION fail_second_approval_audit();`);
  try {
    await assert.rejects(approveDraftCheeses({ entries: [first, second].map(batchItem) }, 'editor', database), /bulk approval audit failure/);
    const items = (await listEditorial('cheese', 0, 20, database, 'drafts')).items;
    assert.equal(items.length, 2);
    assert.ok(items.every(item => item.revision === 1 && 'status' in item.data && item.data.status === 'pending_review'));
    assert.equal((await database.query("SELECT count(*)::int AS n FROM admin_action_logs WHERE action_type='approved'")).rows[0].n, 0);
  } finally {
    await database.query('DROP TRIGGER fail_approval ON admin_action_logs; DROP FUNCTION fail_second_approval_audit()');
  }
});

test('bulk publication exposes exactly the selected approved cheeses with a single timestamp and one audit each', async () => {
  const cards = [];
  for (const title of ['First selected', 'Second selected', 'Not selected'])
    cards.push(await saveEditorial('cheese', { ...readyCheese(), title }, 'editor', undefined, database));
  const entries = cards.slice(0, 2).map(batchItem);
  const response = await api('POST', batchPath, { entries });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { publishedCount: 2 });
  const published = await listEditorial('cheese', 0, 20, database, 'published');
  assert.equal(published.total, 2);
  const snapshots = await Promise.all(cards.slice(0, 2).map(card => publicCheeseDetail(card.id, database)));
  assert.deepEqual(snapshots.map(item => item.title), ['First selected', 'Second selected']);
  assert.equal(new Set(published.items.map(item => item.publication?.publishedAt)).size, 1);
  assert.ok(published.items.every(item => item.publication?.publishedRevision === item.revision && item.revision === 2));
  assert.deepEqual((await listEditorial('cheese', 0, 20, database, 'approved')).items.map(item => item.id), [cards[2].id]);
  const logs = (await database.query("SELECT entity_id, admin_user_id FROM admin_action_logs WHERE action_type='published'")).rows;
  assert.deepEqual(new Set(logs.map(row => row.entity_id)), new Set(entries.map(item => item.id)));
  assert.ok(logs.every(row => row.admin_user_id === 'operator-test'));
  assert.equal((await api('POST', batchPath, { entries })).status, 409, 'duplicate submission cannot republish');
});

test('bulk publication rejects invalid payloads and rolls back if any selected revision is ineligible', async () => {
  const ready = await saveEditorial('cheese', readyCheese(), 'editor', undefined, database);
  const pending = await saveEditorial('cheese', { ...cheese(), status: 'pending_review' }, 'editor', undefined, database);
  const nonCheese = await saveEditorial('video', { ...video(), status: 'ready' }, 'editor', undefined, database);
  const existing = await publishedCheese();
  const valid = batchItem(ready);
  for (const entries of [[], [valid, { ...valid, id: valid.id.toUpperCase() }],
    [{ id: ready.id, revision: '1' }], [{ ...valid, status: 'ready' }],
    Array.from({ length: 21 }, () => ({ id: randomUUID(), revision: 1 }))]) {
    assert.equal((await api('POST', batchPath, { entries })).status, 400);
  }
  for (const item of [batchItem(pending), batchItem(nonCheese), batchItem(existing), { ...batchItem(existing), revision: 1 }])
    assert.equal((await api('POST', batchPath, { entries: [valid, item] })).status, 409);
  assert.equal((await api('POST', batchPath, { entries: [valid, { id: randomUUID(), revision: 1 }] })).status, 404);
  const changed = await saveEditorial('cheese', { ...readyCheese(), title: 'Edited by another operator' }, 'another', ready, database);
  const other = await saveEditorial('cheese', readyCheese(), 'editor', undefined, database);
  assert.equal((await api('POST', batchPath, { entries: [batchItem(other), valid] })).status, 409);
  assert.equal(changed.revision, 2);
  assert.deepEqual((await listEditorial('cheese', 0, 20, database, 'published')).items.map(item => item.id), [existing.id]);
  assert.equal((await listEditorial('cheese', 0, 20, database, 'approved')).items.find(item => item.id === other.id)?.revision, other.revision);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM admin_action_logs WHERE action_type='published'")).rows[0].n, 1);
});

test('failure of the second bulk audit rolls back both public snapshots and logs', async () => {
  const first = await saveEditorial('cheese', readyCheese(), 'editor', undefined, database);
  const second = await saveEditorial('cheese', { ...readyCheese(), title: 'Reject audit' }, 'editor', undefined, database);
  await database.query(`CREATE FUNCTION fail_second_batch_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action_type='published' AND NEW.action_data #>> '{newData,data,title}'='Reject audit'
      THEN RAISE EXCEPTION 'test bulk audit failure'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_batch BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION fail_second_batch_audit();`);
  try {
    await assert.rejects(publishApprovedCheeses({ entries: [first, second].map(batchItem) }, 'editor', database), /bulk audit failure/);
    assert.equal((await listEditorial('cheese', 0, 20, database, 'published')).total, 0);
    assert.equal((await listEditorial('cheese', 0, 20, database, 'approved')).total, 2);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM admin_action_logs WHERE action_type='published'")).rows[0].n, 0);
  } finally {
    await database.query('DROP TRIGGER fail_batch ON admin_action_logs; DROP FUNCTION fail_second_batch_audit()');
  }
});
test('only explicitly published snapshots are public; edits stay private until republish and withdraw is immediate', async () => {
  let c = await saveEditorial('cheese', readyCheese(), 'PRIVATE_ACTOR', undefined, database);
  assert.equal((await publicEditorialList('cheese', publicFilters, database)).total, 0);
  await assert.rejects(publicCheeseDetail(c.id, database), expectStatus(404));
  c = await changePublication(c.id, c.revision, true, 'PRIVATE_PUBLISHER', database);
  assert.equal(c.revision, 2);
  assert.equal(c.publication?.publishedRevision, 2);
  const published = await publicCheeseDetail(c.id, database);
  assert.equal(published.title, 'Test cheese');
  assert.equal(JSON.stringify(published).includes('PRIVATE_'), false);
  assert.equal('status' in published, false);
  assert.equal('revision' in published, false);
  c = await saveEditorial('cheese', { ...cheese(), title: 'PRIVATE_DRAFT_TITLE' }, 'PRIVATE_EDITOR', c, database);
  assert.equal(c.revision, 3);
  assert.equal(c.publication?.publishedRevision, 2);
  assert.equal((await publicCheeseDetail(c.id, database)).title, 'Test cheese');
  assert.equal((await publicEditorialList('cheese', { ...publicFilters, search: 'PRIVATE_DRAFT' }, database)).total, 0);
  await assert.rejects(changePublication(c.id, c.revision, true, 'operator', database), expectStatus(409));
  c = await saveEditorial('cheese', { ...readyCheese(), title: 'New published title' }, 'operator', c, database);
  c = await changePublication(c.id, c.revision, true, 'operator', database);
  assert.equal((await publicCheeseDetail(c.id, database)).title, 'New published title');
  await assert.rejects(deleteEditorial(c.id, c.revision, 'operator', database), expectStatus(409));
  await changePublication(c.id, c.revision, false, 'operator', database);
  assert.equal((await publicEditorialList('cheese', publicFilters, database)).total, 0);
  await assert.rejects(publicCheesePrices(c.id, 1, 20, database), expectStatus(404));
});
test('milk badges are computed from already published descriptions and characteristics, not newer drafts', async () => {
  let c = await saveEditorial('cheese', { ...readyCheese(), description: 'Традиционный сыр.',
    characteristics: 'Его делают из смеси коровьего и козьего молока.' }, 'editor', undefined, database);
  c = await changePublication(c.id, c.revision, true, 'editor', database);
  const snapshot = { status: 'known', types: ['cow', 'goat'] };
  const detail = () => publicCheeseDetail(c.id, database);
  const cards = () => publicEditorialList('cheese', publicFilters, database).then(page => page.items);
  assert.deepEqual((await detail()).milk, snapshot);
  assert.deepEqual(await cards().then(items => items.map(item => 'milk' in item ? item.milk : undefined)), [snapshot]);
  assert.equal('milk' in c.data, false, 'legacy entries need no stored milk field');
  c = await saveEditorial('cheese', { ...c.data, characteristics: 'Сыр из овечьего молока.' }, 'editor', c, database);
  assert.deepEqual((await detail()).milk, snapshot);
  c = await changePublication(c.id, c.revision, true, 'editor', database);
  assert.deepEqual((await detail()).milk, { status: 'known', types: ['sheep'] });
});
test('manual milk composition is stored in the draft, replaces text only after publishing, and can be cleared', async () => {
  let c = await saveEditorial('cheese', { ...readyCheese(), characteristics: 'Сыр из овечьего молока.' }, 'editor', undefined, database, true);
  const auto = { status: 'known', types: ['sheep'] };
  const composition = [{ type: 'cow', percentage: 80.25 }, { type: 'goat' }];
  const manual = { status: 'known', types: ['cow', 'goat'], composition };
  const detail = () => publicCheeseDetail(c.id, database);
  c = await saveEditorial('cheese', { ...c.data, milkComposition: composition }, 'editor', c, database);
  assert.deepEqual((c.data as CheeseData).milkComposition, composition);
  assert.deepEqual((await detail()).milk, auto);
  c = await changePublication(c.id, c.revision, true, 'editor', database);
  assert.deepEqual((await detail()).milk, manual);
  assert.deepEqual((await publicCheeseMap(publicFilters, database)).items.map(item => 'milk' in item && item.milk), [manual]);
  await assert.rejects(saveEditorial('cheese', { ...c.data, milkComposition: [{ type: 'cow', percentage: 105 }] }, 'editor', c, database), /Доля молока/);
  c = await saveEditorial('cheese', { ...c.data, milkComposition: undefined }, 'editor', c, database, true);
  assert.deepEqual((await detail()).milk, auto);
});
test('public relationships use both published directions and exclude unpublished related content', async () => {
  let c = await saveEditorial('cheese', readyCheese(), 'operator', undefined, database);
  let v = await saveEditorial('video', { ...video(), status: 'ready', cheeseIds: [c.id] }, 'operator', undefined, database);
  const secret = await saveEditorial('video', { ...video(), title: 'PRIVATE_VIDEO' }, 'operator', undefined, database);
  c = await saveEditorial('cheese', { ...readyCheese(), videoIds: [secret.id] }, 'operator', c, database);
  c = await changePublication(c.id, c.revision, true, 'operator', database);
  v = await changePublication(v.id, v.revision, true, 'operator', database);
  assert.deepEqual((await publicCheeseDetail(c.id, database)).relatedVideos.map(r => r.id), [v.id]);
  assert.deepEqual((await publicVideoDetail(v.id, database)).relatedCheeses.map(r => r.id), [c.id]);
  assert.equal(JSON.stringify(await publicCheeseDetail(c.id, database)).includes('PRIVATE_VIDEO'), false);
  await changePublication(v.id, v.revision, false, 'operator', database);
  assert.equal((await publicCheeseDetail(c.id, database)).relatedVideos.length, 0);
  await assert.rejects(publicVideoDetail(v.id, database), expectStatus(404));
});
test('public market prices expose approved observations only, no internal notes, and live catalogue values', async () => {
  let c = await saveEditorial('cheese', { ...readyCheese(), productIds: ['catalogue-test'] }, 'operator', undefined, database);
  c = await changePublication(c.id, c.revision, true, 'operator', database);
  const a = await saveEditorial('price', { ...price(c.id), notes: 'PRIVATE_PRICE_NOTE' }, 'PRIVATE_AUTHOR', undefined, database);
  await saveEditorial('price', { ...price(c.id), store: 'PRIVATE_PENDING_STORE' }, 'operator', undefined, database);
  const rejected = await saveEditorial('price', { ...price(c.id), store: 'PRIVATE_REJECTED_STORE' }, 'operator', undefined, database);
  await moderateEditorial(rejected.id, rejected.revision, 'rejected', 'PRIVATE_REJECTION', 'operator', database);
  const approved = await moderateEditorial(a.id, a.revision, 'approved', 'PRIVATE_MODERATOR_NOTE', 'operator', database);
  const publicPrices = await publicCheesePrices(c.id, 1, 20, database);
  assert.equal(publicPrices.total, 1);
  assert.equal(publicPrices.items[0].pricePerKg, 50);
  assert.equal(JSON.stringify(publicPrices).includes('PRIVATE_'), false);
  assert.deepEqual((await publicCheesePrices(c.id, 2, 20, database)).items, []);
  await database.query("UPDATE products SET price=170,unit='шт.',in_stock=false WHERE id='catalogue-test'");
  let detail = await publicCheeseDetail(c.id, database);
  assert.equal(detail.products[0].price, '170');
  assert.equal(detail.products[0].inStock, false);
  assert.equal(detail.products[0].unit, 'шт.');
  await database.query("UPDATE products SET is_visible=false WHERE id='catalogue-test'");
  assert.equal((await publicCheeseDetail(c.id, database)).products.length, 0);
  await saveEditorial('price', { ...price(c.id), price: 500 }, 'operator', approved, database);
  assert.equal((await publicCheesePrices(c.id, 1, 20, database)).total, 0);
});
test('public APIs have pagination/search/filter/map and reject malformed queries without exposing drafts', async () => {
  let c = await saveEditorial('cheese', { ...readyCheese(), region: 'Ломбардия' }, 'operator', undefined, database);
  c = await changePublication(c.id, c.revision, true, 'operator', database);
  await saveEditorial('cheese', { ...readyCheese(), title: 'SECRET_DRAFT' }, 'operator', undefined, database);
  let v = await saveEditorial('video', { ...video(), status: 'ready', category: 'places' }, 'operator', undefined, database);
  v = await changePublication(v.id, v.revision, true, 'operator', database);
  const publicBase = base.replace('/admin/editorial', '/editorial');
  const list = await fetch(`${publicBase}/cheeses?search=${encodeURIComponent('Ломбардия')}&country=${encodeURIComponent('Италия')}`);
  assert.equal(list.headers.get('cache-control'), 'no-store');
  const data = await list.json();
  assert.equal(data.total, 1);
  assert.deepEqual(data.countries, ['Италия']);
  assert.equal(JSON.stringify(data).includes('SECRET_DRAFT'), false);
  assert.equal((await (await fetch(`${publicBase}/cheeses?page=2&limit=1`)).json()).items.length, 0);
  assert.equal((await (await fetch(`${publicBase}/videos?category=places`)).json()).total, 1);
  assert.equal((await (await fetch(`${publicBase}/videos?category=recipe`)).json()).total, 0);
  const map = await (await fetch(`${publicBase}/map`)).json();
  assert.equal(map.items[0].latitude, 45);
  assert.equal(map.items[0].longitude, 9);
  assert.equal(map.truncated, false);
  assert.equal('history' in map.items[0], false);
  for (const path of ['/videos?category=invalid', '/cheeses?limit=1000', '/videos/not-uuid', '/cheeses?search[]=x'])
    assert.equal((await fetch(`${publicBase}${path}`)).status, 400);
  const draft = await saveEditorial('video', video(), 'operator', undefined, database);
  assert.equal((await fetch(`${publicBase}/videos/${draft.id}`)).status, 404);
});
test('map pages expose published points beyond the first thousand', async () => {
  await database.query(`WITH records AS (
      INSERT INTO editorial_entries(kind,data,created_by,updated_by)
      SELECT 'cheese', $1::jsonb || jsonb_build_object('title','Cheese ' || n, 'sortOrder',n),
        'fixture','fixture' FROM generate_series(1,1001) AS n
      RETURNING id,data,revision
    ) INSERT INTO editorial_publications(entry_id,kind,data,published_revision,published_by)
    SELECT id,'cheese',data,revision,'fixture' FROM records`, [JSON.stringify(readyCheese())]);
  const publicMap = base.replace('/admin/editorial', '/editorial/map');
  const first = await fetch(`${publicMap}?page=1`).then(response => response.json());
  const next = await fetch(`${publicMap}?page=2`).then(response => response.json());
  assert.equal(first.total, 1001);
  assert.equal(first.items.length, 1000);
  assert.equal(first.truncated, true);
  assert.equal(next.total, 1001);
  assert.deepEqual(next.items.map((item: { title: string }) => item.title), ['Cheese 1001']);
  assert.equal(next.truncated, false);
});
test('atlas filters by the current country without rewriting the published origin or pin', async () => {
  async function publish(title: string, country: string, latitude: number, longitude: number) {
    const draft = await saveEditorial('cheese', { ...readyCheese(), title, country, latitude, longitude,
      // Production is deliberately unrelated to the historical origin.
      productionCountry: 'Италия',
    }, 'operator', undefined, database);
    return changePublication(draft.id, draft.revision, true, 'operator', database);
  }
  const russian = await publish('Вологодский сыр', 'СССР', 59.22, 39.89);
  const georgian = await publish('Сулугуни', 'СССР', 41.71, 44.79);
  const slovak = await publish('Брынза', 'Чехословакия', 48.15, 17.11);
  const russianModern = await publish('Другой сыр', 'Российская Федерация', 55.75, 37.62);
  await saveEditorial('cheese', { ...readyCheese(), title: 'Невидимый', country: 'Цейлон' }, 'operator', undefined, database);
  const publicBase = base.replace('/admin/editorial', '/editorial');
  const get = async (path: string, params = {}) => {
    const response = await fetch(`${publicBase}${path}?${new URLSearchParams(params)}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  const russia = await get('/cheeses', { country: 'Россия', limit: '1' });
  assert.deepEqual(russia.countries, ['Грузия', 'Россия', 'Словакия']);
  assert.equal(russia.total, 2);
  assert.equal(russia.items.length, 1);
  const map = await get('/map', { country: 'RU' });
  assert.deepEqual(new Set(map.items.map((item: { id: string }) => item.id)), new Set([russian.id, russianModern.id]));
  const pin = map.items.find((item: { id: string }) => item.id === russian.id);
  assert.equal(pin.latitude, 59.22);
  assert.equal(pin.longitude, 39.89);
  assert.equal(pin.country, 'СССР');
  assert.equal(pin.atlasCountry, 'Россия');
  assert.deepEqual((await get('/map', { country: 'Грузия' })).items.map((item: { id: string }) => item.id), [georgian.id]);
  assert.deepEqual((await get('/map', { country: 'Словакия' })).items.map((item: { id: string }) => item.id), [slovak.id]);
  assert.equal((await get('/cheeses', { search: 'СССР' })).total, 2);
  assert.equal((await get('/cheeses', { search: 'Россия' })).total, 2);
  const detail = await get(`/cheeses/${russian.id}`);
  assert.equal(detail.country, 'СССР');
  assert.equal(detail.productionCountry, 'Италия');
});
test('publication audit failure rolls back exposure; stale/concurrent publication cannot override newer decisions', async () => {
  let v = await saveEditorial('video', { ...video(), status: 'ready' }, 'operator', undefined, database);
  await database.query(`CREATE FUNCTION fail_publication_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
    CREATE TRIGGER fail_pub_audit BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION fail_publication_audit();`);
  try {
    await assert.rejects(changePublication(v.id, v.revision, true, 'operator', database));
    assert.equal((await publicEditorialList('video', publicFilters, database)).total, 0);
  } finally {
    await database.query('DROP TRIGGER fail_pub_audit ON admin_action_logs; DROP FUNCTION fail_publication_audit()');
  }
  const results = await Promise.allSettled([
    changePublication(v.id, v.revision, true, 'operator', database),
    changePublication(v.id, v.revision, true, 'other-operator', database),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  v = results.find(r => r.status === 'fulfilled')!.value;
  await assert.rejects(changePublication(v.id, v.revision - 1, false, 'operator', database), expectStatus(409));
  const publishedViaApi = await api('POST', `/${v.id}/unpublish`, { revision: v.revision });
  assert.equal(publishedViaApi.status, 200);
  assert.equal((await publishedViaApi.json()).publication, null);
});
test('customer prices start pending; owner history reflects moderation without exposing internal fields or editing the catalogue', async () => {
  const c = await publishedCheese();
  const s = await submitPrice(c.id, observation(), 'owner-a', database);
  assert.equal(s.status, 'pending');
  assert.equal((await publicCheesePrices(c.id, 1, 20, database)).total, 0);
  assert.equal((await ownPriceSubmissions(c.id, 'owner-a', 1, 10, database)).total, 1);
  assert.equal((await ownPriceSubmissions(c.id, 'owner-b', 1, 10, database)).total, 0);
  const stored = (await listEditorial('price', 0, 10, database)).items[0];
  assert.equal((stored.data as PriceData).sourceType, 'user');
  const approved = await moderateEditorial(s.id, stored.revision, 'approved', 'PRIVATE_ADMIN_NOTE', 'PRIVATE_MODERATOR', database);
  let history = await ownPriceSubmissions(c.id, 'owner-a', 1, 10, database);
  assert.equal(history.items[0].status, 'approved');
  assert.equal(JSON.stringify(history).includes('PRIVATE_'), false);
  assert.equal('createdBy' in history.items[0], false);
  assert.equal((await publicCheesePrices(c.id, 1, 20, database)).items[0].pricePerKg, 50);
  const revised = await saveEditorial('price', { ...approved.data, price: 20 }, 'operator', approved, database);
  history = await ownPriceSubmissions(c.id, 'owner-a', 1, 10, database);
  assert.equal(history.items[0].data.price, 12.5, 'history retains original observation, not internal edits');
  assert.equal(history.items[0].status, 'pending');
  await moderateEditorial(s.id, revised.revision, 'rejected', 'PRIVATE_REJECTION', 'operator', database);
  assert.equal((await ownPriceSubmissions(c.id, 'owner-a', 1, 10, database)).items[0].status, 'rejected');
  assert.equal((await publicCheesePrices(c.id, 1, 20, database)).total, 0);
  assert.equal((await database.query("SELECT price FROM products WHERE id='catalogue-test'")).rows[0].price, '100');
});
test('customer endpoints enforce authentication, ownership, immutable server fields and strict query/body validation', async () => {
  const c = await publishedCheese();
  for (const [method, suffix] of [['POST', ''], ['GET', '/mine']]) {
    const res = await submissionsApi(c.id, method, method === 'POST' ? observation() : undefined, null, suffix);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  }
  for (const field of ['userId', 'createdBy', 'sourceType', 'notes', 'offerConditions', 'moderation', 'cheeseId', 'revision'])
    assert.equal((await submissionsApi(c.id, 'POST', { ...observation(), [field]: 'forged' })).status, 400);
  const res = await submissionsApi(c.id, 'POST', observation());
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const mine = await submissionsApi(c.id, 'GET', undefined, 'owner-a', '/mine');
  assert.equal((await mine.json()).total, 1);
  const other = await submissionsApi(c.id, 'GET', undefined, 'owner-b', '/mine');
  assert.equal((await other.json()).total, 0);
  assert.equal((await submissionsApi(c.id, 'GET', undefined, 'owner-b', '/mine?userId=owner-a')).status, 400);
  assert.equal((await submissionsApi(c.id, 'GET', undefined, 'owner-a', '/mine?limit=200')).status, 400);
  assert.equal((await submissionsApi(c.id, 'POST', observation())).status, 409);
  assert.equal((await submissionsApi(c.id, 'POST', observation(), 'owner-b')).status, 201, 'duplicates are scoped to account');
});
test('cooldown and rolling daily quota apply across articles and survive admin edits/deletions', async () => {
  const a = await publishedCheese(), b = await publishedCheese();
  const first = await submitPrice(a.id, observation(), 'owner-a', database);
  await assert.rejects(submitPrice(b.id, observation('Other'), 'owner-a', database), e =>
    e instanceof PriceSubmissionLimitError && e.retryAfterSeconds > 0 && e.retryAfterSeconds <= 60);
  await database.query("UPDATE editorial_price_submissions SET created_at=now()-interval '2 hours'");
  for (let i = 1; i < 10; i++) {
    await submitPrice(i % 2 ? b.id : a.id, observation(`Store-${i}`), 'owner-a', database);
    await database.query("UPDATE editorial_price_submissions SET created_at=now()-interval '2 hours'");
  }
  let history = await ownPriceSubmissions(a.id, 'owner-a', 1, 2, database);
  assert.equal(history.items.length, 2);
  assert.equal(history.total, 5);
  assert.equal(history.limits.dailyRemaining, 0);
  const limitResponse = await submissionsApi(b.id, 'POST', observation('Eleventh'));
  assert.equal(limitResponse.status, 429);
  assert.ok(Number(limitResponse.headers.get('retry-after')) > 21 * 3600);
  const old = (await listEditorial('price', 0, 20, database)).items.find(e => e.id === first.id)!;
  await saveEditorial('price', { ...old.data, price: 99 }, 'operator', old, database);
  await assert.rejects(submitPrice(a.id, observation(), 'owner-a', database), expectStatus(409));
  await database.query("DELETE FROM editorial_entries WHERE kind='price'");
  history = await ownPriceSubmissions(a.id, 'owner-a', 1, 10, database);
  assert.equal(history.limits.dailyRemaining, 0);
  assert.equal(history.items.every(item => item.status === 'removed'), true);
  await assert.rejects(submitPrice(a.id, observation('New after deletion'), 'owner-a', database), expectStatus(429));
  await database.query("UPDATE editorial_price_submissions SET created_at=now()-interval '25 hours'");
  await submitPrice(a.id, observation(), 'owner-a', database);
  assert.equal((await ownPriceSubmissions(a.id, 'owner-a', 1, 20, database)).limits.dailyRemaining, 9);
});
test('racing repeated or distinct submissions cannot bypass duplicate and interval guards', async () => {
  const c = await publishedCheese();
  const same = await Promise.allSettled([submitPrice(c.id, observation(), 'owner-a', database), submitPrice(c.id, observation(), 'owner-a', database)]);
  assert.equal(same.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(same.find(r => r.status === 'rejected')!.reason.status, 409);
  const different = await Promise.allSettled([submitPrice(c.id, observation('First'), 'owner-b', database), submitPrice(c.id, observation('Second'), 'owner-b', database)]);
  assert.equal(different.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(different.find(r => r.status === 'rejected')!.reason.status, 429);
  assert.equal((await database.query('SELECT count(*)::int AS count FROM editorial_price_submissions')).rows[0].count, 2);
});
test('failed customer audit rolls back observation and quota; unpublished articles and missing accounts cannot submit', async () => {
  const draft = await saveEditorial('cheese', readyCheese(), 'operator', undefined, database);
  await assert.rejects(submitPrice(draft.id, observation(), 'owner-a', database), expectStatus(404));
  const c = await changePublication(draft.id, draft.revision, true, 'operator', database);
  await assert.rejects(submitPrice(c.id, observation(), 'nonexistent', database), expectStatus(401));
  await database.query(`CREATE FUNCTION fail_submission_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
    CREATE TRIGGER fail_sub_audit BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION fail_submission_audit();`);
  try { await assert.rejects(submitPrice(c.id, observation(), 'owner-a', database)); }
  finally { await database.query('DROP TRIGGER fail_sub_audit ON admin_action_logs; DROP FUNCTION fail_submission_audit()'); }
  assert.equal((await ownPriceSubmissions(c.id, 'owner-a', 1, 10, database)).limits.dailyRemaining, 10);
  assert.equal((await listEditorial('price', 0, 10, database)).total, 0);
  await submitPrice(c.id, observation(), 'owner-a', database);
  await changePublication(c.id, c.revision, false, 'operator', database);
  await assert.rejects(ownPriceSubmissions(c.id, 'owner-a', 1, 10, database), expectStatus(404));
  await assert.rejects(submitPrice(c.id, observation('New'), 'owner-a', database), expectStatus(404));
});
test('observations validate dates, units, source and currency; canonical duplicate detection ignores casing and key order', async () => {
  for (const invalid of [
    { price: 0 }, { packageQuantity: 0 }, { currency: 'XXX' }, { packageUnit: 'unknown' },
    { observedOn: '9999-01-01' }, { observedOn: '2026-02-30' }, { channel: 'online', sourceUrl: '' },
    { sourceUrl: 'javascript:alert(1)' }, { channel: 'online', sourceUrl: 'https://user:pass@example.org' },
  ]) assert.equal(priceSubmissionSchema.safeParse({ ...observation(), ...invalid }).success, false);
  const c = await publishedCheese();
  await submitPrice(c.id, observation('Example   Shop'), 'owner-a', database);
  const reversed = Object.fromEntries(Object.entries(observation('  example shop ')).reverse());
  await assert.rejects(submitPrice(c.id, reversed, 'owner-a', database), expectStatus(409));
  assert.equal((await ownPriceSubmissions(c.id, 'owner-a', 2, 10, database)).items.length, 0);
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
