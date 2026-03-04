import { db } from '../db';
import { orderNotificationLogs } from '@shared/schema';

export type OrderNotificationEvent = 'order_created' | 'order_paid' | 'status_change' | 'payment_link';
export type NotificationChannel = 'telegram' | 'email' | 'whatsapp';
export type NotificationRecipient = 'customer' | 'managers';

export interface LogOrderNotificationParams {
  event: OrderNotificationEvent;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  userId?: string | null;
  orderId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  status: 'sent' | 'failed';
  details?: string | null;
}

export async function logOrderNotification(params: LogOrderNotificationParams): Promise<void> {
  try {
    await db.insert(orderNotificationLogs).values({
      event: params.event,
      channel: params.channel,
      recipient: params.recipient,
      userId: params.userId || null,
      orderId: params.orderId || null,
      customerName: params.customerName || null,
      customerPhone: params.customerPhone || null,
      status: params.status,
      details: params.details || null,
    });
  } catch (error) {
    console.error('[NotificationLogger] Failed to log notification:', error);
  }
}
