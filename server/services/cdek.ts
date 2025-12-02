import { nanoid } from 'nanoid';

/**
 * CDEK (СДЭК) Delivery Service Integration
 * API Documentation: https://api-docs.cdek.ru/
 * 
 * Features:
 * - OAuth 2.0 authentication with automatic token refresh
 * - Tariff calculation
 * - Order creation and management
 * - Pickup points (PVZ) lookup
 * - Order tracking
 * - Webhook handling
 */

// Base URLs
const CDEK_API_BASE_URL = process.env.CDEK_TEST_MODE === 'true' 
  ? 'https://api.edu.cdek.ru/v2'
  : 'https://api.cdek.ru/v2';

// Credentials
const CDEK_CLIENT_ID = process.env.CDEK_CLIENT_ID;
const CDEK_CLIENT_SECRET = process.env.CDEK_CLIENT_SECRET;

// Test credentials (for development)
const CDEK_TEST_CLIENT_ID = 'wqGwiQx0gg8mLtiEKsUinjVSICCjtTEP';
const CDEK_TEST_CLIENT_SECRET = 'RmAmgvSgSl1yirlz9QupbzOJVqhCxcP5';

// Common CDEK tariff codes
export const CDEK_TARIFFS = {
  // Door-to-door
  EXPRESS_DOOR_DOOR: 1, // Экспресс лайт дверь-дверь
  ECOMMERCE_DOOR_DOOR: 137, // СДЭК дверь-дверь (для ИМ)
  
  // Warehouse-to-warehouse
  EXPRESS_WAREHOUSE_WAREHOUSE: 10, // Экспресс лайт склад-склад
  ECOMMERCE_WAREHOUSE_WAREHOUSE: 136, // СДЭК склад-склад (для ИМ)
  EXPRESS_CLASSIC: 483, // Экспресс склад-склад
  
  // Mixed
  WAREHOUSE_DOOR: 139, // Склад-дверь
  DOOR_WAREHOUSE: 138, // Дверь-склад (для ИМ)
  
  // Postamat
  ECOMMERCE_POSTAMAT: 368, // СДЭК постамат
} as const;

// Delivery modes
export const CDEK_DELIVERY_MODES = {
  DOOR_TO_DOOR: 1,
  DOOR_TO_WAREHOUSE: 2,
  WAREHOUSE_TO_DOOR: 3,
  WAREHOUSE_TO_WAREHOUSE: 4,
  DOOR_TO_POSTAMAT: 5,
  WAREHOUSE_TO_POSTAMAT: 6,
} as const;

// Order types
export const CDEK_ORDER_TYPES = {
  ONLINE_STORE: 1, // Интернет-магазин
  DELIVERY: 2, // Доставка
} as const;

// Status codes
export const CDEK_STATUS_CODES = {
  CREATED: 'CREATED', // Заказ создан
  RECEIVED_AT_SHIPMENT_WAREHOUSE: 'RECEIVED_AT_SHIPMENT_WAREHOUSE', // Принят на склад отправителя
  READY_FOR_SHIPMENT_IN_SENDER_CITY: 'READY_FOR_SHIPMENT_IN_SENDER_CITY', // Выдан на отправку в город-отправителе
  RETURNED_TO_SENDER_CITY_WAREHOUSE: 'RETURNED_TO_SENDER_CITY_WAREHOUSE', // Возвращен на склад отправителя
  TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY: 'TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY', // Сдан перевозчику в городе-отправителе
  SENT_TO_TRANSIT_CITY: 'SENT_TO_TRANSIT_CITY', // Отправлен в г. транзит
  ACCEPTED_IN_TRANSIT_CITY: 'ACCEPTED_IN_TRANSIT_CITY', // Встречен в г. транзите
  ACCEPTED_AT_TRANSIT_WAREHOUSE: 'ACCEPTED_AT_TRANSIT_WAREHOUSE', // Принят на склад транзита
  RETURNED_TO_TRANSIT_WAREHOUSE: 'RETURNED_TO_TRANSIT_WAREHOUSE', // Возвращен на склад транзита
  READY_FOR_SHIPMENT_IN_TRANSIT_CITY: 'READY_FOR_SHIPMENT_IN_TRANSIT_CITY', // Выдан на отправку в город-транзит
  TAKEN_BY_TRANSPORTER_FROM_TRANSIT_CITY: 'TAKEN_BY_TRANSPORTER_FROM_TRANSIT_CITY', // Сдан перевозчику в городе-транзите
  SENT_TO_SENDER_CITY: 'SENT_TO_SENDER_CITY', // Отправлен в г. отправителя
  SENT_TO_RECIPIENT_CITY: 'SENT_TO_RECIPIENT_CITY', // Отправлен в г. получателя
  ACCEPTED_IN_SENDER_CITY: 'ACCEPTED_IN_SENDER_CITY', // Встречен в г. отправителе
  ACCEPTED_IN_RECIPIENT_CITY: 'ACCEPTED_IN_RECIPIENT_CITY', // Встречен в г. получателе
  ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE: 'ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE', // Принят на склад доставки
  ACCEPTED_AT_PICK_UP_POINT: 'ACCEPTED_AT_PICK_UP_POINT', // Принят на склад до востребования
  TAKEN_BY_COURIER: 'TAKEN_BY_COURIER', // Выдан на доставку
  RETURNED_TO_RECIPIENT_CITY_WAREHOUSE: 'RETURNED_TO_RECIPIENT_CITY_WAREHOUSE', // Возвращен на склад доставки
  DELIVERED: 'DELIVERED', // Вручен
  NOT_DELIVERED: 'NOT_DELIVERED', // Не вручен
  INVALID: 'INVALID', // Некорректный заказ
  DELETED: 'DELETED', // Удален
} as const;

// Interfaces
export interface CdekLocation {
  code?: number;
  postal_code?: string;
  city?: string;
  address?: string;
  country_code?: string;
  longitude?: number;
  latitude?: number;
}

export interface CdekPackage {
  number?: string;
  weight: number; // grams
  length?: number; // cm
  width?: number; // cm
  height?: number; // cm
  comment?: string;
  items?: CdekItem[];
}

export interface CdekItem {
  name: string;
  ware_key: string;
  payment?: { value: number };
  cost: number;
  weight: number; // grams
  amount: number;
  url?: string;
  marking?: string; // Honest Sign marking code
}

export interface CdekRecipient {
  name: string;
  company?: string;
  email?: string;
  phones: Array<{ number: string }>;
}

export interface CdekSender {
  name: string;
  company?: string;
  email?: string;
  phones: Array<{ number: string }>;
}

export interface CdekTariffResult {
  tariff_code: number;
  tariff_name: string;
  tariff_description?: string;
  delivery_mode: number;
  delivery_sum: number;
  period_min: number;
  period_max: number;
  calendar_min?: number;
  calendar_max?: number;
}

export interface CdekCalculateRequest {
  type?: number; // Order type (1 = online store, 2 = delivery)
  date?: string; // ISO date for calculation
  currency?: number; // 1 = RUB
  tariff_code?: number; // Specific tariff, or omit for all available
  from_location: CdekLocation;
  to_location: CdekLocation;
  packages: Array<{
    weight: number; // grams
    length?: number; // cm
    width?: number; // cm
    height?: number; // cm
  }>;
  services?: Array<{
    code: string;
    parameter?: string;
  }>;
}

export interface CdekOrderRequest {
  type?: number;
  number: string; // Internal order number
  tariff_code: number;
  comment?: string;
  shipment_point?: string; // CDEK office code for pickup
  delivery_point?: string; // CDEK office code for delivery (PVZ)
  from_location?: CdekLocation;
  to_location?: CdekLocation;
  recipient: CdekRecipient;
  sender?: CdekSender;
  packages: CdekPackage[];
  services?: Array<{
    code: string;
    parameter?: string;
  }>;
}

export interface CdekOrderResponse {
  entity?: {
    uuid: string;
    number?: string;
  };
  requests?: Array<{
    request_uuid: string;
    type: string;
    state: string;
    date_time: string;
    errors?: Array<{
      code: string;
      message: string;
    }>;
    warnings?: Array<{
      code: string;
      message: string;
    }>;
  }>;
}

export interface CdekOrderInfo {
  entity: {
    uuid: string;
    type: number;
    cdek_number?: string;
    number?: string;
    tariff_code: number;
    comment?: string;
    shipment_point?: string;
    delivery_point?: string;
    delivery_mode?: string;
    recipient: CdekRecipient;
    sender?: CdekSender;
    from_location?: CdekLocation;
    to_location?: CdekLocation;
    packages: CdekPackage[];
    delivery_detail?: {
      date?: string;
      recipient_name?: string;
      payment_sum?: number;
      delivery_sum?: number;
      total_sum?: number;
    };
    statuses?: Array<{
      code: string;
      name: string;
      date_time: string;
      city?: string;
      reason_code?: string;
    }>;
  };
}

export interface CdekPickupPointInfo {
  code: string;
  name: string;
  type: string; // PVZ, POSTAMAT
  owner_code?: string;
  location: {
    country_code: string;
    region_code?: number;
    region?: string;
    city_code?: number;
    city: string;
    postal_code?: string;
    longitude: number;
    latitude: number;
    address: string;
    address_full?: string;
  };
  work_time?: string;
  work_time_list?: Array<{
    day: number;
    time: string;
  }>;
  phones?: Array<{ number: string }>;
  email?: string;
  note?: string;
  nearest_station?: string;
  nearest_metro_station?: string;
  have_cashless?: boolean;
  have_cash?: boolean;
  allowed_cod?: boolean;
  is_handout?: boolean;
  is_reception?: boolean;
  is_dressing_room?: boolean;
  weight_min?: number;
  weight_max?: number;
  dimensions?: Array<{
    width: number;
    height: number;
    depth: number;
  }>;
  images?: Array<{ url: string }>;
}

// Token management
interface CdekToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: CdekToken | null = null;

class CdekService {
  private baseUrl = CDEK_API_BASE_URL;
  
  private getCredentials(): { clientId: string; clientSecret: string } {
    const isTestMode = process.env.CDEK_TEST_MODE === 'true';
    
    if (isTestMode) {
      return {
        clientId: CDEK_TEST_CLIENT_ID,
        clientSecret: CDEK_TEST_CLIENT_SECRET,
      };
    }
    
    if (!CDEK_CLIENT_ID || !CDEK_CLIENT_SECRET) {
      throw new Error('CDEK credentials not configured. Set CDEK_CLIENT_ID and CDEK_CLIENT_SECRET or enable CDEK_TEST_MODE.');
    }
    
    return {
      clientId: CDEK_CLIENT_ID,
      clientSecret: CDEK_CLIENT_SECRET,
    };
  }
  
  /**
   * Get OAuth 2.0 access token (with caching)
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token (with 5 minute buffer)
    if (cachedToken && cachedToken.expires_at > Date.now() + 5 * 60 * 1000) {
      return cachedToken.access_token;
    }
    
    const { clientId, clientSecret } = this.getCredentials();
    
    const authUrl = this.baseUrl.replace('/v2', '/v2/oauth/token');
    
    console.log(`[CDEK] Requesting new OAuth token from ${authUrl}`);
    
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
    
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CDEK] OAuth token request failed: ${response.status} - ${errorText}`);
      throw new Error(`CDEK OAuth failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Cache the token (expires_in is in seconds)
    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };
    
    console.log(`[CDEK] OAuth token obtained, expires in ${data.expires_in} seconds`);
    
    return data.access_token;
  }
  
  /**
   * Make authenticated API request
   */
  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: any,
    correlationId?: string
  ): Promise<T> {
    const corrId = correlationId || `cdek-${nanoid(12)}`;
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`[CDEK] ${method} ${endpoint}`, { correlationId: corrId, body });
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    
    const options: RequestInit = {
      method,
      headers,
    };
    
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    let responseData: any;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      responseData = { raw: text };
    }
    
    if (!response.ok) {
      console.error(`[CDEK] API error ${response.status}`, { 
        correlationId: corrId,
        endpoint,
        response: responseData 
      });
      
      // Extract error message
      let errorMessage = `CDEK API error ${response.status}`;
      if (responseData?.requests?.[0]?.errors?.[0]?.message) {
        errorMessage = responseData.requests[0].errors[0].message;
      } else if (responseData?.error_description) {
        errorMessage = responseData.error_description;
      } else if (responseData?.message) {
        errorMessage = responseData.message;
      }
      
      throw new Error(errorMessage);
    }
    
    console.log(`[CDEK] ${method} ${endpoint} success`, { correlationId: corrId });
    
    return responseData as T;
  }
  
  /**
   * Calculate delivery cost by all available tariffs
   */
  async calculateByTariffs(request: CdekCalculateRequest): Promise<CdekTariffResult[]> {
    const response = await this.apiRequest<{ tariff_codes: CdekTariffResult[] }>(
      'POST',
      '/calculator/tarifflist',
      {
        ...request,
        type: request.type || CDEK_ORDER_TYPES.ONLINE_STORE,
        currency: request.currency || 1, // RUB
      }
    );
    
    return response.tariff_codes || [];
  }
  
  /**
   * Calculate delivery cost by specific tariff code
   */
  async calculateByTariffCode(request: CdekCalculateRequest): Promise<CdekTariffResult | null> {
    if (!request.tariff_code) {
      throw new Error('tariff_code is required for calculateByTariffCode');
    }
    
    try {
      const response = await this.apiRequest<CdekTariffResult>(
        'POST',
        '/calculator/tariff',
        {
          ...request,
          type: request.type || CDEK_ORDER_TYPES.ONLINE_STORE,
          currency: request.currency || 1, // RUB
        }
      );
      
      return response;
    } catch (error: any) {
      console.error(`[CDEK] calculateByTariffCode failed:`, error.message);
      return null;
    }
  }
  
  /**
   * Get pickup points (PVZ) by city or location
   */
  async getPickupPoints(params: {
    city_code?: number;
    postal_code?: string;
    type?: 'PVZ' | 'POSTAMAT' | 'ALL';
    country_codes?: string;
    region_code?: number;
    have_cashless?: boolean;
    have_cash?: boolean;
    allowed_cod?: boolean;
    is_handout?: boolean;
    is_dressing_room?: boolean;
    weight_max?: number;
    weight_min?: number;
    lang?: string;
    take_only?: boolean; // Only handout points
    is_ltl?: boolean;
    fulfillment?: boolean;
  }): Promise<CdekPickupPointInfo[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    });
    
    const query = queryParams.toString();
    const endpoint = `/deliverypoints${query ? `?${query}` : ''}`;
    
    const response = await this.apiRequest<CdekPickupPointInfo[]>('GET', endpoint);
    
    return response || [];
  }
  
  /**
   * Get cities list (for autocomplete)
   */
  async getCities(params: {
    country_codes?: string;
    region_code?: number;
    city?: string;
    postal_code?: string;
    code?: number;
    size?: number;
    page?: number;
  }): Promise<Array<{
    code: number;
    city: string;
    country_code: string;
    region_code: number;
    region: string;
    postal_codes?: string[];
    longitude: number;
    latitude: number;
  }>> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    });
    
    const query = queryParams.toString();
    const endpoint = `/location/cities${query ? `?${query}` : ''}`;
    
    const response = await this.apiRequest<any[]>('GET', endpoint);
    
    return response || [];
  }
  
  /**
   * Create a new delivery order
   */
  async createOrder(request: CdekOrderRequest): Promise<CdekOrderResponse> {
    // Generate unique order number if not provided
    const orderNumber = request.number || `DG-${Date.now()}-${nanoid(6)}`;
    
    const orderData = {
      ...request,
      number: orderNumber,
      type: request.type || CDEK_ORDER_TYPES.ONLINE_STORE,
    };
    
    console.log(`[CDEK] Creating order ${orderNumber}`);
    
    const response = await this.apiRequest<CdekOrderResponse>('POST', '/orders', orderData);
    
    // Check for errors in response
    if (response.requests?.[0]?.errors?.length) {
      const errors = response.requests[0].errors.map(e => e.message).join(', ');
      throw new Error(`CDEK order creation failed: ${errors}`);
    }
    
    console.log(`[CDEK] Order created`, {
      uuid: response.entity?.uuid,
      number: orderNumber,
    });
    
    return response;
  }
  
  /**
   * Get order information by UUID
   */
  async getOrderByUuid(uuid: string): Promise<CdekOrderInfo> {
    const response = await this.apiRequest<CdekOrderInfo>('GET', `/orders/${uuid}`);
    return response;
  }
  
  /**
   * Get order information by internal number
   */
  async getOrderByNumber(number: string): Promise<CdekOrderInfo> {
    const response = await this.apiRequest<CdekOrderInfo>('GET', `/orders?im_number=${number}`);
    return response;
  }
  
  /**
   * Get order information by CDEK number
   */
  async getOrderByCdekNumber(cdekNumber: string): Promise<CdekOrderInfo> {
    const response = await this.apiRequest<CdekOrderInfo>('GET', `/orders?cdek_number=${cdekNumber}`);
    return response;
  }
  
  /**
   * Delete an order
   */
  async deleteOrder(uuid: string): Promise<CdekOrderResponse> {
    const response = await this.apiRequest<CdekOrderResponse>('DELETE', `/orders/${uuid}`);
    return response;
  }
  
  /**
   * Refund an order (for cash on delivery)
   */
  async refundOrder(uuid: string): Promise<CdekOrderResponse> {
    const response = await this.apiRequest<CdekOrderResponse>('POST', `/orders/${uuid}/refund`);
    return response;
  }
  
  /**
   * Register webhook for order status updates
   */
  async registerWebhook(webhookUrl: string, eventTypes?: string[]): Promise<any> {
    const types = eventTypes || [
      'ORDER_STATUS', // Order status changed
      'PRINT_FORM', // Print form ready
    ];
    
    const response = await this.apiRequest<any>('POST', '/webhooks', {
      url: webhookUrl,
      type: types.join(','),
    });
    
    return response;
  }
  
  /**
   * Get registered webhooks
   */
  async getWebhooks(): Promise<any[]> {
    const response = await this.apiRequest<any[]>('GET', '/webhooks');
    return response || [];
  }
  
  /**
   * Delete a webhook
   */
  async deleteWebhook(uuid: string): Promise<void> {
    await this.apiRequest<void>('DELETE', `/webhooks/${uuid}`);
  }
  
  /**
   * Get barcode/label for order (PDF)
   */
  async getOrderBarcode(uuid: string): Promise<{ url?: string; error?: string }> {
    try {
      // Request barcode generation
      const printRequest = await this.apiRequest<CdekOrderResponse>('POST', '/print/orders', {
        orders: [{ order_uuid: uuid }],
        copy_count: 1,
      });
      
      const requestUuid = printRequest.entity?.uuid;
      if (!requestUuid) {
        return { error: 'Failed to initiate barcode generation' };
      }
      
      // Poll for result (CDEK generates PDF asynchronously)
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds
        
        const result = await this.apiRequest<{
          entity?: { url?: string };
          requests?: Array<{ state: string }>;
        }>('GET', `/print/orders/${requestUuid}`);
        
        if (result.entity?.url) {
          return { url: result.entity.url };
        }
        
        const state = result.requests?.[0]?.state;
        if (state === 'INVALID' || state === 'FAIL') {
          return { error: 'Barcode generation failed' };
        }
      }
      
      return { error: 'Barcode generation timeout' };
    } catch (error: any) {
      return { error: error.message };
    }
  }
  
  /**
   * Call courier for pickup (intake request)
   */
  async callCourier(params: {
    order_uuid?: string;
    cdek_number?: string;
    intake_date: string; // YYYY-MM-DD
    intake_time_from: string; // HH:MM
    intake_time_to: string; // HH:MM
    name: string;
    phone: string;
    sender_address?: string;
    comment?: string;
  }): Promise<any> {
    const response = await this.apiRequest<any>('POST', '/intakes', {
      order_uuid: params.order_uuid,
      cdek_number: params.cdek_number,
      intake_date: params.intake_date,
      intake_time_from: params.intake_time_from,
      intake_time_to: params.intake_time_to,
      sender: {
        name: params.name,
        phones: [{ number: params.phone }],
      },
      from_location: params.sender_address ? { address: params.sender_address } : undefined,
      comment: params.comment,
    });
    
    return response;
  }
  
  /**
   * Check if CDEK service is configured and available
   */
  async checkHealth(): Promise<{ ok: boolean; message: string; mode: string }> {
    try {
      const isTestMode = process.env.CDEK_TEST_MODE === 'true';
      const mode = isTestMode ? 'test' : 'production';
      
      // Try to get an access token
      await this.getAccessToken();
      
      // Try a simple API call
      await this.getCities({ country_codes: 'RU', size: 1 });
      
      return {
        ok: true,
        message: 'CDEK service is operational',
        mode,
      };
    } catch (error: any) {
      return {
        ok: false,
        message: error.message || 'CDEK service check failed',
        mode: process.env.CDEK_TEST_MODE === 'true' ? 'test' : 'production',
      };
    }
  }
  
  /**
   * Get human-readable status description in Russian
   */
  getStatusDescription(statusCode: string): string {
    const statusDescriptions: Record<string, string> = {
      'CREATED': 'Заказ создан',
      'RECEIVED_AT_SHIPMENT_WAREHOUSE': 'Принят на склад отправителя',
      'READY_FOR_SHIPMENT_IN_SENDER_CITY': 'Выдан на отправку в городе-отправителе',
      'SENT_TO_RECIPIENT_CITY': 'Отправлен в город получателя',
      'ACCEPTED_IN_RECIPIENT_CITY': 'Встречен в городе получателя',
      'ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE': 'Принят на склад доставки',
      'ACCEPTED_AT_PICK_UP_POINT': 'Принят на склад до востребования',
      'TAKEN_BY_COURIER': 'Выдан курьеру',
      'DELIVERED': 'Вручен',
      'NOT_DELIVERED': 'Не вручен',
      'RETURNED_TO_SENDER_CITY_WAREHOUSE': 'Возвращен на склад отправителя',
      'INVALID': 'Некорректный заказ',
      'DELETED': 'Удален',
    };
    
    return statusDescriptions[statusCode] || statusCode;
  }
  
  /**
   * Helper: Create a standard e-commerce order for Don Giulio
   * Uses door-to-door pickup (CDEK comes to collect packages)
   */
  async createDonGiulioOrder(params: {
    orderId: string;
    recipientName: string;
    recipientPhone: string;
    recipientEmail?: string;
    deliveryCity: string;
    deliveryAddress?: string;
    deliveryPvzCode?: string;
    tariffCode: number;
    items: Array<{
      name: string;
      sku: string;
      price: number;
      weight: number; // grams
      quantity: number;
      markingCode?: string;
    }>;
    totalWeight: number; // grams
    comment?: string;
    // Sender/Pickup address (from database)
    senderAddress: {
      fullAddress: string;
      city: string;
      postalCode?: string;
      contactName: string;
      contactPhone: string;
      latitude?: string;
      longitude?: string;
    };
  }): Promise<CdekOrderResponse> {
    const isPvzDelivery = !!params.deliveryPvzCode;
    
    // Prepare packages with items
    const packages: CdekPackage[] = [{
      number: `${params.orderId}-1`,
      weight: params.totalWeight,
      length: 30,
      width: 20,
      height: 20,
      items: params.items.map(item => ({
        name: item.name,
        ware_key: item.sku,
        cost: item.price,
        weight: item.weight,
        amount: item.quantity,
        marking: item.markingCode,
      })),
    }];
    
    const orderRequest: CdekOrderRequest = {
      number: params.orderId,
      tariff_code: params.tariffCode,
      comment: params.comment || `Заказ ${params.orderId} от Don Giulio Select`,
      recipient: {
        name: params.recipientName,
        email: params.recipientEmail,
        phones: [{ number: params.recipientPhone }],
      },
      sender: {
        name: params.senderAddress.contactName,
        phones: [{ number: params.senderAddress.contactPhone }],
      },
      // Use from_location for door-to-door pickup (CDEK comes to collect)
      from_location: {
        city: params.senderAddress.city,
        address: params.senderAddress.fullAddress,
        postal_code: params.senderAddress.postalCode,
        longitude: params.senderAddress.longitude ? parseFloat(params.senderAddress.longitude) : undefined,
        latitude: params.senderAddress.latitude ? parseFloat(params.senderAddress.latitude) : undefined,
      },
      packages,
    };
    
    // Set delivery location
    if (isPvzDelivery) {
      orderRequest.delivery_point = params.deliveryPvzCode;
    } else {
      orderRequest.to_location = {
        city: params.deliveryCity,
        address: params.deliveryAddress,
      };
    }
    
    console.log(`[CDEK] Creating order with from_location (door pickup):`, {
      city: params.senderAddress.city,
      address: params.senderAddress.fullAddress,
      contact: params.senderAddress.contactName,
    });
    
    return this.createOrder(orderRequest);
  }
}

// Export singleton instance
export const cdekService = new CdekService();

// Export class for testing
export { CdekService };
