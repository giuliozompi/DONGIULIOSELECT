import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import express from 'express';
import type { Server } from 'node:http';
import { saveEditorial, moderateEditorial, EditorialError } from '../server/services/editorial';
import { createPriceWatch, setPriceWatchActive, reserveMarketCheck, executeMarketCheck, getMarketCheck,
  applyMarketCheck, runDuePriceWatches, marketHistory, amountAppears, type MarketDeps } from '../server/services/editorial-market';
import { parseCbrXml, getEditorialFx } from '../server/services/editorial-fx';
import { rubleEquivalent, priceObservationAgeDays } from '../shared/editorial-market';
import { registerEditorialMarketRoutes } from '../server/adminEditorialMarketRoutes';

const exec = promisify(execFile);
let dir: string, db: pg.Pool, server: Server, base: string;
const text = 'Parmigiano Reggiano cheese 200 g costs 12.90 EUR. Retail offer, available without a club card. '.repeat(3);
const source = { url: 'https://example.org/offer', finalUrl: 'https://example.org/offer', title: 'Retail offer',
  text, sha256: 'fixture', retrievedAt: new Date().toISOString(), characters: text.length, truncated: false };
const proposal = () => ({ productName: 'Parmigiano Reggiano', store: 'Example shop', price: 12.9, currency: 'EUR',
  packageQuantity: 200, packageUnit: 'g', pricePassageId: 0, packagePassageId: 0, conditions: 'Retail offer', warnings: [] });
let modelCalls = 0;
const deps: MarketDeps = { source: async () => source, model: async () => { modelCalls++; return proposal(); } };
const xml = (date = '29.10.2026') => `<ValCurs Date="${date}"><Valute ID="EUR"><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>100,2500</Value></Valute>
  <Valute ID="JPY"><CharCode>JPY</CharCode><Nominal>100</Nominal><Value>55,0000</Value></Valute></ValCurs>`;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'editorial-market-'));
  await exec('initdb', ['-D', join(dir, 'data'), '-U', 'editorial_test', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  await exec('pg_ctl', ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -p 55472 -h ''`, '-w', 'start']);
  db = new pg.Pool({ host: dir, port: 55472, user: 'editorial_test', database: 'postgres', password: '', ssl: false, max: 8 });
  await db.query(`CREATE TABLE products(id varchar PRIMARY KEY);
    CREATE TABLE admin_action_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_user_id varchar NOT NULL,
    action_type text NOT NULL,entity_type text NOT NULL,entity_id varchar,action_data jsonb NOT NULL);`);
  for (const file of ['editorial-admin.sql', 'editorial-publication.sql', 'editorial-market.sql'])
    await db.query(await readFile(`migrations/${file}`, 'utf8'));
  const app = express(); app.use(express.json());
  registerEditorialMarketRoutes(app, [
    (req, res, next) => req.headers.authorization ? next() : void res.sendStatus(401),
    (req, res, next) => req.headers.authorization === 'admin' ? next() : void res.sendStatus(403),
  ], () => 'operator', db, deps);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}/web-api/admin/editorial-market`;
}, { timeout: 30000 });
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await db?.end();
  if (dir) { await exec('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']).catch(() => {}); await rm(dir, { recursive: true, force: true }); }
});
beforeEach(async () => {
  await db.query('TRUNCATE editorial_price_checks,editorial_price_watches,editorial_fx_rates,editorial_publications,editorial_entries,admin_action_logs');
  modelCalls = 0;
});
const fails = (status: number) => (error: unknown) => error instanceof EditorialError && error.status === status;
async function watch() {
  const cheese = await saveEditorial('cheese', { title: 'Пармиджано Реджано', country: 'Италия' }, 'operator', undefined, db);
  return createPriceWatch({ cheeseId: cheese.id, country: 'Италия', store: 'Example shop', sourceUrl: source.url }, 'operator', db);
}
async function checked() {
  const w = await watch(), reserved = await reserveMarketCheck(w.id, randomUUID(), 'operator', db);
  await executeMarketCheck(reserved.check.id, db, deps);
  return { w, check: await getMarketCheck(reserved.check.id, db) };
}
const editable = () => ({ price: 12.9, currency: 'EUR', packageQuantity: 200, packageUnit: 'g', store: 'Example shop', notes: 'Проверено оператором' });
test('official FX parser handles nominal amounts and rejects future, malformed and external entity documents', () => {
  assert.equal(priceObservationAgeDays('2026-10-01', '2026-10-30'), 29);
  assert.equal(priceObservationAgeDays('2026-10-31', '2026-10-30'), null);
  assert.equal(priceObservationAgeDays('2026-02-30', '2026-10-30'), null);
  const data = parseCbrXml(xml(), '2026-10-30');
  assert.equal(data.rates.EUR, 100.25); assert.equal(data.rates.JPY, 0.55);
  for (const invalid of [xml('31.10.2026'), xml('31.02.2026'), '<error/>', '<!DOCTYPE x>'+xml(), xml().replace('<Nominal>100', '<Nominal>0')])
    assert.throws(() => parseCbrXml(invalid, '2026-10-30'));
});
test('FX cache preserves original dates, coalesces refreshes, supports weekends and explicit stale/unavailable outcomes', async () => {
  let calls = 0; const state = {};
  const now = new Date('2026-10-30T12:00:00Z');
  const fetcher = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return xml(); };
  const [a, b] = await Promise.all([getEditorialFx(db, fetcher, now, state), getEditorialFx(db, fetcher, now, state)]);
  assert.equal(calls, 1); assert.equal(a.status, 'fresh'); assert.deepEqual(a, b);
  assert.equal(a.effectiveOn, '2026-10-29'); assert.equal(a.requestedOn, '2026-10-30');
  assert.equal(rubleEquivalent(12.9, 'EUR', a), 1293.23);
  assert.equal(rubleEquivalent(100, 'JPY', a), 55);
  assert.equal(rubleEquivalent(1, 'ZZZ', a), null);
  await getEditorialFx(db, fetcher, now, state); assert.equal(calls, 1);
  const fail = async () => { calls++; throw Error('offline'); };
  const stale = await getEditorialFx(db, fail, new Date('2026-10-31T12:00:00Z'), state);
  assert.equal(stale.status, 'stale'); assert.equal(stale.effectiveOn, a.effectiveOn); assert.equal(stale.rates.EUR, a.rates.EUR);
  await getEditorialFx(db, fail, new Date('2026-10-31T12:01:00Z'), state); assert.equal(calls, 2);
  await db.query('TRUNCATE editorial_fx_rates');
  assert.equal((await getEditorialFx(db, fail, new Date('2026-10-31T13:00:00Z'), {})).status, 'unavailable');
});
test('Moscow midnight refresh never returns yesterday as a fresh requested-day rate', async () => {
  const state = {}; let calls = 0;
  const fetcher = async (day: string) => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return xml(day === '2026-10-30' ? '30.10.2026' : '29.10.2026'); };
  const [a, b] = await Promise.all([
    getEditorialFx(db, fetcher, new Date('2026-10-29T20:59:59Z'), state),
    getEditorialFx(db, fetcher, new Date('2026-10-29T21:00:01Z'), state),
  ]);
  assert.equal(a.requestedOn, '2026-10-29'); assert.equal(b.requestedOn, '2026-10-30'); assert.equal(calls, 2);
});
test('watch creation rejects duplicates and checks are single-flight, idempotent and never publish prices', async () => {
  const w = await watch();
  await assert.rejects(createPriceWatch({ cheeseId: w.cheeseId, country: w.country, sourceUrl: source.url+'#section' }, 'operator', db), fails(409));
  const nonce = randomUUID(), a = await reserveMarketCheck(w.id, nonce, 'operator', db);
  assert.equal((await reserveMarketCheck(w.id, nonce, 'operator', db)).created, false);
  await assert.rejects(reserveMarketCheck(w.id, randomUUID(), 'operator', db), fails(409));
  await executeMarketCheck(a.check.id, db, deps);
  const done = await getMarketCheck(a.check.id, db);
  assert.equal(done.proposal?.price, 12.9); assert.equal(done.proposal?.packageQuantity, 200);
  assert.ok(done.evidence?.priceQuote?.includes('12.90 EUR'));
  assert.equal((await db.query("SELECT count(*)::int n FROM editorial_entries WHERE kind='price'")).rows[0].n, 0);
  assert.equal((await marketHistory(w.id, 1, db)).total, 1);
  assert.equal(modelCalls, 1);
});
test('weekly scheduler advances due dates, skips paused sources and cannot duplicate work across two workers', async () => {
  const w = await watch();
  await runDuePriceWatches(db, deps); assert.equal(modelCalls, 0);
  await db.query("UPDATE editorial_price_watches SET next_check_at=now()-interval '1 minute' WHERE id=$1", [w.id]);
  await Promise.all([runDuePriceWatches(db, deps), runDuePriceWatches(db, deps)]);
  assert.equal(modelCalls, 1);
  const row = (await db.query('SELECT next_check_at FROM editorial_price_watches WHERE id=$1', [w.id])).rows[0];
  assert.ok(new Date(row.next_check_at).valueOf() > Date.now()+6.9*86400000);
  const paused = await setPriceWatchActive(w.id, { revision: w.revision, active: false }, 'operator', db);
  await db.query("UPDATE editorial_price_watches SET next_check_at=now()-interval '1 minute' WHERE id=$1", [w.id]);
  await runDuePriceWatches(db, deps); assert.equal(modelCalls, 1);
  await assert.rejects(setPriceWatchActive(w.id, { revision: w.revision, active: true }, 'operator', db), fails(409));
  const resumed = await setPriceWatchActive(w.id, { revision: paused.revision, active: true }, 'operator', db);
  assert.ok(new Date(resumed.nextCheckAt).valueOf() > Date.now()+6.9*86400000);
});
test('unconfirmed numeric values, ambiguous currency and unknown package sizes stay absent rather than invented', async () => {
  const w = await watch(), { check } = await reserveMarketCheck(w.id, randomUUID(), 'operator', db);
  await executeMarketCheck(check.id, db, { ...deps, model: async () => ({ ...proposal(), price: 9999, currency: 'USD', packageQuantity: 1, packageUnit: 'kg' }) });
  const result = (await getMarketCheck(check.id, db)).proposal!;
  assert.equal(result.price, null); assert.equal(result.currency, null); assert.equal(result.packageQuantity, null);
  assert.ok(result.warnings.length >= 3);
  assert.equal(amountAppears(1299, '€ 1.299,00'), true);
  assert.equal(amountAppears(1.299, '1,299'), false);
});
test('operator imports one reviewed pending observation; approval is separate and original approved history remains unchanged', async () => {
  const { w, check } = await checked();
  const old = await saveEditorial('price', { ...editable(), cheeseId: w.cheeseId, sourceType: 'internet', sourceUrl: source.url,
    country: w.country, observedOn: check.observedOn, price: 10 }, 'operator', undefined, db);
  await moderateEditorial(old.id, old.revision, 'approved', 'Проверено', 'operator', db);
  const a = await applyMarketCheck(check.id, editable(), 'operator', db);
  assert.equal(a.entry.moderation, 'pending'); assert.equal((a.entry.data as any).price, 12.9);
  assert.equal((a.entry.data as any).observedOn, check.observedOn);
  assert.equal((await applyMarketCheck(check.id, editable(), 'operator', db)).entry.id, a.entry.id);
  await assert.rejects(applyMarketCheck(check.id, { ...editable(), price: 15 }, 'operator', db), fails(409));
  assert.equal((await db.query('SELECT data FROM editorial_entries WHERE id=$1', [old.id])).rows[0].data.price, 10);
  assert.equal((await db.query("SELECT count(*)::int n FROM editorial_entries WHERE kind='price' AND moderation='approved'")).rows[0].n, 1);
  await assert.rejects(applyMarketCheck(check.id, { ...editable(), country: 'forged' }, 'operator', db));
});
test('provider failures do not retry or replace prices; expired runs release locks without an automatic immediate retry', async () => {
  const w = await watch(), { check } = await reserveMarketCheck(w.id, randomUUID(), 'operator', db);
  let attempts = 0;
  await executeMarketCheck(check.id, db, { ...deps, model: async () => { attempts++; throw Error('private upstream detail'); } });
  const failed = await getMarketCheck(check.id, db);
  assert.equal(attempts, 1); assert.equal(failed.status, 'failed'); assert.equal(failed.error?.includes('private'), false);
  const next = await reserveMarketCheck(w.id, randomUUID(), 'operator', db);
  await db.query("UPDATE editorial_price_checks SET lease_until=now()-interval '1 minute' WHERE id=$1", [next.check.id]);
  assert.equal((await getMarketCheck(next.check.id, db)).status, 'failed');
  await runDuePriceWatches(db, deps); assert.equal(modelCalls, 0);
});
test('audit failures roll back pending observations and check application metadata', async () => {
  const { check } = await checked();
  await db.query(`CREATE FUNCTION fail_market_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit fail'; END $$;
    CREATE TRIGGER fail_market_audit BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION fail_market_audit();`);
  try {
    await assert.rejects(applyMarketCheck(check.id, editable(), 'operator', db));
    assert.equal((await getMarketCheck(check.id, db)).entryId, null);
    assert.equal((await db.query("SELECT count(*)::int n FROM editorial_entries WHERE kind='price'")).rows[0].n, 0);
  } finally { await db.query('DROP TRIGGER fail_market_audit ON admin_action_logs; DROP FUNCTION fail_market_audit()'); }
});
test('all monitor APIs reject guests and customers before work; forged fields and invalid sources fail validation', async () => {
  for (const [method, path] of [['GET', '/watches'], ['POST', '/watches'], ['PATCH', `/watches/${randomUUID()}`],
    ['POST', `/watches/${randomUUID()}/check`], ['GET', `/watches/${randomUUID()}/checks`],
    ['GET', `/checks/${randomUUID()}`], ['POST', `/checks/${randomUUID()}/apply`]]) {
    for (const token of ['', 'customer']) {
      const res = await fetch(base+path, { method, headers: { ...(token ? { Authorization: token } : {}), 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      assert.equal(res.status, token ? 403 : 401);
    }
  }
  assert.equal(modelCalls, 0);
  const res = await fetch(base+'/watches', { method: 'POST', headers: { Authorization: 'admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ cheeseId: randomUUID(), sourceUrl: 'http://internal/', country: 'RU', active: false }) });
  assert.equal(res.status, 400);
});
