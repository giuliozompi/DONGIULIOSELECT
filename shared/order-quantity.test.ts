import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatOrderQuantity, getCartAddQuantity, getCartQuantityRules, isValidOrderQuantity, parseOrderQuantity } from './order-quantity';

test('all shop entry points share initial weights and subsequent increments', () => {
  for (const unit of ['кг', 'kg', ' KG ', ' КГ ']) {
    assert.deepEqual(getCartQuantityRules(unit), { initial: 0.2, step: 0.1 });
    assert.equal(getCartAddQuantity(unit), 0.2);
    assert.equal(getCartAddQuantity(unit, 0.735), 0.1);
  }
  for (const unit of ['шт', 'шт.', 'pcs', 'уп', 'г']) {
    assert.deepEqual(getCartQuantityRules(unit), { initial: 1, step: 1 });
    assert.equal(getCartAddQuantity(unit), 1);
    assert.equal(getCartAddQuantity(unit, 3), 1);
  }
});

test('accepts measured kilograms with comma or point without losing grams', () => {
  for (const text of ['0,735', '0.735', '1,234', '1.234', '0,001', '0.199', '2']) {
    assert.equal(parseOrderQuantity(text, 'кг'), Number(text.replace(',', '.')));
  }
});

test('rejects invalid, zero, negative or over-precision kilogram inputs', () => {
  for (const text of ['', '0', '-1', '0,000', '0,1234', '0.1234', 'NaN', 'Infinity', '1,2,3', '1kg', '1e2']) {
    assert.equal(parseOrderQuantity(text, 'кг'), null, text);
  }
});

test('API validation preserves gram precision and rejects sub-gram weights', () => {
  for (const quantity of [0.001, 0.199, 0.735, 1.234, 2]) {
    assert.equal(isValidOrderQuantity(quantity, 'кг'), true);
  }
  for (const quantity of [0, -1, 0.1234, NaN, Infinity]) {
    assert.equal(isValidOrderQuantity(quantity, 'кг'), false);
  }
});

test('displays kilograms with exactly three decimals and a comma', () => {
  assert.equal(formatOrderQuantity(0.735, 'кг'), '0,735');
  assert.equal(formatOrderQuantity(1.2, 'kg'), '1,200');
  assert.equal(formatOrderQuantity(2, 'кг'), '2,000');
  assert.equal(formatOrderQuantity(2, 'шт'), '2');
});

test('quantity survives JSON storage and recalculates the product amount', () => {
  const quantity = parseOrderQuantity('0,735', 'кг')!;
  const item = JSON.parse(JSON.stringify({ quantity, price: '2000.00' }));
  assert.equal(item.quantity, 0.735);
  assert.equal((Number(item.price) * item.quantity).toFixed(2), '1470.00');
});
