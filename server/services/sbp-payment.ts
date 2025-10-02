/**
 * MockSBP Payment Provider
 * 
 * Questo è un mock del sistema di pagamento СБП (Sistema di Pagamenti Veloci) di Sberbank.
 * In production, questo verrebbe sostituito con l'integrazione reale dell'API Sberbank.
 * 
 * Funzionalità Mock:
 * - Genera URL di pagamento mock per testing
 * - Simula webhook callbacks per testing flow completo
 * - Verifica firma webhook (mock)
 */

import { createHmac, randomBytes } from 'crypto';

export interface SBPPaymentIntent {
  id: string;
  orderId: string;
  amount: string;
  currency: string;
  redirectUrl: string;
  qrCodeData?: string;
  expiresAt: Date;
}

export interface SBPWebhookPayload {
  paymentIntentId: string;
  status: 'completed' | 'failed';
  transactionId?: string;
  errorCode?: string;
  errorMessage?: string;
  signature: string;
}

// Secret per firma webhook (in production sarebbe fornito da Sberbank)
const WEBHOOK_SECRET = process.env.SBP_WEBHOOK_SECRET || 'mock_sbp_secret_key';

/**
 * Crea un payment intent СБП
 */
export async function createSBPPaymentIntent(
  orderId: string,
  amount: string,
  currency: string = 'RUB'
): Promise<SBPPaymentIntent> {
  // In production, qui chiameremmo l'API Sberbank
  // POST https://api.sberbank.ru/sbp/v1/payments/create
  
  const paymentId = `sbp_${randomBytes(16).toString('hex')}`;
  
  // Genera URL mock per testing
  const baseUrl = process.env.APP_URL || 'http://localhost:5000';
  const redirectUrl = `${baseUrl}/mock-sbp/pay/${paymentId}`;
  
  // In production, Sberbank restituirebbe anche QR code data
  const qrCodeData = `SBP|${paymentId}|${amount}|${currency}`;
  
  // Payment intent scade dopo 15 minuti
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  
  return {
    id: paymentId,
    orderId,
    amount,
    currency,
    redirectUrl,
    qrCodeData,
    expiresAt,
  };
}

/**
 * Verifica la firma di un webhook СБП
 */
export function verifySBPWebhookSignature(
  payload: Omit<SBPWebhookPayload, 'signature'>,
  signature: string
): boolean {
  // In production, verificheremmo la firma usando il secret fornito da Sberbank
  // Solitamente: HMAC-SHA256(payload_json, secret)
  
  const dataToSign = JSON.stringify({
    paymentIntentId: payload.paymentIntentId,
    status: payload.status,
    transactionId: payload.transactionId,
  });
  
  const expectedSignature = createHmac('sha256', WEBHOOK_SECRET)
    .update(dataToSign)
    .digest('hex');
  
  return signature === expectedSignature;
}

/**
 * Genera firma per webhook (per testing)
 */
export function generateWebhookSignature(
  payload: Omit<SBPWebhookPayload, 'signature'>
): string {
  const dataToSign = JSON.stringify({
    paymentIntentId: payload.paymentIntentId,
    status: payload.status,
    transactionId: payload.transactionId,
  });
  
  return createHmac('sha256', WEBHOOK_SECRET)
    .update(dataToSign)
    .digest('hex');
}

/**
 * Simula un pagamento completato (per testing)
 * In production, questo sarebbe chiamato dal sistema Sberbank tramite webhook
 */
export async function simulatePaymentCompletion(
  paymentIntentId: string,
  success: boolean = true
): Promise<SBPWebhookPayload> {
  const status = success ? 'completed' : 'failed';
  const transactionId = success ? `txn_${randomBytes(12).toString('hex')}` : undefined;
  const errorCode = !success ? 'INSUFFICIENT_FUNDS' : undefined;
  const errorMessage = !success ? 'Fondi insufficienti' : undefined;
  
  const payload: Omit<SBPWebhookPayload, 'signature'> = {
    paymentIntentId,
    status,
    transactionId,
    errorCode,
    errorMessage,
  };
  
  const signature = generateWebhookSignature(payload);
  
  return {
    ...payload,
    signature,
  };
}

/**
 * Cancella un payment intent (timeout o cancellazione utente)
 */
export async function cancelSBPPaymentIntent(paymentIntentId: string): Promise<void> {
  // In production, chiameremmo API Sberbank per cancellare
  // DELETE https://api.sberbank.ru/sbp/v1/payments/{paymentIntentId}
  
  console.log(`[MockSBP] Payment intent ${paymentIntentId} cancelled`);
}

/**
 * Ottieni stato di un payment intent
 */
export async function getSBPPaymentStatus(
  paymentIntentId: string
): Promise<'pending' | 'completed' | 'failed' | 'expired'> {
  // In production, chiameremmo API Sberbank
  // GET https://api.sberbank.ru/sbp/v1/payments/{paymentIntentId}/status
  
  // Mock: tutti i payment sono pending fino a webhook
  return 'pending';
}
