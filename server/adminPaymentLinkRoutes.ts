import type { Express, RequestHandler } from 'express';
import { getPaymentLinkStates, PaymentAttemptBlocked, PaymentLinkPreparationError, recordAcceptedPaymentLink } from './services/payment-link-attempts';
import { sendOrderPaymentLink } from './services/payment-link-delivery';
import { paymentLinkEligibility } from '../shared/payment-link-attempts';
import { paymentLinkOrderUpdate } from '../shared/payment-link-delivery';
import { storage } from './storage';

export const adminPaymentLinkDependencies = {
  getOrder: (id: string) => storage.getOrderById(id),
  getIntent: (id: string) => storage.getPaymentIntentById(id),
  getStates: getPaymentLinkStates,
  send: sendOrderPaymentLink,
  getPayment: async (id: string) => (await import('./services/yookassa-payment')).getYooKassaPayment(id, AbortSignal.timeout(15_000)),
  updateOrder: recordAcceptedPaymentLink,
};

export function registerAdminPaymentLinks(
  app: Express, auth: RequestHandler, admin: RequestHandler,
  deps = adminPaymentLinkDependencies,
) {
  app.post('/web-api/admin/orders/:id/resend-payment-link', auth, admin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const order = await deps.getOrder(req.params.id);
      if (!order) return res.status(404).json({ error: 'Заказ не найден.' });
      const reason = paymentLinkEligibility(order);
      if (reason) return res.status(409).json({ error: reason });
      const summary = await deps.send(order, async () => {
        const intent = await deps.getIntent(order.paymentId!);
        if (!intent || intent.orderId !== order.id || intent.status !== 'pending') {
          throw new PaymentLinkPreparationError('Нет действующей ссылки. Проверьте платёж и сформируйте новую ссылку отдельно.');
        }
        const providerId = (intent.raw as { yookassaPaymentId?: string } | null)?.yookassaPaymentId;
        if (!providerId) throw new PaymentLinkPreparationError('Не найден идентификатор платежа YooKassa.');
        const payment = await deps.getPayment(providerId);
        if (payment.paid || payment.status === 'succeeded' || payment.status === 'waiting_for_capture') {
          throw new PaymentLinkPreparationError('Платёж уже оплачен или ожидает списания. Повторная ссылка не отправлена.');
        }
        if (payment.status !== 'pending') throw new PaymentLinkPreparationError('Ссылка больше не действует. Повторная отправка отменена.');
        if (payment.amount.currency !== 'RUB' || Number(payment.amount.value) !== Number(order.amount) ||
          Number(intent.amount) !== Number(order.amount) || !(Number(order.amount) > 0)) {
          throw new PaymentLinkPreparationError('Сумма платежа отличается от заказа. Сначала обновите платёж.');
        }
        if (payment.metadata?.orderId && payment.metadata.orderId !== order.id) {
          throw new PaymentLinkPreparationError('Платёж относится к другому заказу.');
        }
        const url = payment.confirmation?.confirmation_url || intent.redirectUrl || '';
        if (!url.startsWith('https://')) throw new PaymentLinkPreparationError('Действующая платёжная ссылка отсутствует.');
        const current = await deps.getOrder(order.id);
        if (!current || paymentLinkEligibility(current) || current.paymentId !== order.paymentId ||
          Number(current.amount) !== Number(order.amount)) {
          throw new PaymentLinkPreparationError('Заказ изменился во время проверки. Обновите его перед отправкой.');
        }
        return url;
      });
      // Preserve an earlier accepted send when this retry fails.
      if (summary.paymentLinkSent) await deps.updateOrder(order, paymentLinkOrderUpdate(summary, order.paymentId!));
      const latest = await deps.getOrder(order.id);
      return res.json({ order: latest, paymentDelivery: summary, paymentLinkSent: summary.paymentLinkSent,
        warning: summary.warning, paymentLinkState: (await deps.getStates([latest || order]))[order.id] });
    } catch (error) {
      if (error instanceof PaymentAttemptBlocked) {
        if (error.state.retryAt) res.set('Retry-After', String(Math.max(1, Math.ceil((+new Date(error.state.retryAt) - Date.now()) / 1000))));
        return res.status(429).json({ error: error.message, paymentLinkState: error.state });
      }
      return res.status(502).json({ error: error instanceof PaymentLinkPreparationError
        ? error.message : 'Не удалось проверить или отправить ссылку. Проверьте историю перед повторной попыткой.' });
    }
  });
}
