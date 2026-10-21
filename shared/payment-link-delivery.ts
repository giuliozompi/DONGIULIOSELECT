export type PaymentChannel = 'telegram' | 'email' | 'whatsapp';
export interface PaymentChannelResult {
  channel: PaymentChannel;
  status: 'sent' | 'failed' | 'skipped';
  detail: string;
}
export interface PaymentDeliverySummary {
  channels: PaymentChannelResult[];
  paymentLinkSent: boolean;
  warning?: string;
}
export interface PaymentNotificationFields {
  paymentDelivery?: PaymentDeliverySummary;
  paymentLinkSent?: boolean;
  warning?: string;
  error?: string;
}

export function summarizePaymentDelivery(channels: PaymentChannelResult[]): PaymentDeliverySummary {
  const paymentLinkSent = channels.some(channel => channel.status === 'sent');
  const failures = channels.filter(channel => channel.status === 'failed');
  const warning = !paymentLinkSent
    ? 'Ссылка создана, но ни один канал не подтвердил отправку. Свяжитесь с клиентом.'
    : failures.length
      ? 'Не все уведомления отправлены. Проверьте ошибки каналов ниже.'
      : undefined;
  return { channels, paymentLinkSent, warning };
}

export function paymentLinkOrderUpdate(summary: PaymentDeliverySummary, paymentId: string, now = new Date()) {
  return {
    status: summary.paymentLinkSent ? 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ' : 'СОБРАН',
    paymentId,
    paymentLinkSentAt: summary.paymentLinkSent ? now : null,
  };
}
