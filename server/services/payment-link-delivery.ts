import { summarizePaymentDelivery, type PaymentChannel, type PaymentChannelResult } from '../../shared/payment-link-delivery';

interface PaymentOrder {
  id: string;
  userId: string;
  amount: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
}
interface SendResult { sent: boolean; error?: string }
interface Dependencies {
  canNotify: (channel: PaymentChannel, userId: string) => Promise<boolean>;
  send: (channel: PaymentChannel) => Promise<SendResult>;
  log: (result: PaymentChannelResult) => Promise<void>;
}

// Separate from providers so all failure combinations can be tested without sending messages.
export async function deliverPaymentLink(order: PaymentOrder, url: string, deps: Dependencies) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Платёжный сервис не вернул корректную ссылку на оплату.');
  const results: PaymentChannelResult[] = [];
  for (const channel of ['telegram', 'email', 'whatsapp'] as const) {
    let result: PaymentChannelResult;
    try {
      if (!await deps.canNotify(channel, order.userId)) {
        results.push({ channel, status: 'skipped', detail: 'Канал отключён в настройках уведомлений.' });
        continue;
      }
      if (channel === 'email' && !order.customerEmail) {
        results.push({ channel, status: 'skipped', detail: 'Email клиента не указан.' });
        continue;
      }
      const sent = await deps.send(channel);
      result = {
        channel,
        status: sent.sent ? 'sent' : 'failed',
        detail: sent.sent
          ? 'Сервис принял сообщение. Доставка клиенту не подтверждена.'
          : sent.error || 'Сервис не подтвердил отправку. Проверьте конфигурацию и журнал сервера.',
      };
    } catch {
      // Do not expose raw network exceptions: they may contain credential-bearing provider URLs.
      result = { channel, status: 'failed', detail: 'Ошибка обращения к сервису уведомлений. Проверьте журнал сервера.' };
    }
    results.push(result);
    try { await deps.log(result); }
    catch { console.error('[PaymentDelivery] Failed to record notification outcome:', channel); }
  }
  return summarizePaymentDelivery(results);
}

export async function sendOrderPaymentLink(order: PaymentOrder, url: string) {
  const { canNotify } = await import('./notification-settings');
  const { logOrderNotification } = await import('./notification-logger');
  return deliverPaymentLink(order, url, {
    canNotify,
    send: async channel => {
      if (channel === 'telegram') {
        const { sendPaymentLinkDetailed } = await import('./telegram-bot');
        return sendPaymentLinkDetailed(order.userId, order.id, order.amount, url);
      }
      if (channel === 'email') {
        const { sendPaymentLinkEmail } = await import('./email');
        const sent = await sendPaymentLinkEmail(order.customerEmail!, order.id, order.customerName, order.amount, url);
        return { sent, error: sent ? undefined : 'Email-сервис не принял письмо. Проверьте настройки отправителя и журнал сервера.' };
      }
      const { sendPaymentLinkWhatsApp } = await import('./whatsapp');
      return { sent: await sendPaymentLinkWhatsApp(order.customerPhone, order.id, order.customerName, order.amount, url) };
    },
    log: result => logOrderNotification({
      event: 'payment_link', recipient: 'customer', channel: result.channel,
      userId: order.userId, orderId: order.id, customerName: order.customerName,
      customerPhone: order.customerPhone, status: result.status === 'sent' ? 'sent' : 'failed',
      details: result.detail,
    }),
  });
}
