import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { orderChangeLogs, orderNotificationLogs, orders, paymentIntents, type Order } from '../../shared/schema';
import { moneyCents, CheckoutError } from '../../shared/checkout';
import { isWebsiteDelivery } from '../../shared/web-delivery';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Pricing = Partial<Pick<Order, 'amount' | 'items' | 'discount' | 'discountType' | 'discountValue'>>;

export function withDeliveryFee(goods: string, fee: string | null | undefined) {
  const total = ((moneyCents(goods) + moneyCents(fee ?? '0')) / 100).toFixed(2);
  moneyCents(total);
  return total;
}

export function lockOrderPayment(tx: Transaction, orderId: string) {
  return tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-link:${orderId}`}, 0))`);
}

async function loadEditableOrder(tx: Transaction, orderId: string) {
  await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
  await lockOrderPayment(tx, orderId);
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
  if (!order) throw new CheckoutError('Заказ не найден.', 404);
  return order;
}

async function assertNotPayable(tx: Transaction, order: Order) {
  const [payment] = await tx.select({ id: paymentIntents.id }).from(paymentIntents)
    .where(eq(paymentIntents.orderId, order.id)).limit(1);
  const [attempt] = await tx.select({ id: orderNotificationLogs.id }).from(orderNotificationLogs).where(and(
    eq(orderNotificationLogs.orderId, order.id), eq(orderNotificationLogs.event, 'payment_link_attempt'),
    inArray(orderNotificationLogs.status, ['pending', 'unknown']),
  )).limit(1);
  if (!['ОФОРМЛЕН', 'СОБРАН'].includes(order.status) ||
      order.paymentId || order.paymentLinkSentAt || order.refundStatus || order.refundId || order.receiptId || payment || attempt) {
    throw new CheckoutError('Сумму нельзя изменить: платёж уже создаётся, создан или заказ завершён.', 409);
  }
}

export async function changeDeliveryFee(orderId: string, amount: string, operatorId: string, database = db) {
  const fee = (moneyCents(amount.replace(',', '.')) / 100).toFixed(2);
  return database.transaction(async tx => {
    const order = await loadEditableOrder(tx, orderId);
    if ((!order.userId.startsWith('web:') && !isWebsiteDelivery(order.deliveryMethod)) ||
      ['pickup', 'web_pickup'].includes(order.deliveryMethod ?? '') || order.paymentMethod !== 'yookassa') {
      throw new CheckoutError('Стоимость доставки можно добавить только для курьерского заказа с онлайн-оплатой.', 409);
    }
    await assertNotPayable(tx, order);
    if (fee === order.deliveryFeeInOrder) return order;
    const goods = ((moneyCents(order.amount) - moneyCents(order.deliveryFeeInOrder ?? '0')) / 100).toFixed(2);
    const total = withDeliveryFee(goods, fee);
    const [updated] = await tx.update(orders).set({
      deliveryFeeInOrder: fee, amount: total, customerPaysShipping: false,
    }).where(eq(orders.id, orderId)).returning();
    await tx.insert(orderChangeLogs).values({
      orderId, adminUserId: operatorId, changeType: 'delivery_fee_changed',
      changeData: { oldFee: order.deliveryFeeInOrder, newFee: fee, oldAmount: order.amount, newAmount: total },
    });
    return updated;
  });
}

// Pricing mutations receive a goods-only recalculation. The persisted current
// fee (not the editor's snapshot) is applied exactly once under the payment lock.
export async function saveOrderPricing(previous: Order, updates: Pricing, database = db) {
  return database.transaction(async tx => {
    const current = await loadEditableOrder(tx, previous.id);
    if (isWebsiteDelivery(current.deliveryMethod) || current.deliveryFeeInOrder != null) {
      await assertNotPayable(tx, current);
      if (JSON.stringify(previous.items) !== JSON.stringify(current.items) ||
          previous.discountType !== current.discountType || previous.discountValue !== current.discountValue) {
        throw new CheckoutError('Заказ уже изменён. Обновите страницу и повторите действие.', 409);
      }
      if (updates.amount != null) updates = { ...updates, amount: withDeliveryFee(updates.amount, current.deliveryFeeInOrder) };
    }
    return (await tx.update(orders).set(updates).where(eq(orders.id, previous.id)).returning())[0];
  });
}
