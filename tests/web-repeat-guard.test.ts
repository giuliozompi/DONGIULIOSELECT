import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const saved = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => saved.set(key, value),
  removeItem: (key: string) => saved.delete(key),
} });
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: globalThis.localStorage } });
const { useWebCart } = await import('../client/src/web/hooks/useWebCart');
const product = { productId: 'cheese', productName: 'Сыр', price: '1200', unit: 'кг', quantity: 0.735 };
const source = { owner: 'customer-a', orderId: 'order-a' };
const cart = () => useWebCart.getState();
beforeEach(() => { cart().clearCart(); });

test('first repeat adds and records the customer/order, while a duplicate changes NOTHING', () => {
  assert.equal(cart().addReorderItems([product], source).addedCount, 1);
  const previous = JSON.parse(JSON.stringify(cart()));
  const refused = cart().addReorderItems([{ ...product, price: '1500' }], source);
  assert.equal(refused.confirmationRequired, true);
  assert.equal(refused.addedCount, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(cart())), previous);
});

test('explicit confirmation sums exact weights and uses the latest price', () => {
  cart().addReorderItems([product], source);
  assert.equal(cart().addReorderItems([{ ...product, price: '1500' }], { ...source, confirmed: true }).addedCount, 1);
  assert.equal(cart().items[0].quantity, 1.47);
  assert.equal(cart().items[0].price, '1500');
  assert.deepEqual(cart().repeatedOrders[source.owner], [source.orderId]);
  assert.equal(cart().addReorderItems([product], source).confirmationRequired, true);
});

test('another order or customer does not inherit this order confirmation requirement', () => {
  cart().addReorderItems([product], source);
  assert.equal(cart().addReorderItems([product], { ...source, orderId: 'order-b' }).addedCount, 1);
  assert.equal(cart().addReorderItems([product], { ...source, owner: 'customer-b' }).addedCount, 1);
  assert.equal(cart().addReorderItems([product], source).confirmationRequired, true);
});

test('empty or wholly conflicting repeats never mark an order as successfully repeated', () => {
  cart().addReorderItems([], source);
  assert.deepEqual(cart().repeatedOrders, {});
  cart().addItem({ productId: 'cheese', productName: 'Сыр', price: '1200', unit: 'шт' }, 1);
  assert.equal(cart().addReorderItems([product], source).addedCount, 0);
  assert.deepEqual(cart().repeatedOrders, {});
});

for (const empty of ['clear', 'remove', 'zero'] as const) {
  test(`${empty}: emptying the cart starts a new repetition cycle`, () => {
    cart().addReorderItems([product], source);
    if (empty === 'clear') cart().clearCart();
    else if (empty === 'remove') cart().removeItem(product.productId);
    else cart().updateQuantity(product.productId, 0);
    assert.deepEqual(cart().repeatedOrders, {});
    assert.equal(cart().addReorderItems([product], source).addedCount, 1);
  });
}

test('confirmation requirement survives persisted-cart rehydration', async () => {
  cart().addReorderItems([product], source);
  const snapshot = saved.get('dgs-web-cart')!;
  cart().clearCart();
  saved.set('dgs-web-cart', snapshot);
  await useWebCart.persist.rehydrate();
  assert.equal(cart().items[0].quantity, 0.735);
  assert.equal(cart().addReorderItems([product], source).confirmationRequired, true);
});
