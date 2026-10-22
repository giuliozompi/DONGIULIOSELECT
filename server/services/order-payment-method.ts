import { eq } from 'drizzle-orm';
import { db } from '../db';
import { adminActionLogs, orderChangeLogs, orders, paymentIntents } from '../../shared/schema';

export type OrderPaymentMethod = 'yookassa' | 'cash_on_delivery';

export class OrderPaymentMethodError extends Error {
  constructor(message: string, public readonly status: 404 | 409 = 409) {
    super(message);
  }
}

const CLOSED_STATUSES = new Set(['ОПЛАЧЕН', 'ВЫЗВАН КУРЬЕР', 'ПОЛУЧЕН', 'ВОЗВРАТ', 'УДАЛЕНО', 'ЗАВЕРШЕН', 'ЗАВЕРШЁН']);

/**
 * One transaction makes the payment method, order history, and administrator
 * audit trail inseparable. Locking the order serializes competing operators.
 * A payment that exists (even one marked failed locally) must be resolved
 * separately; changing the method cannot cancel a YooKassa payment.
 */
export async function changeOrderPaymentMethod(
  orderId: string, nextMethod: OrderPaymentMethod, operatorId: string, database = db,
) {
  if (!operatorId) throw new OrderPaymentMethodError('Неизвестный оператор.');
  return database.transaction(async tx => {
    await tx.execute(`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(`SET LOCAL statement_timeout = '5s'`);
    const [order] = await tx.select({
      id: orders.id,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      paymentId: orders.paymentId,
      paymentLinkSentAt: orders.paymentLinkSentAt,
      receiptId: orders.receiptId,
      refundId: orders.refundId,
      refundStatus: orders.refundStatus,
    }).from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new OrderPaymentMethodError('Заказ не найден.', 404);
    if (order.paymentMethod === nextMethod) return { changed: false, previous: order.paymentMethod };

    if (CLOSED_STATUSES.has(order.status) || order.refundId || order.refundStatus || order.receiptId) {
      throw new OrderPaymentMethodError('Способ оплаты нельзя изменить у оплаченного, завершённого или отменённого заказа.');
    }
    const [payment] = await tx.select({ id: paymentIntents.id }).from(paymentIntents)
      .where(eq(paymentIntents.orderId, orderId)).limit(1);
    if (payment || order.paymentId || order.paymentLinkSentAt || order.status === 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ') {
      throw new OrderPaymentMethodError('Для заказа уже создана или отправлена оплата. Сначала разберитесь с действующей ссылкой в YooKassa.');
    }

    await tx.update(orders).set({ paymentMethod: nextMethod }).where(eq(orders.id, orderId));
    const changeData = { oldPaymentMethod: order.paymentMethod, newPaymentMethod: nextMethod };
    await tx.insert(orderChangeLogs).values({
      orderId, adminUserId: operatorId, changeType: 'payment_method_changed', changeData,
    });
    await tx.insert(adminActionLogs).values({
      adminUserId: operatorId, actionType: 'updated', entityType: 'order', entityId: orderId,
      actionData: {
        oldData: { paymentMethod: order.paymentMethod },
        newData: { paymentMethod: nextMethod },
        notes: 'payment_method_changed',
      },
    });
    return { changed: true, previous: order.paymentMethod };
  });
}
