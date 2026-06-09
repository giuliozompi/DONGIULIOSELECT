/**
 * Shared order-status automation logic.
 * Used by both the Telegram admin (routes.ts) and the Web admin (webRoutes.ts)
 * so that every status change triggers identical automations regardless of origin.
 *
 * Automations per status:
 *   СОБРАН  (online payment) → create YooKassa payment → send link Telegram/Email/WhatsApp
 *                               → update status to ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ
 *   ОПЛАЧЕН                  → award spin token → notify managers via Email + Telegram
 *   all others               → send status-change notification to customer via Telegram + WhatsApp
 */

import { storage } from '../storage';
import { canNotify } from './notification-settings';
import { logOrderNotification } from './notification-logger';
import { randomUUID } from 'crypto';

export interface StatusChangeResult {
  order: any;
  status: string;
  paymentLinkSent?: boolean;
  paymentUrl?: string;
  warning?: string;
  error?: string;
}

export async function processOrderStatusChange(
  orderId: string,
  newStatus: string
): Promise<StatusChangeResult> {
  const order = await storage.getOrderById(orderId);
  if (!order) throw new Error('Order not found');

  // Persist the new status first
  const updatedOrder = await storage.updateOrder(orderId, { status: newStatus });

  // ── ОПЛАЧЕН ──────────────────────────────────────────────────────────────
  if (newStatus === 'ОПЛАЧЕН') {
    // Award 1 spin token
    const awarded = await storage.awardSpinTokensForOrder(orderId, order.userId);
    if (awarded) {
      console.log(`✅ [OrderStatus] Spin token awarded to user ${order.userId} for order ${orderId}`);
    }

    // Notify managers via Email
    try {
      const { sendOrderPaidNotificationToManagers } = await import('./email');
      await sendOrderPaidNotificationToManagers(
        order.id, order.customerName, order.customerPhone, order.amount, order.paymentMethod
      );
      console.log(`✅ [OrderStatus] Payment notification email sent to managers for order ${orderId}`);
    } catch (e) {
      console.warn('⚠️ [OrderStatus] Manager email failed:', e);
    }

    // Notify managers via Telegram
    try {
      const { sendOrderPaidNotificationToManagers: tgManagers } = await import('./telegram-bot');
      await tgManagers(order.id, order.customerName, order.customerPhone, order.amount, order.paymentMethod);
      console.log(`✅ [OrderStatus] Payment notification sent to managers via Telegram for order ${orderId}`);
    } catch (e) {
      console.warn('⚠️ [OrderStatus] Manager Telegram failed:', e);
    }
  }

  // ── СОБРАН (online payment) → generate & send payment link ───────────────
  if (newStatus === 'СОБРАН' && order.paymentMethod !== 'cash_on_delivery') {
    console.log(`🔄 [OrderStatus] Order ${orderId} → СОБРАН, creating payment link...`);
    try {
      let paymentIntent = await storage.getPaymentIntentByOrderId(orderId);
      let confirmationUrl: string;

      if (!paymentIntent || paymentIntent.status !== 'pending') {
        const { createYooKassaPayment, formatYooKassaAmount, createReceipt } = await import('./yookassa-payment');

        const baseUrl = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
          : (process.env.APP_URL || 'http://localhost:5000');
        const returnUrl = `${baseUrl}/payment-return`;

        // Gather products & marking codes
        const allProducts = await storage.getAllProducts();
        const productsMap = new Map(allProducts.map((p: any) => [p.id, p]));
        const markingLogs = await storage.getMarkingLogsByOrder(orderId);
        const markingCodesMap = new Map<string, string[]>();
        for (const log of markingLogs) {
          const codes = markingCodesMap.get(log.productId) || [];
          codes.push(log.markingCode);
          markingCodesMap.set(log.productId, codes);
        }

        // Proportional discount distribution for fiscal receipt
        const itemsSubtotal = order.items.reduce(
          (s: number, i: any) => s + parseFloat(i.price) * i.quantity, 0
        );
        const totalToPay = parseFloat(order.amount);
        const calculatedDiscount = itemsSubtotal - totalToPay;

        let enrichedItems: any[];
        if (calculatedDiscount > 0.01) {
          const ratio = 1 - calculatedDiscount / itemsSubtotal;
          enrichedItems = order.items.map((item: any) => ({
            ...item,
            price: (parseFloat(item.price) * ratio).toFixed(2),
            requiresMarking: (productsMap.get(item.productId) as any)?.requiresMarking || false,
          }));
        } else {
          enrichedItems = order.items.map((item: any) => ({
            ...item,
            requiresMarking: (productsMap.get(item.productId) as any)?.requiresMarking || false,
          }));
        }

        const receipt = createReceipt(
          enrichedItems,
          order.customerEmail,
          order.customerPhone,
          markingCodesMap,
          1, // УСН доход
          1  // без НДС
        );

        const yookassaPayment = await createYooKassaPayment({
          amount: { value: formatYooKassaAmount(totalToPay), currency: 'RUB' },
          description: `Заказ №${orderId.slice(0, 8)}`,
          return_url: returnUrl,
          metadata: { orderId, userId: order.userId },
          capture: true,
          receipt,
        });

        confirmationUrl = yookassaPayment.confirmation?.confirmation_url || '';
        paymentIntent = await storage.createPaymentIntent({
          orderId,
          provider: 'YooKassa',
          status: 'pending',
          amount: order.amount,
          redirectUrl: confirmationUrl,
          raw: {
            yookassaPaymentId: yookassaPayment.id,
            yookassaStatus: yookassaPayment.status,
            createdAt: yookassaPayment.created_at,
          },
        });
      } else {
        confirmationUrl = paymentIntent.redirectUrl || '';
      }

      // Send link via Telegram
      try {
        const { sendPaymentLink } = await import('./telegram-bot');
        const sent = await sendPaymentLink(order.userId, orderId, order.amount, confirmationUrl);
        console.log(sent ? '✅ [OrderStatus] Payment link sent via Telegram' : '⚠️ [OrderStatus] Telegram not configured');
      } catch (e) { console.warn('⚠️ [OrderStatus] Telegram payment link failed:', e); }

      // Send link via Email
      if (order.customerEmail) {
        try {
          const { sendPaymentLinkEmail } = await import('./email');
          await sendPaymentLinkEmail(order.customerEmail, orderId, order.customerName, order.amount, confirmationUrl);
          console.log('✅ [OrderStatus] Payment link sent via Email');
        } catch (e) { console.warn('⚠️ [OrderStatus] Email payment link failed:', e); }
      }

      // Send link via WhatsApp
      if (await canNotify('whatsapp', order.userId)) {
        try {
          const { sendPaymentLinkWhatsApp } = await import('./whatsapp');
          const sent = await sendPaymentLinkWhatsApp(order.customerPhone, orderId, order.customerName, order.amount, confirmationUrl);
          await logOrderNotification({ event: 'payment_link', channel: 'whatsapp', recipient: 'customer', userId: order.userId, orderId, customerName: order.customerName, customerPhone: order.customerPhone, status: sent ? 'sent' : 'failed', details: order.amount });
        } catch (e) {
          await logOrderNotification({ event: 'payment_link', channel: 'whatsapp', recipient: 'customer', userId: order.userId, orderId, customerName: order.customerName, customerPhone: order.customerPhone, status: 'failed', details: String(e) });
        }
      }

      // Finalize status to ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ
      await storage.updateOrder(orderId, {
        status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
        paymentId: paymentIntent!.id,
        paymentLinkSentAt: new Date(),
      });

      console.log(`✅ [OrderStatus] Payment link flow complete for order ${orderId}`);
      return {
        order: { ...updatedOrder, status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ' },
        status: 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ',
        paymentLinkSent: true,
        paymentUrl: confirmationUrl,
      };
    } catch (e) {
      console.error(`❌ [OrderStatus] Auto-СОБРАН payment link failed for ${orderId}:`, e);
      // Status stays СОБРАН, return warning instead of failing completely
      return {
        order: { ...updatedOrder, status: 'СОБРАН' },
        status: 'СОБРАН',
        paymentLinkSent: false,
        warning: 'Stato aggiornato a СОБРАН, ma la creazione del link pagamento ha fallito. Generalo manualmente.',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ── Status notification to customer (all statuses except auto-СОБРАН) ────
  const shouldSendNotification = !(newStatus === 'СОБРАН' && order.paymentMethod !== 'cash_on_delivery');
  if (shouldSendNotification) {
    // Telegram
    if (await canNotify('telegram', order.userId)) {
      try {
        const { sendOrderStatusNotification } = await import('./telegram-bot');
        const deliveryCost = newStatus === 'ВЫЗВАН КУРЬЕР' ? (updatedOrder?.deliveryCost ?? undefined) : undefined;
        const sent = await sendOrderStatusNotification(order.userId, orderId, newStatus, order.customerName, deliveryCost);
        await logOrderNotification({ event: 'status_change', channel: 'telegram', recipient: 'customer', userId: order.userId, orderId, customerName: order.customerName, customerPhone: order.customerPhone, status: sent ? 'sent' : 'failed', details: newStatus });
        if (sent) console.log(`✅ [OrderStatus] Status notification sent via Telegram: ${newStatus}`);
      } catch (e) {
        console.warn('⚠️ [OrderStatus] Telegram status notification failed:', e);
        await logOrderNotification({ event: 'status_change', channel: 'telegram', recipient: 'customer', userId: order.userId, orderId, customerName: order.customerName, customerPhone: order.customerPhone, status: 'failed', details: newStatus });
      }
    }

    // WhatsApp
    if (await canNotify('whatsapp', order.userId)) {
      try {
        const { sendOrderStatusUpdateWhatsApp } = await import('./whatsapp');
        const sent = await sendOrderStatusUpdateWhatsApp(order.customerPhone, orderId, order.customerName, newStatus);
        await logOrderNotification({ event: 'status_change', channel: 'whatsapp', recipient: 'customer', userId: order.userId, orderId, customerName: order.customerName, customerPhone: order.customerPhone, status: sent ? 'sent' : 'failed', details: newStatus });
        if (sent) console.log(`✅ [OrderStatus] Status notification sent via WhatsApp: ${newStatus}`);
      } catch (e) {
        await logOrderNotification({ event: 'status_change', channel: 'whatsapp', recipient: 'customer', userId: order.userId, orderId, customerName: order.customerName, customerPhone: order.customerPhone, status: 'failed', details: newStatus });
      }
    }
  }

  return { order: updatedOrder, status: newStatus };
}
