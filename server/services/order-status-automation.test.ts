import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { summarizePaymentDelivery } from '../../shared/payment-link-delivery';

// Bundle with fake storage/providers: these tests cannot access a database or send a payment.
const fixtureModule = `
export const fixture = { order: null, intent: null, summary: null, updates: [], sendCalls: 0, createCalls: 0 };
export const storage = {
  getOrderById: async () => fixture.order,
  updateOrder: async (_, update) => {
    fixture.updates.push(update); fixture.order = { ...fixture.order, ...update }; return fixture.order;
  },
  getPaymentIntentByOrderId: async () => fixture.intent,
  getAllProducts: async () => [],
  getMarkingLogsByOrder: async () => [],
};
export const canNotify = async () => false;
export const logOrderNotification = async () => {};
export const sendOrderPaymentLink = async (_, prepare) => { if (typeof prepare === 'function') await prepare(); fixture.sendCalls++; return fixture.summary; };
export const createYooKassaPayment = async () => { fixture.createCalls++; throw new Error('fake provider unavailable'); };
export const formatYooKassaAmount = value => value.toFixed(2);
export const createReceipt = () => ({ items: [] });
export const sendOrderPaidNotificationToManagers = async () => {};
export const sendOrderStatusNotification = async () => false;
export const sendOrderStatusUpdateWhatsApp = async () => false;
`;
const bundle = await build({
  stdin: {
    contents: `export { processOrderStatusChange } from './server/services/order-status-automation'; export { fixture } from 'test-fixture';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{
    name: 'fake-payment-dependencies',
    setup(build) {
      build.onResolve({ filter: /^(test-fixture|\.\.\/storage|\.\/(notification-settings|notification-logger|payment-link-delivery|yookassa-payment|email|telegram-bot|whatsapp))$/ },
        () => ({ path: 'fixture', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: fixtureModule, loader: 'js' }));
    },
  }],
});
const { fixture, processOrderStatusChange } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function reset(sent = false) {
  Object.assign(fixture, {
    order: { id: 'test-order', status: 'ОФОРМЛЕН', userId: 'test-user', paymentMethod: 'yookassa',
      amount: '100.00', items: [], customerName: 'Test', customerPhone: 'test-phone' },
    intent: { id: 'existing-intent', status: 'pending', redirectUrl: 'https://example.invalid/payment' },
    summary: summarizePaymentDelivery([{ channel: 'email', status: sent ? 'sent' : 'failed', detail: 'test outcome' }]),
    updates: [], sendCalls: 0, createCalls: 0,
  });
}

test('automatic assembly with no accepted messages remains assembled and reuses the existing payment', async () => {
  reset();
  const result = await processOrderStatusChange('test-order', 'СОБРАН');
  assert.equal(result.order.status, 'СОБРАН');
  assert.equal(result.paymentLinkSent, false);
  assert.ok(result.warning);
  assert.equal(result.order.paymentLinkSentAt, null);
  assert.equal(fixture.sendCalls, 1);
  assert.equal(fixture.createCalls, 0);
});

test('explicit sent-status selection cannot bypass actual notification results', async () => {
  reset();
  const result = await processOrderStatusChange('test-order', 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ');
  assert.equal(result.order.status, 'СОБРАН');
  assert.equal(result.paymentLinkSent, false);
  assert.ok(fixture.updates.every((update: any) => update.status !== 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ'));
});

test('accepted messages advance the order and expose the per-channel outcomes', async () => {
  reset(true);
  const result = await processOrderStatusChange('test-order', 'СОБРАН');
  assert.equal(result.order.status, 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ');
  assert.ok(result.order.paymentLinkSentAt instanceof Date);
  assert.equal(result.paymentDelivery.channels[0].status, 'sent');
  assert.equal(result.paymentLinkSent, true);
});

test('payment creation failure returns a visible warning and never claims sending', async context => {
  context.mock.method(console, 'error', () => {});
  reset();
  fixture.intent = null;
  const result = await processOrderStatusChange('test-order', 'СОБРАН');
  assert.equal(result.paymentLinkSent, false);
  assert.equal(result.order.status, 'СОБРАН');
  assert.ok(result.warning);
  assert.ok(result.error);
  assert.equal(fixture.sendCalls, 0);
});

test('paid orders cannot generate another payment through a backward status change', async () => {
  reset();
  fixture.order.status = 'ОПЛАЧЕН';
  await assert.rejects(processOrderStatusChange('test-order', 'СОБРАН'), /оплаченного/);
  assert.equal(fixture.updates.length, 0);
  assert.equal(fixture.sendCalls, 0);
  assert.equal(fixture.createCalls, 0);
});
