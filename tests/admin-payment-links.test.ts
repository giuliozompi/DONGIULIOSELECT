import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import express from 'express';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema';
import { buildPaymentLinkState } from '../shared/payment-link-attempts';
import { summarizePaymentDelivery } from '../shared/payment-link-delivery';
import { getPaymentLinkStates, reservePaymentLinkAttempt, finishPaymentLinkAttempt, PaymentAttemptBlocked, recordAcceptedPaymentLink } from '../server/services/payment-link-attempts';
import { registerAdminPaymentLinks } from '../server/adminPaymentLinkRoutes';

// Private temporary Postgres; never inherit production/workspace PG defaults.
const exec = promisify(execFile);
let directory: string;
let pool: pg.Pool;
let database: ReturnType<typeof drizzle<typeof schema>>;
let server: ReturnType<ReturnType<typeof express>['listen']>;
let started = false;
let base: string;
let order: any;
let provider: any;
let intent: any;
let sends = 0;
let providerChecks = 0;
const accepted = summarizePaymentDelivery([
  { channel: 'email', status: 'sent', detail: 'Accepted, not delivery confirmation' },
  { channel: 'telegram', status: 'failed', detail: 'Provider rejected' },
  { channel: 'whatsapp', status: 'skipped', detail: 'Disabled' },
]);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'payment-attempts-pg-'));
  await exec('initdb', ['-D', join(directory, 'data'), '-U', 'payment_test', '-A', 'trust', '--no-locale']);
  await exec('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
  started = true;
  pool = new pg.Pool({ host: directory, port: 5432, database: 'postgres', user: 'payment_test', max: 12 });
  database = drizzle({ client: pool, schema });
  await pool.query(`CREATE TABLE order_notification_logs (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), event text NOT NULL, channel text NOT NULL,
    recipient text NOT NULL, user_id varchar, order_id varchar, customer_name text, customer_phone text,
    status text NOT NULL DEFAULT 'sent', details text, sent_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE orders (id varchar PRIMARY KEY, status text, payment_id varchar,
    payment_method text, amount decimal(10,2), payment_link_sent_at timestamp)`);
  const app = express();
  app.use(express.json());
  registerAdminPaymentLinks(app,
    (req, res, next) => req.headers.authorization ? next() : res.sendStatus(401),
    (req, res, next) => req.headers.authorization === 'admin' ? next() : res.sendStatus(403),
    {
      getOrder: async id => id === order.id ? order : undefined,
      getIntent: async () => intent,
      getStates: orders => getPaymentLinkStates(orders, database),
      getPayment: async () => { providerChecks++; return provider; },
      updateOrder: async (_, patch) => (order = { ...order, ...patch }),
      send: async (current, prepare) => {
        const id = await reservePaymentLinkAttempt(current as any, database);
        try {
          if (typeof prepare === 'function') await prepare();
          sends++;
          await finishPaymentLinkAttempt(id, accepted, undefined, false, database);
          return accepted;
        } catch (error) {
          await finishPaymentLinkAttempt(id, undefined, 'Preparation failed', false, database);
          throw error;
        }
      },
    });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/web-api/admin/orders`;
}, { timeout: 30000 });

after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pool?.end();
  if (started) await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await pool.query('TRUNCATE order_notification_logs');
  sends = 0; providerChecks = 0;
  order = { id: 'fixture-order', userId: 'fixture-customer', status: 'СОБРАН', paymentMethod: 'yookassa',
    paymentId: 'fixture-intent', amount: '100.00', customerName: 'Fixture', customerPhone: 'test', items: [] };
  intent = { id: 'fixture-intent', orderId: order.id, status: 'pending', amount: '100.00',
    redirectUrl: 'https://example.invalid/payment', raw: { yookassaPaymentId: 'fixture-provider-payment' } };
  provider = { id: 'fixture-provider-payment', status: 'pending', paid: false,
    amount: { currency: 'RUB', value: '100.00' }, metadata: { orderId: order.id } };
});

const post = (role = 'admin', id = 'fixture-order') => fetch(`${base}/${id}/resend-payment-link`, {
  method: 'POST', headers: role ? { Authorization: role } : {},
});

test('20 competing database reservations allow exactly one attempt across connections', async () => {
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => reservePaymentLinkAttempt(order, database)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  for (const result of results) if (result.status === 'rejected') assert.ok(result.reason instanceof PaymentAttemptBlocked);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_notification_logs')).rows[0].n, 1);
});

test('partial acceptance and channel errors persist after a fresh database read', async () => {
  const id = await reservePaymentLinkAttempt(order, database);
  await finishPaymentLinkAttempt(id, accepted, undefined, false, database);
  const state = (await getPaymentLinkStates([order], database))[order.id];
  assert.equal(state.history[0].status, 'partial');
  assert.deepEqual(state.history[0].summary, accepted);
  assert.equal(state.attemptsInHour, 1);
  assert.equal(state.canSend, false);
  assert.ok(state.retryAt);
});

test('failed attempts count toward the hourly limit and it expires without deleting history', async () => {
  for (const minutes of [16, 10, 6]) {
    const id = await reservePaymentLinkAttempt(order, database);
    await finishPaymentLinkAttempt(id, undefined, 'Fixture failure', false, database);
    await pool.query(`UPDATE order_notification_logs SET sent_at=now()-($1::int * interval '1 minute') WHERE id=$2`, [minutes, id]);
  }
  const state = (await getPaymentLinkStates([order], database))[order.id];
  assert.equal(state.attemptsInHour, 3);
  assert.equal(state.canSend, false);
  assert.match(state.reason!, /лимит/);
  await assert.rejects(reservePaymentLinkAttempt(order, database), PaymentAttemptBlocked);
  await pool.query(`UPDATE order_notification_logs SET sent_at=now()-interval '61 minutes'`);
  assert.equal((await getPaymentLinkStates([order], database))[order.id].canSend, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM order_notification_logs')).rows[0].n, 3);
});

test('interrupted attempts become unknown, never successful, after the pending lease', async () => {
  await reservePaymentLinkAttempt(order, database);
  await pool.query(`UPDATE order_notification_logs SET sent_at=now()-interval '11 minutes'`);
  const state = (await getPaymentLinkStates([order], database))[order.id];
  assert.equal(state.history[0].status, 'unknown');
  assert.equal(state.canSend, true);
});

test('authentication and operator role are required before provider access', async () => {
  assert.equal((await post('')).status, 401);
  assert.equal((await post('customer')).status, 403);
  assert.equal(providerChecks, 0);
  assert.equal(sends, 0);
});

test('missing, paid, cash and not-yet-assembled orders cannot be resent', async () => {
  assert.equal((await post('admin', 'missing')).status, 404);
  for (const patch of [{ status: 'ОПЛАЧЕН' }, { status: 'ПОЛУЧЕН' }, { status: 'ОФОРМЛЕН' },
    { status: 'СОБРАН', paymentMethod: 'cash_on_delivery' }]) {
    Object.assign(order, patch);
    assert.equal((await post()).status, 409);
  }
  assert.equal(providerChecks, 0);
  assert.equal(sends, 0);
});

test('successful resend reuses the existing payment and immediate second request gets Retry-After', async () => {
  const first = await post();
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.paymentLinkState.history[0].status, 'partial');
  assert.equal(body.order.paymentId, 'fixture-intent');
  assert.equal(sends, 1);
  assert.equal(providerChecks, 1);
  const second = await post();
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers.get('Retry-After')) > 0);
  assert.equal(sends, 1);
  assert.equal(providerChecks, 1);
});

test('concurrent HTTP requests send only once and return durable blocked state', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => post()));
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.equal(responses.filter(response => response.status === 429).length, 7);
  assert.equal(sends, 1);
});

test('provider-confirmed paid payment is not sent despite a stale unpaid order status', async () => {
  provider.paid = true; provider.status = 'succeeded';
  assert.equal((await post()).status, 502);
  assert.equal(sends, 0);
  assert.equal((await getPaymentLinkStates([order], database))[order.id].history[0].status, 'failed');
});

test('expired links and changed totals are rejected before any notification', async () => {
  provider.status = 'canceled';
  assert.equal((await post()).status, 502);
  assert.equal(sends, 0);
  await pool.query('TRUNCATE order_notification_logs');
  provider.status = 'pending'; provider.amount.value = '99.00';
  assert.equal((await post()).status, 502);
  assert.equal(sends, 0);
});

test('pending marker keeps per-channel entries from replacing the aggregate outcome', () => {
  const now = Date.now();
  const state = buildPaymentLinkState(order, [
    { id: 'marker', event: 'payment_link_attempt', channel: 'system', status: 'partial',
      details: JSON.stringify({ version: 1, summary: accepted }), sentAt: new Date(now - 1000) },
    { id: 'channel', event: 'payment_link', channel: 'email', status: 'sent',
      details: JSON.stringify({ paymentAttemptId: 'marker', detail: 'Accepted' }), sentAt: new Date(now) },
  ], now);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].status, 'partial');
});

test('legacy accepted logs retain ambiguity and enforce the minimum cooldown', () => {
  const state = buildPaymentLinkState(order, [{ id: 'old', event: 'payment_link', channel: 'email',
    status: 'sent', details: 'Old record', sentAt: new Date() }]);
  assert.equal(state.history[0].legacy, true);
  assert.equal(state.canSend, false);
});

test('recording an accepted resend never overwrites a paid order or changed amount', async () => {
  await pool.query('TRUNCATE orders');
  await pool.query(`INSERT INTO orders(id,status,payment_id,payment_method,amount)
    VALUES($1,'ОПЛАЧЕН',$2,'yookassa',100)`, [order.id, order.paymentId]);
  const patch = { status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', paymentId: order.paymentId, paymentLinkSentAt: new Date() };
  assert.equal(await recordAcceptedPaymentLink(order, patch, database), undefined);
  await pool.query(`UPDATE orders SET status='СОБРАН',amount=101`);
  assert.equal(await recordAcceptedPaymentLink(order, patch, database), undefined);
  await pool.query(`UPDATE orders SET amount=100`);
  assert.ok(await recordAcceptedPaymentLink(order, patch, database));
  assert.equal((await pool.query('SELECT status FROM orders')).rows[0].status, patch.status);
});
