import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliverPaymentLink } from './payment-link-delivery';
import { paymentLinkOrderUpdate, type PaymentChannel, type PaymentChannelResult } from '../../shared/payment-link-delivery';

const order = { id: 'test-order', userId: 'test-user', amount: '100.00',
  customerName: 'Test', customerPhone: 'test-phone', customerEmail: 'test@example.invalid' };
const url = 'https://example.invalid/payment';

function dependencies(options: {
  disabled?: PaymentChannel[];
  success?: PaymentChannel[];
  throws?: PaymentChannel[];
  logFails?: boolean;
} = {}) {
  const logs: PaymentChannelResult[] = [];
  const sends: PaymentChannel[] = [];
  return {
    logs, sends,
    canNotify: async (channel: PaymentChannel) => !options.disabled?.includes(channel),
    send: async (channel: PaymentChannel) => {
      sends.push(channel);
      if (options.throws?.includes(channel)) throw new Error('sensitive network exception');
      return { sent: !!options.success?.includes(channel),
        error: channel === 'telegram' ? 'Telegram: Bad Request: chat not found' : 'Provider rejected message' };
    },
    log: async (result: PaymentChannelResult) => {
      if (options.logFails) throw new Error('logging unavailable');
      logs.push(result);
    },
  };
}

test('all failed sends never mark the link as sent or set a sent timestamp', async () => {
  const deps = dependencies();
  const summary = await deliverPaymentLink(order, url, deps);
  assert.equal(summary.paymentLinkSent, false);
  assert.ok(summary.warning);
  assert.ok(deps.logs.every(log => log.status === 'failed'));
  assert.equal(deps.logs[0].detail, 'Telegram: Bad Request: chat not found');
  assert.deepEqual(paymentLinkOrderUpdate(summary, 'intent-id'), {
    status: 'СОБРАН', paymentId: 'intent-id', paymentLinkSentAt: null,
  });
});

test('email false is recorded as failed, not sent', async () => {
  const deps = dependencies({ disabled: ['telegram', 'whatsapp'] });
  const summary = await deliverPaymentLink(order, url, deps);
  assert.deepEqual(deps.sends, ['email']);
  assert.equal(deps.logs[0].status, 'failed');
  assert.equal(summary.paymentLinkSent, false);
});

test('one accepted channel permits sent status, while partial failures remain visible', async () => {
  const deps = dependencies({ success: ['email'], disabled: ['whatsapp'] });
  const summary = await deliverPaymentLink(order, url, deps);
  assert.equal(summary.paymentLinkSent, true);
  assert.ok(summary.warning);
  assert.deepEqual(summary.channels.map(result => result.status), ['failed', 'sent', 'skipped']);
  const now = new Date('2026-01-01T00:00:00Z');
  assert.deepEqual(paymentLinkOrderUpdate(summary, 'intent-id', now), {
    status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ', paymentId: 'intent-id', paymentLinkSentAt: now,
  });
  assert.match(summary.channels[1].detail, /Доставка клиенту не подтверждена/);
});

test('all disabled channels do not send, log false successes, or advance the order', async () => {
  const deps = dependencies({ disabled: ['telegram', 'email', 'whatsapp'] });
  const summary = await deliverPaymentLink(order, url, deps);
  assert.equal(summary.paymentLinkSent, false);
  assert.equal(deps.sends.length, 0);
  assert.equal(deps.logs.length, 0);
  assert.ok(summary.channels.every(result => result.status === 'skipped'));
});

test('missing email is an explicit skip', async () => {
  const deps = dependencies({ disabled: ['telegram', 'whatsapp'] });
  const summary = await deliverPaymentLink({ ...order, customerEmail: null }, url, deps);
  assert.equal(deps.sends.length, 0);
  assert.equal(summary.channels[1].detail, 'Email клиента не указан.');
  assert.equal(summary.paymentLinkSent, false);
});

test('network exceptions do not stop fallback channels or expose sensitive exceptions', async () => {
  const deps = dependencies({ throws: ['telegram'], success: ['email'], disabled: ['whatsapp'] });
  const summary = await deliverPaymentLink(order, url, deps);
  assert.equal(summary.paymentLinkSent, true);
  assert.equal(summary.channels[0].status, 'failed');
  assert.ok(!JSON.stringify(summary).includes('sensitive'));
  assert.deepEqual(deps.sends, ['telegram', 'email']);
});

test('all successful channels require no warning', async () => {
  const deps = dependencies({ success: ['telegram', 'email', 'whatsapp'] });
  const summary = await deliverPaymentLink(order, url, deps);
  assert.equal(summary.paymentLinkSent, true);
  assert.equal(summary.warning, undefined);
});

test('notification logging failure cannot turn provider acceptance into a failed send', async () => {
  const deps = dependencies({ success: ['email'], disabled: ['telegram', 'whatsapp'], logFails: true });
  const summary = await deliverPaymentLink(order, url, deps);
  assert.equal(summary.paymentLinkSent, true);
});

test('missing or invalid payment URLs do not send messages', async () => {
  for (const value of ['', 'javascript:alert(1)', '/payment']) {
    const deps = dependencies();
    await assert.rejects(deliverPaymentLink(order, value, deps), /корректную ссылку/);
    assert.equal(deps.sends.length, 0);
  }
});
