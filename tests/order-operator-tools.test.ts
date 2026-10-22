import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import QRCode from 'qrcode';
import * as schema from '../shared/schema';
import { changeOrderPaymentMethod, OrderPaymentMethodError } from '../server/services/order-payment-method';
import { renderOrderPrintDocument } from '../server/services/order-print-document';

const exec = promisify(execFile);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let directory: string;
let pool: pg.Pool;
let database: ReturnType<typeof drizzle<typeof schema>>;
let started = false;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'order-operator-pg-'));
  await exec('initdb', ['-D', join(directory, 'data'), '-U', 'order_operator_test', '-A', 'trust', '--no-locale']);
  await exec('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'),
    '-o', `-F -k ${directory} -h ''`, '-w', 'start']);
  started = true;
  pool = new pg.Pool({ host: directory, port: 5432, database: 'postgres', user: 'order_operator_test', max: 12 });
  database = drizzle({ client: pool, schema });
  await pool.query(`CREATE TABLE orders (
    id varchar PRIMARY KEY, status text NOT NULL DEFAULT 'ОФОРМЛЕН',
    payment_method text NOT NULL DEFAULT 'yookassa', payment_id varchar,
    payment_link_sent_at timestamp, receipt_id varchar, refund_id varchar, refund_status text
  )`);
  await pool.query(`CREATE TABLE payment_intents (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), order_id varchar NOT NULL REFERENCES orders(id),
    status text NOT NULL DEFAULT 'pending'
  )`);
  await pool.query(`CREATE TABLE order_change_logs (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), order_id varchar NOT NULL REFERENCES orders(id),
    admin_user_id varchar, change_type text NOT NULL, change_data jsonb NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE admin_action_logs (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id varchar NOT NULL,
    telegram_username text, action_type text NOT NULL, entity_type text NOT NULL, entity_id varchar,
    action_data jsonb NOT NULL DEFAULT '{}', created_at timestamp NOT NULL DEFAULT now()
  )`);
}, { timeout: 30000 });

after(async () => {
  await pool?.end();
  if (started) await exec('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  if (directory) await rm(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await pool.query('TRUNCATE admin_action_logs, order_change_logs, payment_intents, orders CASCADE');
  await pool.query('INSERT INTO orders(id) VALUES($1),($2)', [A, B]);
});

async function state(id = A) {
  const [order, changeLogs, actionLogs] = await Promise.all([
    pool.query('SELECT payment_method FROM orders WHERE id=$1', [id]),
    pool.query('SELECT admin_user_id,change_type,change_data FROM order_change_logs WHERE order_id=$1', [id]),
    pool.query('SELECT admin_user_id,action_type,entity_type,entity_id,action_data FROM admin_action_logs WHERE entity_id=$1', [id]),
  ]);
  return { method: order.rows[0]?.payment_method, changeLogs: changeLogs.rows, actionLogs: actionLogs.rows };
}

test('payment change and BOTH operator histories persist with previous/new methods and actor', async () => {
  const result = await changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-1', database);
  assert.deepEqual(result, { changed: true, previous: 'yookassa' });
  const saved = await state();
  assert.equal(saved.method, 'cash_on_delivery');
  assert.equal(saved.changeLogs.length, 1);
  assert.equal(saved.actionLogs.length, 1);
  assert.deepEqual(saved.changeLogs[0], {
    admin_user_id: 'operator-1', change_type: 'payment_method_changed',
    change_data: { oldPaymentMethod: 'yookassa', newPaymentMethod: 'cash_on_delivery' },
  });
  assert.equal(saved.actionLogs[0].admin_user_id, 'operator-1');
  assert.equal(saved.actionLogs[0].entity_type, 'order');
  assert.equal(saved.actionLogs[0].action_data.oldData.paymentMethod, 'yookassa');
  assert.equal(saved.actionLogs[0].action_data.newData.paymentMethod, 'cash_on_delivery');
  assert.equal((await state(B)).method, 'yookassa');
});

test('switching cash to online saves audit but creates no payment or outbound link', async () => {
  await pool.query('UPDATE orders SET payment_method=$1 WHERE id=$2', ['cash_on_delivery', A]);
  assert.equal((await changeOrderPaymentMethod(A, 'yookassa', 'operator-2', database)).changed, true);
  assert.equal((await state()).changeLogs[0].change_data.oldPaymentMethod, 'cash_on_delivery');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_intents')).rows[0].n, 0);
});

test('no change is not falsely recorded as an operator modification', async () => {
  assert.deepEqual(await changeOrderPaymentMethod(A, 'yookassa', 'operator-1', database),
    { changed: false, previous: 'yookassa' });
  assert.equal((await state()).changeLogs.length, 0);
  assert.equal((await state()).actionLogs.length, 0);
});

test('unknown order and missing operator fail before any modification', async () => {
  await assert.rejects(changeOrderPaymentMethod('not-an-order', 'cash_on_delivery', 'operator-1', database),
    (error: unknown) => error instanceof OrderPaymentMethodError && error.status === 404);
  await assert.rejects(changeOrderPaymentMethod(A, 'cash_on_delivery', '', database), OrderPaymentMethodError);
  assert.equal((await state()).changeLogs.length, 0);
});

test('paid, completed, cancelled, refunded and linked-to-payment orders reject unsafe changes', async () => {
  for (const status of ['ОПЛАЧЕН', 'ВЫЗВАН КУРЬЕР', 'ПОЛУЧЕН', 'ВОЗВРАТ', 'УДАЛЕНО', 'ЗАВЕРШЕН', 'ЗАВЕРШЁН']) {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, A]);
    await assert.rejects(changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-1', database),
      (error: unknown) => error instanceof OrderPaymentMethodError && error.status === 409);
  }
  await pool.query('UPDATE orders SET status=$1 WHERE id=$2', ['ОФОРМЛЕН', A]);
  for (const [column, value] of [
    ['refund_status', 'succeeded'], ['refund_id', 'rf-1'], ['receipt_id', 'receipt-1'],
    ['payment_id', 'preparing'], ['payment_link_sent_at', new Date()],
  ] as const) {
    await pool.query(`UPDATE orders SET ${column}=$1 WHERE id=$2`, [value, A]);
    await assert.rejects(changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-1', database), OrderPaymentMethodError);
    await pool.query(`UPDATE orders SET ${column}=NULL WHERE id=$1`, [A]);
  }
  await pool.query('UPDATE orders SET status=$1 WHERE id=$2', ['ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', A]);
  await assert.rejects(changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-1', database), OrderPaymentMethodError);
  assert.deepEqual((await state()).changeLogs, []);
});

test('even a locally failed intent blocks changes until the provider situation is resolved', async () => {
  await pool.query("INSERT INTO payment_intents(order_id,status) VALUES($1,'failed')", [A]);
  await assert.rejects(changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-1', database), OrderPaymentMethodError);
  assert.equal((await state()).method, 'yookassa');
});

test('a failed audit write rolls back the order update and the other log', async () => {
  await pool.query(`CREATE FUNCTION reject_admin_audit() RETURNS trigger LANGUAGE plpgsql AS
    $$BEGIN RAISE EXCEPTION 'fixture audit unavailable'; END$$`);
  await pool.query('CREATE TRIGGER reject_operator_audit BEFORE INSERT ON admin_action_logs FOR EACH ROW EXECUTE FUNCTION reject_admin_audit()');
  try {
    await assert.rejects(changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-1', database), /fixture audit unavailable/);
    const saved = await state();
    assert.equal(saved.method, 'yookassa');
    assert.equal(saved.changeLogs.length, 0);
    assert.equal(saved.actionLogs.length, 0);
  } finally {
    await pool.query('DROP TRIGGER reject_operator_audit ON admin_action_logs');
    await pool.query('DROP FUNCTION reject_admin_audit()');
  }
});

test('competing operators serialize on the order instead of writing duplicate history', async () => {
  const outcomes = await Promise.all([
    changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-1', database),
    changeOrderPaymentMethod(A, 'cash_on_delivery', 'operator-2', database),
  ]);
  assert.deepEqual(outcomes.map(outcome => outcome.changed).sort(), [false, true]);
  const saved = await state();
  assert.equal(saved.method, 'cash_on_delivery');
  assert.equal(saved.changeLogs.length, 1);
  assert.equal(saved.actionLogs.length, 1);
});

const sample = {
  id: A, customerName: 'Иван <script>alert(1)</script>', deliveryAddress: '<img src=x onerror=alert(1)>',
  deliveryMethod: 'cdek', deliveryNotes: '<svg onload=alert(1)>',
  status: 'СОБРАН', items: [
    { productId: 'p-1', productName: 'Сыр &amp; <b>синий</b>', quantity: 0.735, unit: 'кг', price: '1200.00' },
    { productId: 'p-2', productName: 'Макароны', quantity: 2, unit: 'шт', price: '200.00' },
  ],
} as schema.Order;

test('A4 packing list uses actual three-decimal weights and QR for the full searchable order ID', async () => {
  const html = await renderOrderPrintDocument(sample, 'packing-list');
  const svg = await QRCode.toString(A, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 256 });
  assert.ok(html.includes('@page { size: A4;'));
  assert.ok(html.includes(svg));
  assert.ok(html.includes(`class="full-id">${A}</div>`));
  assert.ok(html.includes('0,735 кг'));
  assert.ok(html.includes('Макароны'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;svg onload=alert(1)&gt;'));
});

test('thermal box label shows the recipient, full UUID under QR, and a 100 x 150 mm print area', async () => {
  const html = await renderOrderPrintDocument(sample, 'label');
  assert.ok(html.includes('@page { size: 100mm 150mm;'));
  assert.ok(html.includes('Иван &lt;script&gt;'));
  assert.ok(html.includes('class="full-id">' + A + '</div>'));
  assert.ok(html.includes('№ 111111'));
  assert.ok(html.includes('<svg'));
  assert.ok(!html.includes('Макароны'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('не накладная перевозчика'));
});

test('packing list pairs requested quantities with empty handwritten actual quantities for each product', async () => {
  const html = await renderOrderPrintDocument(sample, 'packing-list');
  assert.match(html, /Заказано клиентом/);
  assert.match(html, /Собрано оператором/);
  assert.match(html, /0,735 кг/);
  assert.match(html, /2 шт/);
  const cells = [...html.matchAll(/<td\b[^>]*data-field="assembled-quantity"[^>]*>([\s\S]*?)<\/td>/g)];
  assert.equal(cells.length, sample.items.length);
  for (const [, content] of cells) {
    assert.doesNotMatch(content, /\d/); // No requested amount copied into the handwritten field.
    assert.doesNotMatch(content, /<input|value=/);
  }
  assert.match(cells[0][1], /кг/);
  assert.match(cells[1][1], /шт/);
  assert.ok(!html.includes('Цена за единицу'));
  const summary = await renderOrderPrintDocument({ ...sample, amount: '1282.00' }, 'order-summary');
  const label = await renderOrderPrintDocument(sample, 'label');
  assert.ok(!summary.includes('data-field="assembled-quantity"'));
  assert.ok(!label.includes('data-field="assembled-quantity"'));
});

test('empty packing lists retain their headers without inventing handwritten product rows', async () => {
  const html = await renderOrderPrintDocument({ ...sample, items: [] }, 'packing-list');
  assert.match(html, /Заказано клиентом/);
  assert.match(html, /Собрано оператором/);
  assert.match(html, /colspan="4">Нет товаров/);
  assert.ok(!html.includes('data-field="assembled-quantity"'));
});

test('a voided order has no shipping label; invalid quantities never print silently', async () => {
  await assert.rejects(renderOrderPrintDocument({ ...sample, status: 'УДАЛЕНО' }, 'label'));
  await assert.rejects(renderOrderPrintDocument({ ...sample, items: [{ ...sample.items[0], quantity: NaN }] }, 'packing-list'));
});

test('complete A4 order prints saved unit prices, weighed line totals, all discounts and authoritative total', async () => {
  const html = await renderOrderPrintDocument({
    ...sample, amount: '1150.00', discount: '50.00', paymentMethod: 'cash_on_delivery',
    customerPhone: '+7 fixture <phone>', customerEmail: '<script>@example.invalid',
    createdAt: new Date('2026-10-22T10:00:00Z'), customerPaysShipping: true, deliveryCost: '250.00',
  }, 'order-summary');
  const plain = html.replace(/\s/g, ' ');
  assert.match(html, /@page { size: A4/);
  assert.match(html, /Заказ с ценами/);
  assert.match(html, /Цена за единицу/);
  assert.match(html, /0,735 кг/);
  assert.match(plain, /1 200,00 ₽ \/ кг/);
  assert.match(plain, /882,00 ₽/);
  assert.match(plain, /400,00 ₽/);
  assert.match(plain, /1 282,00 ₽/);
  assert.match(plain, /−132,00 ₽/); // Includes all discounts, not just the admin's 50 ₽.
  assert.match(plain, /Итого по заказу<\/span><strong>1 150,00 ₽/);
  assert.match(plain, /Доставка \(оплачивается отдельно\)<\/span><strong>250,00 ₽/);
  assert.match(plain, /Общая стоимость с доставкой<\/span><strong>1 400,00 ₽/);
  assert.match(html, /Наличными при получении/);
  assert.match(html, /13:00:00 \(МСК\)/);
  assert.match(html, /&lt;phone&gt;/);
  assert.match(html, /&lt;script&gt;@example.invalid/);
  assert.match(html, /Не является кассовым чеком/);
  assert.match(html, new RegExp(`class="full-id">${A}`));
  assert.ok(!html.includes('<script>@'));
});

test('complete order does not add merchant-paid shipping and retains zero-priced items', async () => {
  const html = await renderOrderPrintDocument({
    ...sample, amount: '0.00', paymentMethod: 'yookassa', customerPaysShipping: false,
    deliveryCost: '500.00', items: [{ ...sample.items[0], price: '0.00' }],
  }, 'order-summary');
  assert.match(html, /Итого по заказу<\/span><strong>0,00 ₽/);
  assert.ok(!html.includes('500,00'));
  assert.ok(!html.includes('Общая стоимость с доставкой'));
});

test('unknown shipping and an upward adjustment never manufacture a discount or delivery price', async () => {
  const html = await renderOrderPrintDocument({
    ...sample, amount: '1300.00', customerPaysShipping: true, deliveryCost: null,
  }, 'order-summary');
  assert.match(html, /Корректировка суммы заказа<\/span><strong>\+18,00 ₽/);
  assert.match(html, /Стоимость доставки ещё не определена/);
  assert.ok(!html.includes('Скидки, бонусы'));
});

test('invalid financial data fails explicitly instead of printing NaN or a guessed total', async () => {
  for (const amount of ['invalid', '-1.00', 'Infinity', '12.345']) {
    await assert.rejects(renderOrderPrintDocument({ ...sample, amount }, 'order-summary'));
  }
  await assert.rejects(renderOrderPrintDocument({
    ...sample, amount: '100.00', items: [{ ...sample.items[0], price: 'bad-price' }],
  }, 'order-summary'));
  const packing = await renderOrderPrintDocument({ ...sample, amount: '1150.00' }, 'packing-list');
  assert.ok(!packing.includes('Цена за единицу'));
});
