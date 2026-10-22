import type { PaymentDeliverySummary } from './payment-link-delivery';

export const PAYMENT_LINK_COOLDOWN_MS = 5 * 60_000;
export const PAYMENT_LINK_WINDOW_MS = 60 * 60_000;
export const PAYMENT_LINK_MAX_ATTEMPTS = 3;
export const PAYMENT_LINK_PENDING_MS = 10 * 60_000;

export interface PaymentAttemptEvent {
  id: string;
  event: string;
  channel: string;
  status: string;
  details: string | null;
  sentAt: string | Date;
}
export interface PaymentAttemptDetails {
  version: 1;
  summary?: PaymentDeliverySummary;
  error?: string;
}
export interface PaymentAttemptView {
  id: string;
  at: string;
  status: 'pending' | 'sent' | 'partial' | 'failed' | 'unknown';
  summary?: PaymentDeliverySummary;
  error?: string;
  legacy?: boolean;
  channel?: string;
}
export interface PaymentLinkOrder {
  id: string;
  status: string;
  paymentMethod: string;
  paymentId?: string | null;
  paymentLinkSentAt?: string | Date | null;
}
export interface PaymentLinkState {
  serverNow: string;
  canSend: boolean;
  reason?: string;
  retryAt?: string;
  attemptsInHour: number;
  limit: number;
  history: PaymentAttemptView[];
}

export function paymentLinkEligibility(order: PaymentLinkOrder): string | undefined {
  if (order.paymentMethod !== 'yookassa') return 'Ссылка недоступна для этого способа оплаты.';
  if (!['СОБРАН', 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ'].includes(order.status)) {
    return 'Повторная отправка доступна только для собранного неоплаченного заказа.';
  }
  if (!order.paymentId) return 'Готовой ссылки нет. Сначала сформируйте платёж после сборки заказа.';
}

export function buildPaymentLinkState(order: PaymentLinkOrder, events: PaymentAttemptEvent[], now = Date.now()): PaymentLinkState {
  const ordered = [...events].sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt));
  const markers = ordered.filter(event => event.event === 'payment_link_attempt');
  const recent = markers.map(event => +new Date(event.sentAt))
    .filter(at => at > now - PAYMENT_LINK_WINDOW_MS).sort((a, b) => a - b);
  const markerIds = new Set(markers.map(event => event.id));
  const history: PaymentAttemptView[] = ordered.filter(event => {
    if (event.event !== 'payment_link') return true;
    try { return !markerIds.has(JSON.parse(event.details || '{}').paymentAttemptId); } catch { return true; }
  }).map(event => {
    let legacyDetail = event.details;
    if (event.event === 'payment_link') {
      try { legacyDetail = JSON.parse(event.details || '{}').detail || legacyDetail; } catch {}
    }
    if (event.event !== 'payment_link_attempt') return {
      id: event.id, at: new Date(event.sentAt).toISOString(),
      status: event.status === 'sent' ? 'sent' as const : 'failed' as const,
      legacy: true, channel: event.channel, error: event.status === 'sent' ? undefined : legacyDetail || 'Ошибка отправки',
    };
    let details: PaymentAttemptDetails | undefined;
    try { const parsed = JSON.parse(event.details || '{}'); if (parsed.version === 1) details = parsed; } catch {}
    const valid = ['pending', 'sent', 'partial', 'failed', 'unknown'].includes(event.status);
    let status: PaymentAttemptView['status'] = valid ? event.status as PaymentAttemptView['status'] : 'unknown';
    if (status === 'pending' && +new Date(event.sentAt) + PAYMENT_LINK_PENDING_MS <= now) status = 'unknown';
    return { id: event.id, at: new Date(event.sentAt).toISOString(), status, summary: details?.summary, error: details?.error };
  });
  const last = Math.max(
    order.paymentLinkSentAt ? +new Date(order.paymentLinkSentAt) : 0,
    ordered.length ? +new Date(ordered[0].sentAt) : 0,
  );
  let retry = last ? last + PAYMENT_LINK_COOLDOWN_MS : 0;
  let reason = retry > now ? 'Пауза между отправками — 5 минут.' : undefined;
  if (recent.length >= PAYMENT_LINK_MAX_ATTEMPTS) {
    retry = Math.max(retry, recent[recent.length - PAYMENT_LINK_MAX_ATTEMPTS] + PAYMENT_LINK_WINDOW_MS);
    reason = 'Достигнут лимит: 3 попытки за час.';
  }
  const pending = markers.find(event => event.status === 'pending' && +new Date(event.sentAt) + PAYMENT_LINK_PENDING_MS > now);
  if (pending) {
    retry = Math.max(retry, +new Date(pending.sentAt) + PAYMENT_LINK_PENDING_MS);
    reason = 'Отправка уже выполняется. Дождитесь результата.';
  }
  const eligibility = paymentLinkEligibility(order);
  return {
    serverNow: new Date(now).toISOString(),
    canSend: !eligibility && retry <= now,
    reason: eligibility || (retry > now ? reason : undefined),
    retryAt: retry > now ? new Date(retry).toISOString() : undefined,
    attemptsInHour: recent.length, limit: PAYMENT_LINK_MAX_ATTEMPTS, history,
  };
}
