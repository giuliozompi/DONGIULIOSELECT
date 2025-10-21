/**
 * YooKassa Payment Provider
 * 
 * Integrazione completa con YooKassa (ex Yandex.Checkout) per pagamenti online.
 * Supporta carte bancarie, portafogli elettronici, SberPay, FPS e altri metodi.
 * 
 * API Docs: https://yookassa.ru/developers/api
 */

import { randomUUID } from 'crypto';

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';
const SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;

if (!SHOP_ID || !SECRET_KEY) {
  console.warn('⚠️  YooKassa credentials not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.');
}

// Tipi YooKassa
export interface YooKassaAmount {
  value: string; // "100.00"
  currency: string; // "RUB"
}

export interface YooKassaConfirmation {
  type: 'redirect';
  return_url: string;
  confirmation_url?: string; // Restituito da YooKassa
}

export interface YooKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  amount: YooKassaAmount;
  description?: string;
  created_at: string;
  confirmation?: YooKassaConfirmation;
  paid: boolean;
  refundable: boolean;
  metadata?: Record<string, string>;
}

export interface CreatePaymentParams {
  amount: YooKassaAmount;
  description: string;
  return_url: string;
  metadata?: Record<string, string>;
  capture?: boolean; // true = pagamento immediato, false = autorizzazione
}

export interface YooKassaWebhookEvent {
  type: 'notification';
  event: 'payment.succeeded' | 'payment.waiting_for_capture' | 'payment.canceled' | 'refund.succeeded';
  object: YooKassaPayment;
}

/**
 * Crea Basic Auth header per YooKassa
 */
function getAuthHeader(): string {
  if (!SHOP_ID || !SECRET_KEY) {
    throw new Error('YooKassa credentials not configured');
  }
  const credentials = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Crea un pagamento YooKassa
 * 
 * @param params - Parametri del pagamento
 * @param idempotencyKey - Chiave di idempotenza (UUID) per evitare duplicati
 * @returns Payment object da YooKassa
 */
export async function createYooKassaPayment(
  params: CreatePaymentParams,
  idempotencyKey?: string
): Promise<YooKassaPayment> {
  const key = idempotencyKey || randomUUID();
  
  const payload = {
    amount: params.amount,
    description: params.description,
    capture: params.capture ?? true, // Default: pagamento immediato
    confirmation: {
      type: 'redirect',
      return_url: params.return_url,
    },
    metadata: params.metadata || {},
  };

  try {
    const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Idempotence-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`YooKassa API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const payment: YooKassaPayment = await response.json();
    return payment;
  } catch (error) {
    console.error('[YooKassa] Error creating payment:', error);
    throw error;
  }
}

/**
 * Ottieni informazioni su un pagamento esistente
 * 
 * @param paymentId - ID del pagamento YooKassa
 * @returns Payment object
 */
export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  try {
    const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`YooKassa API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const payment: YooKassaPayment = await response.json();
    return payment;
  } catch (error) {
    console.error('[YooKassa] Error fetching payment:', error);
    throw error;
  }
}

/**
 * Cattura un pagamento autorizzato (per pagamenti 2-stage)
 * 
 * @param paymentId - ID del pagamento
 * @param amount - Importo da catturare (opzionale, default = importo totale)
 */
export async function captureYooKassaPayment(
  paymentId: string,
  amount?: YooKassaAmount
): Promise<YooKassaPayment> {
  const idempotencyKey = randomUUID();
  
  const payload = amount ? { amount } : {};

  try {
    const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Idempotence-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`YooKassa API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const payment: YooKassaPayment = await response.json();
    return payment;
  } catch (error) {
    console.error('[YooKassa] Error capturing payment:', error);
    throw error;
  }
}

/**
 * Cancella un pagamento pending
 * 
 * @param paymentId - ID del pagamento
 */
export async function cancelYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  const idempotencyKey = randomUUID();

  try {
    const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Idempotence-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`YooKassa API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const payment: YooKassaPayment = await response.json();
    return payment;
  } catch (error) {
    console.error('[YooKassa] Error canceling payment:', error);
    throw error;
  }
}

/**
 * Crea un rimborso
 * 
 * @param paymentId - ID del pagamento originale
 * @param amount - Importo da rimborsare
 * @param description - Motivo del rimborso (opzionale)
 */
export async function createYooKassaRefund(
  paymentId: string,
  amount: YooKassaAmount,
  description?: string
): Promise<any> {
  const idempotencyKey = randomUUID();
  
  const payload = {
    payment_id: paymentId,
    amount,
    description: description || 'Refund',
  };

  try {
    const response = await fetch(`${YOOKASSA_API_URL}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Idempotence-Key': idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`YooKassa API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const refund = await response.json();
    return refund;
  } catch (error) {
    console.error('[YooKassa] Error creating refund:', error);
    throw error;
  }
}

/**
 * Lista IP ufficiali YooKassa (CIDR notation)
 * Fonte: https://yookassa.ru/developers/using-api/webhooks
 */
const YOOKASSA_IP_RANGES = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.154.128/25',
  '2a02:5180::/32',
];

/**
 * Verifica se un IP è nella whitelist YooKassa
 * 
 * @param ip - IP address del client
 * @returns true se l'IP è autorizzato
 */
function isYooKassaIP(ip: string): boolean {
  // Helper per convertire IP in numero (supporta solo IPv4)
  const ipToNumber = (ip: string): number => {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return -1;
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  };
  
  // Helper per verificare se IP è in un range CIDR
  const isInCIDR = (ip: string, cidr: string): boolean => {
    // Salta IPv6 per ora
    if (cidr.includes(':')) return false;
    
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    
    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);
    
    if (ipNum === -1 || rangeNum === -1) return false;
    
    return (ipNum & mask) === (rangeNum & mask);
  };
  
  return YOOKASSA_IP_RANGES.some(range => isInCIDR(ip, range));
}

/**
 * Verifica autenticità webhook YooKassa
 * 
 * Implementa doppia verifica secondo best practices YooKassa:
 * 1. IP filtering: verifica che il webhook provenga da IP autorizzati
 * 2. API verification: conferma payment status chiamando l'API
 * 
 * @param event - Evento webhook ricevuto
 * @param clientIP - IP address del client che ha inviato il webhook
 * @returns true se il webhook è autentico
 */
export async function verifyYooKassaWebhook(
  event: YooKassaWebhookEvent, 
  clientIP?: string
): Promise<boolean> {
  try {
    // 1. Verifica base: deve essere notification type
    if (event.type !== 'notification') {
      console.error('[YooKassa] Invalid event type:', event.type);
      return false;
    }

    // 2. Verifica IP whitelist (se disponibile)
    if (clientIP) {
      if (!isYooKassaIP(clientIP)) {
        console.error('[YooKassa] Webhook from unauthorized IP:', clientIP);
        return false;
      }
    } else {
      console.warn('[YooKassa] Client IP not provided - skipping IP verification (development mode)');
    }

    // 3. Verifica che il payment ID esista
    if (!event.object?.id) {
      console.error('[YooKassa] Missing payment ID in webhook event');
      return false;
    }

    // 4. Conferma chiamando API YooKassa per verificare il payment
    const payment = await getYooKassaPayment(event.object.id);
    
    // 5. Verifica che lo status corrisponda
    if (payment.status !== event.object.status) {
      console.error(`[YooKassa] Status mismatch: API=${payment.status}, webhook=${event.object.status}`);
      return false;
    }
    
    console.log(`[YooKassa] Webhook verified successfully for payment ${event.object.id}`);
    return true;
  } catch (error) {
    console.error('[YooKassa] Webhook verification failed:', error);
    return false;
  }
}

/**
 * Formatta importo per YooKassa (sempre 2 decimali)
 * 
 * @param amount - Importo numerico
 * @returns Importo formattato come stringa "100.00"
 */
export function formatYooKassaAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Parsa importo da YooKassa
 * 
 * @param amountStr - Importo come stringa "100.00"
 * @returns Importo numerico
 */
export function parseYooKassaAmount(amountStr: string): number {
  return parseFloat(amountStr);
}
