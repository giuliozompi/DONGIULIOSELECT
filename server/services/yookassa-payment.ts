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
  console.error('❌ YooKassa credentials not configured!');
  console.error('   Missing:', !SHOP_ID ? 'YOOKASSA_SHOP_ID' : '', !SECRET_KEY ? 'YOOKASSA_SECRET_KEY' : '');
  console.error('   Please configure these secrets in Replit Secrets panel.');
  console.error('   Payment link generation will fail until configured.');
}

export function checkYooKassaCredentials(): { ok: boolean; error?: string } {
  if (!SHOP_ID || !SECRET_KEY) {
    const missing = [];
    if (!SHOP_ID) missing.push('YOOKASSA_SHOP_ID');
    if (!SECRET_KEY) missing.push('YOOKASSA_SECRET_KEY');
    return { 
      ok: false, 
      error: `YooKassa credentials missing: ${missing.join(', ')}. Please configure in Replit Secrets panel.` 
    };
  }
  return { ok: true };
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

// Dati per scontrino fiscale (54-ФЗ)
export interface YooKassaReceiptItem {
  description: string; // Nome prodotto
  quantity: string; // "1.000" | "0.500"
  amount: YooKassaAmount; // Prezzo unitario
  vat_code: number; // 1 = senza IVA, 2 = 0%, 3 = 10%, 4 = 20%, etc.
  payment_mode?: string; // "full_payment" (default)
  payment_subject?: string; // "commodity" (default) | "marked" (per маркировка)
  mark_mode?: number; // 0 = маркировка обязательна (per prodotti маркировati)
  mark_code_info?: {
    gs1m?: string; // Codice GS1 DataMatrix in base64 (più comune) - NOTA: gs1m NON gs_1m!
    ean_8?: string;
    ean_13?: string;
    itf_14?: string;
    gs10?: string; // NOTA: gs10 NON gs_10!
    unknown?: string;
    short?: string;
    fur?: string; // Меховые изделия
    egais_20?: string; // ЕГАИС-2.0 - NOTA: egais NON egails!
    egais_30?: string; // ЕГАИС-3.0 - NOTA: egais NON egails!
  };
}

export interface YooKassaReceipt {
  customer: {
    email?: string;
    phone?: string;
  };
  items: YooKassaReceiptItem[];
  tax_system_code?: number; // 1 = УСН доход, 2 = УСН доход-расход, etc.
}

export interface CreatePaymentParams {
  amount: YooKassaAmount;
  description: string;
  return_url: string;
  metadata?: Record<string, string>;
  capture?: boolean; // true = pagamento immediato, false = autorizzazione
  receipt?: YooKassaReceipt; // Dati per scontrino fiscale (obbligatorio per 54-ФЗ)
}

export interface YooKassaWebhookEvent {
  type: 'notification';
  event: 'payment.succeeded' | 'payment.waiting_for_capture' | 'payment.canceled' | 'refund.succeeded';
  object: YooKassaPayment;
}

// Interfaccia per Receipt (Scontrino fiscale)
export interface YooKassaReceiptResponse {
  id: string; // ID dello scontrino
  type: 'payment' | 'refund';
  payment_id?: string;
  refund_id?: string;
  status: 'pending' | 'succeeded' | 'canceled';
  fiscal_document_number?: string; // Номер фискального документа
  fiscal_storage_number?: string; // Номер фискального накопителя
  fiscal_attribute?: string; // Фискальный признак документа
  registered_at?: string; // Data e ora di registrazione fiscale
  fiscal_provider_id?: string;
  items: YooKassaReceiptItem[];
  customer?: {
    email?: string;
    phone?: string;
  };
}

// Parametri per creare un receipt dopo il pagamento
export interface CreateReceiptAfterPaymentParams {
  payment_id: string;
  customer: {
    email?: string;
    phone?: string;
  };
  items: YooKassaReceiptItem[];
  tax_system_code?: number;
  send?: boolean; // Se true, YooKassa invia lo scontrino al cliente via email/SMS
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
  
  const payload: any = {
    amount: params.amount,
    description: params.description,
    capture: params.capture ?? true, // Default: pagamento immediato
    confirmation: {
      type: 'redirect',
      return_url: params.return_url,
    },
    metadata: params.metadata || {},
  };
  
  // Aggiungi dati per scontrino fiscale (54-ФЗ) se forniti
  if (params.receipt) {
    payload.receipt = params.receipt;
    console.log('[YooKassa] Receipt included with', params.receipt.items.length, 'items:');
    params.receipt.items.forEach((item, idx) => {
      console.log(`  [${idx}] ${item.description}: qty=${item.quantity}, amount=${item.amount.value} ${item.amount.currency}`);
    });
  }

  try {
    console.log('[YooKassa] Creating payment with idempotency key:', key);
    console.log('[YooKassa] Full payload:', JSON.stringify(payload, null, 2));
    const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Idempotence-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('[YooKassa] API Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { raw: errorText };
      }
      
      console.error('[YooKassa] API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        data: errorData
      });
      
      throw new Error(`YooKassa API error ${response.status}: ${JSON.stringify(errorData)}`);
    }

    const payment: YooKassaPayment = await response.json();
    console.log('[YooKassa] Payment created successfully:', payment.id);
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
 * Crea uno scontrino fiscale (receipt) dopo il pagamento
 * 
 * Usato per scenari "Receipt after payment" quando lo scontrino
 * non è stato creato durante il pagamento iniziale.
 * 
 * @param params - Parametri dello scontrino
 * @param idempotencyKey - Chiave di idempotenza (UUID)
 * @returns Receipt object da YooKassa
 */
export async function createReceiptAfterPayment(
  params: CreateReceiptAfterPaymentParams,
  idempotencyKey?: string
): Promise<YooKassaReceiptResponse> {
  const key = idempotencyKey || randomUUID();
  
  const payload = {
    type: 'payment',
    payment_id: params.payment_id,
    customer: params.customer,
    send: params.send ?? true, // Default: invia scontrino al cliente
    items: params.items,
    tax_system_code: params.tax_system_code || 1,
  };

  try {
    const response = await fetch(`${YOOKASSA_API_URL}/receipts`, {
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
      throw new Error(`YooKassa Receipt API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const receipt: YooKassaReceiptResponse = await response.json();
    console.log('✅ Receipt created successfully:', receipt.id);
    return receipt;
  } catch (error) {
    console.error('[YooKassa] Error creating receipt:', error);
    throw error;
  }
}

/**
 * Recupera informazioni su uno scontrino esistente
 * 
 * @param receiptId - ID dello scontrino YooKassa
 * @returns Receipt object
 */
export async function getYooKassaReceipt(receiptId: string): Promise<YooKassaReceiptResponse> {
  try {
    const response = await fetch(`${YOOKASSA_API_URL}/receipts/${receiptId}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`YooKassa Receipt API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const receipt: YooKassaReceiptResponse = await response.json();
    return receipt;
  } catch (error) {
    console.error('[YooKassa] Error fetching receipt:', error);
    throw error;
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

/**
 * Crea oggetto receipt per scontrino fiscale (54-ФЗ) con supporto маркировка
 * 
 * @param orderItems - Prodotti dell'ordine
 * @param customerEmail - Email cliente (opzionale)
 * @param customerPhone - Telefono cliente (opzionale)
 * @param markingCodes - Codici маркировка per productId (opzionale)
 * @param taxSystemCode - Codice sistema fiscale (default: 1 = УСН доход)
 * @param vatCode - Codice IVA (default: 1 = senza IVA per УСН)
 * @returns Oggetto receipt per YooKassa
 */
export function createReceipt(
  orderItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
    unit: string;
    requiresMarking?: boolean; // Prodotto richiede маркировка
  }>,
  customerEmail?: string | null,
  customerPhone?: string | null,
  markingCodes?: Map<string, string[]>, // productId -> array di codici маркировка
  taxSystemCode: number = 1, // 1 = УСН доход
  vatCode: number = 1 // 1 = без НДС (senza IVA per УСН)
): YooKassaReceipt {
  // Almeno uno tra email e telefono è richiesto
  const customer: { email?: string; phone?: string } = {};
  if (customerEmail) customer.email = customerEmail;
  if (customerPhone) customer.phone = customerPhone;
  
  // Converti items dell'ordine in formato YooKassa
  const items: YooKassaReceiptItem[] = [];
  
  for (const item of orderItems) {
    // Debug: valida price prima di usarlo
    console.log(`[Receipt Item] ${item.productName}: price="${item.price}", quantity=${item.quantity}, unit=${item.unit}`);
    
    if (!item.price || item.price === '' || isNaN(parseFloat(item.price))) {
      console.error(`❌ [Receipt Item] Invalid price for "${item.productName}": "${item.price}"`);
      throw new Error(`Invalid price for product "${item.productName}": expected numeric string, got "${item.price}"`);
    }
    
    const priceNum = parseFloat(item.price);
    const priceFormatted = formatYooKassaAmount(priceNum);
    console.log(`[Receipt Item] Price conversion: "${item.price}" → ${priceNum} → "${priceFormatted}"`);
    
    const isMarked = item.requiresMarking && item.unit === 'шт';
    const codes = markingCodes?.get(item.productId) || [];
    
    if (isMarked && codes.length > 0) {
      // PRODOTTO МАРКИРОВATO: splittare in item separati (1 unità = 1 item)
      const quantity = Math.ceil(item.quantity);
      
      for (let i = 0; i < quantity; i++) {
        const code = codes[i];
        
        if (code) {
          items.push({
            description: `${item.productName} - Единица ${i + 1}`,
            quantity: '1.000', // Sempre 1 per маркировка
            amount: {
              value: priceFormatted,
              currency: 'RUB',
            },
            vat_code: vatCode,
            payment_mode: 'full_payment',
            payment_subject: 'marked', // ⚠️ IMPORTANTE per маркировка
            mark_mode: 0, // 0 = маркировка обязательна
            mark_code_info: {
              gs1m: Buffer.from(code).toString('base64'), // ⚠️ IMPORTANTE: gs1m NON gs_1m!
            },
          });
        } else {
          // Fallback se il codice manca (non dovrebbe succedere)
          console.warn(`[YooKassa Receipt] Missing marking code for ${item.productName} unit ${i + 1}`);
          items.push({
            description: `${item.productName} - Единица ${i + 1}`,
            quantity: '1.000',
            amount: {
              value: priceFormatted,
              currency: 'RUB',
            },
            vat_code: vatCode,
            payment_mode: 'full_payment',
            payment_subject: 'commodity',
          });
        }
      }
    } else {
      // PRODOTTO NORMALE: aggregato
      items.push({
        description: item.productName,
        quantity: item.quantity.toFixed(3), // Formato: "1.000", "0.500"
        amount: {
          value: priceFormatted,
          currency: 'RUB',
        },
        vat_code: vatCode,
        payment_mode: 'full_payment',
        payment_subject: 'commodity', // товар
      });
    }
  }
  
  return {
    customer,
    items,
    tax_system_code: taxSystemCode,
  };
}

// ============================================================================
// REFUNDS (Rimborsi)
// ============================================================================

/**
 * Interfaccia per oggetto Refund di YooKassa
 */
export interface YooKassaRefund {
  id: string; // ID del rimborso
  status: 'pending' | 'succeeded' | 'canceled';
  amount: YooKassaAmount;
  description?: string; // Motivazione del rimborso
  created_at: string;
  payment_id: string; // ID del pagamento originale
  receipt?: YooKassaReceiptResponse; // Scontrino fiscale per rimborso (se applicabile)
}

/**
 * Parametri per creare un rimborso
 */
export interface CreateRefundParams {
  payment_id: string; // ID del pagamento YooKassa da rimborsare
  amount: YooKassaAmount; // Importo da rimborsare (può essere parziale)
  description?: string; // Motivazione del rimborso (opzionale, ma consigliato)
  receipt?: YooKassaReceipt; // Dati per scontrino fiscale (obbligatorio per rimborsi parziali con 54-ФЗ)
}

/**
 * Crea un rimborso YooKassa
 * 
 * @param params - Parametri del rimborso
 * @param idempotencyKey - Chiave di idempotenza (UUID) per evitare duplicati
 * @returns Refund object da YooKassa
 * 
 * Note:
 * - Il pagamento deve essere in status 'succeeded'
 * - Sberbank: pagamenti < 1 anno
 * - Altri metodi: pagamenti < 3 anni
 * - Il rimborso va allo stesso metodo di pagamento originale (stessa carta/wallet)
 * - Nessuna commissione sul rimborso (ma la commissione del pagamento originale non viene restituita)
 */
export async function createYooKassaRefund(
  params: CreateRefundParams,
  idempotencyKey?: string
): Promise<YooKassaRefund> {
  const key = idempotencyKey || randomUUID();
  
  const payload: any = {
    payment_id: params.payment_id,
    amount: params.amount,
  };
  
  // Aggiungi descrizione se fornita
  if (params.description) {
    payload.description = params.description;
  }
  
  // Aggiungi dati per scontrino fiscale se forniti (per rimborsi parziali)
  if (params.receipt) {
    payload.receipt = params.receipt;
  }

  try {
    console.log('[YooKassa Refund] Creating refund with idempotency key:', key);
    console.log('[YooKassa Refund] Payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch(`${YOOKASSA_API_URL}/refunds`, {
      method: 'POST',
      headers: {
        'Authorization': getAuthHeader(),
        'Idempotence-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('[YooKassa Refund] API Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { raw: errorText };
      }
      
      console.error('[YooKassa Refund] API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        data: errorData
      });
      
      throw new Error(`YooKassa Refund API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const refund: YooKassaRefund = await response.json();
    console.log('[YooKassa Refund] Refund created successfully:', refund.id);
    console.log('[YooKassa Refund] Status:', refund.status);
    console.log('[YooKassa Refund] Amount:', refund.amount.value, refund.amount.currency);
    
    return refund;
  } catch (error) {
    console.error('[YooKassa Refund] Error creating refund:', error);
    throw error;
  }
}

/**
 * Ottieni informazioni su un rimborso esistente
 * 
 * @param refundId - ID del rimborso YooKassa
 * @returns Refund object
 */
export async function getYooKassaRefund(refundId: string): Promise<YooKassaRefund> {
  try {
    console.log('[YooKassa Refund] Fetching refund:', refundId);
    
    const response = await fetch(`${YOOKASSA_API_URL}/refunds/${refundId}`, {
      method: 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[YooKassa Refund] API Error:', {
        status: response.status,
        data: errorData
      });
      throw new Error(`YooKassa Refund API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const refund: YooKassaRefund = await response.json();
    console.log('[YooKassa Refund] Refund fetched:', refund.id, '- Status:', refund.status);
    
    return refund;
  } catch (error) {
    console.error('[YooKassa Refund] Error fetching refund:', error);
    throw error;
  }
}
