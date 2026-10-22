import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { orderNotificationLogs, orders } from '../../shared/schema';
import { buildPaymentLinkState, type PaymentAttemptDetails, type PaymentAttemptEvent, type PaymentLinkOrder, type PaymentLinkState } from '../../shared/payment-link-attempts';
import type { PaymentDeliverySummary, paymentLinkOrderUpdate } from '../../shared/payment-link-delivery';

type Executor = Pick<typeof db, 'execute'>;
type EventRow = PaymentAttemptEvent & { orderId: string };

export class PaymentAttemptBlocked extends Error {
  constructor(public state: PaymentLinkState) { super(state.reason || 'Повторная отправка пока недоступна.'); }
}
export class PaymentLinkPreparationError extends Error {}

export async function recordAcceptedPaymentLink(
  order: PaymentLinkOrder & { amount: string }, patch: ReturnType<typeof paymentLinkOrderUpdate>, database = db,
) {
  if (!order.paymentId) return;
  // A payment webhook or weight edit may win while notifications are in flight.
  // Never overwrite paid/closed orders or publish a stale total as current.
  return (await database.update(orders).set(patch).where(and(
    eq(orders.id, order.id), eq(orders.paymentId, order.paymentId),
    eq(orders.amount, order.amount), eq(orders.paymentMethod, 'yookassa'),
    inArray(orders.status, ['СОБРАН', 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ']),
  )).returning({ id: orders.id }))[0];
}

async function eventsFor(executor: Executor, ids: string[]): Promise<EventRow[]> {
  if (!ids.length) return [];
  // Bound history separately for EACH order; a busy order cannot hide another's history.
  const result = await executor.execute(sql`
    SELECT id, event, channel, status, details, sent_at AS "sentAt", order_id AS "orderId"
    FROM (
      SELECT *, row_number() OVER (PARTITION BY order_id ORDER BY sent_at DESC, id DESC) AS position
      FROM order_notification_logs
      WHERE order_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
        AND event IN ('payment_link', 'payment_link_attempt')
    ) recent WHERE position <= 25
    ORDER BY sent_at DESC, id DESC
  `);
  return result.rows as unknown as EventRow[];
}

export async function getPaymentLinkStates(orders: PaymentLinkOrder[], database = db): Promise<Record<string, PaymentLinkState>> {
  const events = await eventsFor(database, orders.map(order => order.id));
  const now = Date.now();
  return Object.fromEntries(orders.map(order => [
    order.id, buildPaymentLinkState(order, events.filter(event => event.orderId === order.id), now),
  ]));
}

export async function reservePaymentLinkAttempt(order: PaymentLinkOrder, database = db): Promise<string> {
  return database.transaction(async tx => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-link:${order.id}`}, 0))`);
    const events = await eventsFor(tx, [order.id]);
    // This guard is shared with initial generation/conversion flows. Each
    // caller checks eligibility; here only the durable sending limits apply.
    const state = buildPaymentLinkState({
      ...order, paymentMethod: 'yookassa', status: 'СОБРАН', paymentId: 'preparing',
    }, events);
    if (!state.canSend) throw new PaymentAttemptBlocked(state);
    const id = randomUUID();
    await tx.insert(orderNotificationLogs).values({
      id, event: 'payment_link_attempt', channel: 'system', recipient: 'customer',
      orderId: order.id, status: 'pending', details: JSON.stringify({ version: 1 }),
    });
    return id;
  });
}

export async function finishPaymentLinkAttempt(id: string, summary?: PaymentDeliverySummary, error?: string, uncertain = false, database = db) {
  const status = summary
    ? summary.paymentLinkSent
      ? summary.channels.some(channel => channel.status === 'failed') ? 'partial' : 'sent'
      : 'failed'
    : uncertain ? 'unknown' : 'failed';
  const details: PaymentAttemptDetails = { version: 1, summary, error };
  await database.update(orderNotificationLogs).set({ status, details: JSON.stringify(details) })
    .where(and(eq(orderNotificationLogs.id, id), eq(orderNotificationLogs.event, 'payment_link_attempt')));
}
