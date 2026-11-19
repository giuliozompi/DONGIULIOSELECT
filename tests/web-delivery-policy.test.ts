import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteWebDelivery } from '../server/services/web-delivery-quote';
import { desiredDateError, moscowDeliveryDates } from '../shared/web-delivery';
import { fiscalOrderLines } from '../server/services/fiscal-order-lines';
import { createReceipt } from '../server/services/yookassa-payment';

test('rate Moscow from exact house and federal subject, not similar suggestions', async () => {
  const house = { fullAddress: 'г Москва, ул Покровка, д 27', building: '27', inMoscow: true };
  const read = async () => [house];
  assert.equal((await quoteWebDelivery('courier', '101000, г. москва, ул. Покровка, д. 27', read)).fee, '1000.00');
  assert.equal((await quoteWebDelivery('courier', 'Москва, улица Покровка, 27', read)).fee, '1000.00');
  assert.equal((await quoteWebDelivery('courier', house.fullAddress.replace('27', '21'), read)).method, 'web_unconfirmed');
  assert.equal((await quoteWebDelivery('courier', house.fullAddress, async () => [{ ...house, inMoscow: false }])).method, 'web_regional');
  assert.equal((await quoteWebDelivery('courier', house.fullAddress, async () => [house, { ...house, inMoscow: false }])).method, 'web_unconfirmed');
  assert.equal((await quoteWebDelivery('courier', house.fullAddress, async () => [{ ...house, building: null }])).method, 'web_unconfirmed');
  assert.equal((await quoteWebDelivery('pickup', house.fullAddress, async () => { throw new Error('unexpected lookup'); })).fee, '0.00');
});

test('date uses the Moscow day, including midnight and the 16:00 cutoff', () => {
  assert.deepEqual(moscowDeliveryDates(new Date('2026-12-31T21:01Z')), {
    today: '2027-01-01', nextDay: '2027-01-02', beforeCutoff: true,
  });
  assert.equal(desiredDateError('2027-01-01', 'web_moscow', new Date('2027-01-01T12:59Z')), null);
  assert.match(desiredDateError('2027-01-01', 'web_moscow', new Date('2027-01-01T13:00Z'))!, /16:00/);
  assert.equal(desiredDateError('2027-01-01', 'web_pickup', new Date('2027-01-01T13:00Z')), null);
});

test('fiscal receipt totals match discounted mixed quantities and delivery is a separate service once', () => {
  const products = [
    { productId: 'kg', productName: 'Сыр', quantity: 1.735, price: '1241.65', unit: 'кг' },
    { productId: 'm', productName: 'МАРК', quantity: 2, price: '53.13', unit: 'шт', requiresMarking: true },
    { productId: 'pcs', productName: 'Напиток', quantity: 3, price: '99.07', unit: 'шт' },
  ];
  const codes = new Map([['m', ['test-code-1', 'test-code-2']]]);
  const { items } = createReceipt(products, 'fixture@example.invalid', null, codes, 1, 1, { total: '3123.37', deliveryFee: '1000.00' });
  const sum = items.reduce((value, item) => value + Math.round(Number(item.amount.value) * 100 * Number(item.quantity)), 0);
  assert.equal(sum, 312337);
  assert.equal(items.filter(item => item.mark_code_info).length, 2);
  assert.deepEqual(items.filter(item => item.payment_subject === 'service'), [{
    description: 'Курьерская доставка', quantity: '1.000', amount: { value: '1000.00', currency: 'RUB' },
    vat_code: 1, payment_subject: 'service', payment_mode: 'full_payment',
  }]);
  const free = fiscalOrderLines(items.filter(item => item.payment_subject !== 'service'), '2123.37', '0.00');
  assert.equal(free.some(item => item.payment_subject === 'service'), false);
});
