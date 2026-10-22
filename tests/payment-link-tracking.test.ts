import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { build } from 'esbuild';

// Bundle the real orchestrator with fake dependencies. No configured database
// or notification/payment provider is reachable from these tests.
const source = `
export const fixture={order:null,blocked:false,dbFailed:false,finishFailed:false,claims:0,sends:0,finishes:[]};
export class PaymentAttemptBlocked extends Error {}
export class PaymentLinkPreparationError extends Error {}
export const storage={getOrderById:async()=>fixture.order};
export const reservePaymentLinkAttempt=async()=>{
 fixture.claims++;
 if(fixture.blocked)throw new PaymentAttemptBlocked('blocked');
 if(fixture.dbFailed)throw new Error('fixture persistence unavailable');
 return 'fixture-marker';
};
export const finishPaymentLinkAttempt=async(...args)=>{
 if(fixture.finishFailed)throw new Error('fixture persistence unavailable');
 fixture.finishes.push(args);
};
export const canNotify=async channel=>channel==='email';
export const logOrderNotification=async()=>{};
export const sendPaymentLinkEmail=async()=>{fixture.sends++;return true;};
export const sendPaymentLinkDetailed=async()=>{throw new Error('unexpected Telegram call');};
export const sendPaymentLinkWhatsApp=async()=>{throw new Error('unexpected WhatsApp call');};
`;
const bundled = await build({
  stdin: { contents: `export {sendOrderPaymentLink} from './server/services/payment-link-delivery'; export {fixture} from 'tracking-fixture';`,
    resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{
    name: 'isolated-payment-tracking',
    setup(build) {
      build.onResolve({ filter: /tracking-fixture|\/(?:storage|payment-link-attempts|notification-settings|notification-logger|telegram-bot|email|whatsapp)$/ },
        () => ({ path: 'fixture', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: source, loader: 'js' }));
    },
  }],
});
const { sendOrderPaymentLink, fixture } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

beforeEach(() => Object.assign(fixture, {
  order: { id: 'fixture-order', userId: 'fixture-user', status: 'СОБРАН', amount: '100.00',
    customerName: 'Fixture', customerPhone: 'test', customerEmail: 'fixture@example.invalid' },
  blocked: false, dbFailed: false, finishFailed: false, claims: 0, sends: 0, finishes: [],
}));

test('a blocked or unavailable reservation prevents payment preparation and every notification', async () => {
  for (const failure of ['blocked', 'dbFailed']) {
    fixture[failure] = true;
    let prepared = false;
    await assert.rejects(sendOrderPaymentLink(fixture.order, async () => { prepared = true; return 'https://example.invalid/payment'; }));
    assert.equal(prepared, false);
    assert.equal(fixture.sends, 0);
    fixture[failure] = false;
  }
});

test('paid or completed order is rejected before reserving an attempt', async () => {
  fixture.order.status = 'ОПЛАЧЕН';
  await assert.rejects(sendOrderPaymentLink(fixture.order, 'https://example.invalid/payment'));
  assert.equal(fixture.claims, 0);
  assert.equal(fixture.sends, 0);
});

test('preparation failure is persisted without exposing its raw exception', async () => {
  await assert.rejects(sendOrderPaymentLink(fixture.order, async () => {
    throw new Error('DO_NOT_EXPOSE');
  }), error => !String(error).includes('DO_NOT_EXPOSE'));
  assert.equal(fixture.sends, 0);
  assert.equal(fixture.finishes.length, 1);
  assert.equal(fixture.finishes[0][3], false);
});

test('accepted send records a complete summary exactly once', async () => {
  const result = await sendOrderPaymentLink(fixture.order, async () => 'https://example.invalid/payment');
  assert.equal(result.paymentLinkSent, true);
  assert.equal(fixture.sends, 1);
  assert.equal(fixture.finishes.length, 1);
  assert.equal(fixture.finishes[0][1].paymentLinkSent, true);
});

test('a failed outcome write never causes another send or reports confirmed success', async () => {
  fixture.finishFailed = true;
  await assert.rejects(sendOrderPaymentLink(fixture.order, 'https://example.invalid/payment'), /не подтверждён/);
  assert.equal(fixture.sends, 1);
});
