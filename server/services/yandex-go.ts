import {
  generateIdempotencyKey,
  generateRequestId,
  generateCorrelationId,
  withRetry,
  validateCoordinates,
  validatePackage,
  YandexLogger,
  yandexFetch,
} from '../utils/yandex-integration';

// Yandex Go Cargo API 2.0 - Taxi-based delivery service
// Docs: https://yandex.com/dev/logistics/api/ref/v2/
// Production endpoint: https://b2b.taxi.yandex.net (same as Dostavka)
// Testing with YANDEX_GO_TOKEN to see if it has Cargo API permissions
const YANDEX_GO_BASE_URL = 'https://b2b.taxi.yandex.net';
const YANDEX_GO_TOKEN = process.env.YANDEX_GO_TOKEN; // Testing original Go token
const YANDEX_GO_CLIENT_ID = process.env.YANDEX_GO_CLIENT_ID;

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c); // Distance in km
}

export interface YandexGoCheckPriceRequest {
  items: Array<{
    quantity: number;
    size: {
      length: number;  // meters
      width: number;   // meters
      height: number;  // meters
    };
    weight: number;  // kg
  }>;
  route_points: Array<{
    coordinates: [number, number]; // [longitude, latitude]
    fullname: string; // Full address (official docs format)
    city?: string;
    street?: string;
    building?: string;
    porch?: string;
    sflat?: string;
    sfloor?: string;
    id?: number;
  }>;
  requirements?: {
    taxi_classes?: string[];
    cargo_type?: string;
    cargo_options?: string[];
    cargo_loaders?: number;
    pro_courier?: boolean;
    skip_door_to_door?: boolean;
  };
}

export interface YandexGoCheckPriceResponse {
  price: string;
  price_raw: number;
  currency: string;
  distance: number;
  time: number;
}

export interface YandexGoClaimRequest {
  items: Array<{
    quantity: number;
    size: {
      length: number;
      width: number;
      height: number;
    };
    weight: number;
    cost_value?: string;
    cost_currency?: string;
    title?: string;
  }>;
  route_points: Array<{
    coordinates: [number, number];
    fullname: string;
    contact: {
      phone: string;
      name: string;
      email?: string;
    };
    type: 'source' | 'destination';
    visit_order: number;
  }>;
  optional_return?: boolean;
  skip_door_to_door?: boolean;
  requirements?: {
    taxi_class?: string;
  };
  comment?: string;
  emergency_contact?: {
    phone: string;
    name: string;
  };
}

export interface YandexGoClaimResponse {
  id: string;
  status: string;
  version: number;
  user_request_revision?: string;
  skip_client_notify?: boolean;
  items: Array<any>;
  route_points: Array<any>;
  available_cancel_state?: string;
  same_day_data?: {
    delivery_interval: {
      from: string;
      to: string;
    };
  };
  pricing?: {
    offer?: {
      offer_id: string;
      price: string;
      price_raw: number;
    };
    currency: string;
    final_price?: string;
  };
  performer_info?: {
    courier_name?: string;
    legal_name?: string;
    car_model?: string;
    car_number?: string;
  };
  created_ts: string;
  updated_ts: string;
}

export interface YandexGoCancelInfoResponse {
  cancel_state: string;
  cancellation_fee?: string;
  free_cancellation_available: boolean;
}

export class YandexGoService {
  private baseUrl = YANDEX_GO_BASE_URL;
  private token = YANDEX_GO_TOKEN;
  private clientId = YANDEX_GO_CLIENT_ID;

  private getHeaders(apiVersion: 'v1' | 'v2' = 'v2'): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ru',
    };

    if (apiVersion === 'v1') {
      // V1 API (check-price) usa ENTRAMBI Client-Id e Bearer token
      if (!this.clientId) {
        throw new Error('Yandex Go Client ID not configured (YANDEX_GO_CLIENT_ID)');
      }
      if (!this.token) {
        throw new Error('Yandex Go OAuth token not configured (YANDEX_GO_TOKEN)');
      }
      headers['X-B2B-Client-Id'] = this.clientId.trim();
      headers['Authorization'] = `Bearer ${this.token.trim()}`;
    } else {
      // V2 API (claims/create, claims/accept, etc.) usa solo Bearer token
      if (!this.token) {
        throw new Error('Yandex Go OAuth token not configured (YANDEX_GO_TOKEN)');
      }
      headers['Authorization'] = `Bearer ${this.token.trim()}`;
    }

    return headers;
  }

  /**
   * Calculate delivery price (step 1)
   * API V2: offers/calculate (identical to Yandex Dostavka - same service!)
   * Docs: https://yandex.ru/support/taxi-for-business/api/
   */
  async checkPrice(request: YandexGoCheckPriceRequest, correlationId?: string): Promise<YandexGoCheckPriceResponse> {
    const corrId = correlationId || generateCorrelationId();
    const logger = new YandexLogger({
      correlationId: corrId,
      service: 'yandex-go',
      operation: 'checkPrice',
    });

    // Validate coordinates
    for (let i = 0; i < request.route_points.length; i++) {
      const point = request.route_points[i];
      const validation = validateCoordinates(point.coordinates, `route_points[${i}].coordinates`);
      if (!validation.valid) {
        logger.error('Coordinate validation failed', { errors: validation.errors });
        throw new Error(`Validazione coordinate fallita: ${validation.errors.join(', ')}`);
      }
    }

    // Validate packages
    for (let i = 0; i < request.items.length; i++) {
      const item = request.items[i];
      const validation = validatePackage(item);
      if (!validation.valid) {
        logger.error('Package validation failed', { errors: validation.errors });
        throw new Error(`Validazione pacco fallita: ${validation.errors.join(', ')}`);
      }
    }

    const url = `${this.baseUrl}/b2b/cargo/integration/v2/offers/calculate`;
    const idempotencyKey = generateIdempotencyKey();
    
    const headers = {
      ...this.getHeaders('v2'), // V2 = only Bearer token (no Client-Id)
      'X-Idempotency-Key': idempotencyKey,
    };
    
    logger.info('Starting price calculation', { 
      url, 
      routePoints: request.route_points.length,
      items: request.items.length,
      idempotencyKey
    });

    // Wrap in retry logic
    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(request),
      }, logger, corrId);

      return await response.json();
    }, {}, corrId);
    logger.info('Price calculation response received', { 
      offersCount: data.offers?.length || 0 
    });
    
    // Parse Yandex response - API returns { offers: [...] }
    if (!data.offers || !Array.isArray(data.offers) || data.offers.length === 0) {
      logger.warn('No offers available');
      throw new Error('Nessuna offerta di consegna disponibile per questo percorso');
    }
    
    // Extract best offer (first one is usually the best/cheapest)
    const bestOffer = data.offers[0];
    
    // Extract pricing from offer - price is a nested object
    // Structure: { price: { total_price, total_price_with_vat, surge_ratio, currency } }
    let priceValue = 0;
    let currency = 'RUB';
    
    if (bestOffer.price && typeof bestOffer.price === 'object') {
      // Price is an object with total_price field
      priceValue = parseFloat(bestOffer.price.total_price || bestOffer.price.total_price_with_vat || '0');
      currency = bestOffer.price.currency || 'RUB';
    } else if (typeof bestOffer.price === 'number' || typeof bestOffer.price === 'string') {
      // Fallback: price is a simple value
      priceValue = parseFloat(bestOffer.price);
    }
    
    const priceFormatted = priceValue.toFixed(2);
    
    // Calculate distance using Haversine formula from request coordinates
    let distance = 0;
    if (request.route_points && request.route_points.length >= 2) {
      const pickup = request.route_points[0];
      const delivery = request.route_points[1];
      if (pickup.coordinates && delivery.coordinates) {
        // coordinates are [longitude, latitude]
        distance = calculateDistance(
          pickup.coordinates[1], pickup.coordinates[0],
          delivery.coordinates[1], delivery.coordinates[0]
        );
      }
    }
    
    // Calculate delivery time from intervals
    let time = 0;
    
    // Extract delivery time from delivery_interval
    if (bestOffer.delivery_interval && typeof bestOffer.delivery_interval === 'object') {
      // delivery_interval might have 'from' and 'to' timestamps
      // Calculate time difference or use estimated delivery time
      const from = bestOffer.delivery_interval.from;
      const to = bestOffer.delivery_interval.to;
      if (from && to) {
        const fromTime = new Date(from).getTime();
        const toTime = new Date(to).getTime();
        time = Math.round((toTime - fromTime) / 60000); // milliseconds to minutes
      }
    }
    
    // If no time from interval, use pickup_interval
    if (time === 0 && bestOffer.pickup_interval && typeof bestOffer.pickup_interval === 'object') {
      const from = bestOffer.pickup_interval.from;
      const to = bestOffer.pickup_interval.to;
      if (from && to) {
        const fromTime = new Date(from).getTime();
        const toTime = new Date(to).getTime();
        time = Math.round((toTime - fromTime) / 60000); // milliseconds to minutes
      }
    }
    
    return {
      price: priceFormatted,
      price_raw: priceValue,
      currency: currency,
      distance: distance,
      time: time,
    };
  }

  /**
   * Create delivery claim (step 2)
   */
  async createClaim(
    request: YandexGoClaimRequest, 
    orderId?: string,
    correlationId?: string
  ): Promise<YandexGoClaimResponse> {
    const corrId = correlationId || generateCorrelationId();
    const requestId = generateRequestId();
    const idempotencyKey = generateIdempotencyKey();
    
    const logger = new YandexLogger({
      correlationId: corrId,
      requestId,
      idempotencyKey,
      service: 'yandex-go',
      operation: 'createClaim',
      orderId,
    });

    // Validate route points
    for (const point of request.route_points) {
      const validation = validateCoordinates(point.coordinates, `${point.type} coordinates`);
      if (!validation.valid) {
        logger.error('Route point validation failed', { errors: validation.errors });
        throw new Error(`Validazione punto percorso fallita: ${validation.errors.join(', ')}`);
      }
    }

    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/create?request_id=${requestId}`;
    
    const headers = {
      ...this.getHeaders(),
      'X-Idempotency-Key': idempotencyKey,
    };
    
    logger.info('Creating claim', { url, requestId, idempotencyKey });

    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      }, logger, corrId);

      return await response.json();
    }, {}, corrId);

    logger.info('Claim created successfully', {
      claimId: data.id,
      status: data.status,
      pricing: data.pricing
    });
    
    return data;
  }

  /**
   * Get claim info (step 3)
   */
  async getClaimInfo(claimId: string, correlationId?: string): Promise<YandexGoClaimResponse> {
    const corrId = correlationId || generateCorrelationId();
    const logger = new YandexLogger({
      correlationId: corrId,
      service: 'yandex-go',
      operation: 'getClaimInfo',
      claimId,
    });

    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/info?claim_id=${claimId}`;
    
    logger.info('Getting claim info');

    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      }, logger, corrId);

      return await response.json();
    }, {}, corrId);

    logger.info('Claim info retrieved', {
      status: data.status,
      performer: data.performer_info
    });
    
    return data;
  }

  /**
   * Accept claim (step 4)
   */
  async acceptClaim(claimId: string, version: number, correlationId?: string): Promise<YandexGoClaimResponse> {
    const corrId = correlationId || generateCorrelationId();
    const idempotencyKey = generateIdempotencyKey();
    
    const logger = new YandexLogger({
      correlationId: corrId,
      idempotencyKey,
      service: 'yandex-go',
      operation: 'acceptClaim',
      claimId,
    });

    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/accept?claim_id=${claimId}`;
    
    const headers = {
      ...this.getHeaders(),
      'X-Idempotency-Key': idempotencyKey,
    };
    
    logger.info('Accepting claim', { version });

    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ version }),
      }, logger, corrId);

      return await response.json();
    }, {}, corrId);

    logger.info('Claim accepted', { status: data.status });
    
    return data;
  }

  /**
   * Get cancel info
   */
  async getCancelInfo(claimId: string, correlationId?: string): Promise<YandexGoCancelInfoResponse> {
    const corrId = correlationId || generateCorrelationId();
    const logger = new YandexLogger({
      correlationId: corrId,
      service: 'yandex-go',
      operation: 'getCancelInfo',
      claimId,
    });

    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/cancel-info?claim_id=${claimId}`;
    
    logger.info('Getting cancel info');

    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
      }, logger, corrId);

      return await response.json();
    }, {}, corrId);

    logger.info('Cancel info retrieved', { 
      cancelState: data.cancel_state,
      freeCancellation: data.free_cancellation_available 
    });

    return data;
  }

  /**
   * Cancel claim
   */
  async cancelClaim(claimId: string, version: number, cancelState?: string, correlationId?: string): Promise<YandexGoClaimResponse> {
    const corrId = correlationId || generateCorrelationId();
    const idempotencyKey = generateIdempotencyKey();
    
    const logger = new YandexLogger({
      correlationId: corrId,
      idempotencyKey,
      service: 'yandex-go',
      operation: 'cancelClaim',
      claimId,
    });

    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/cancel?claim_id=${claimId}`;
    
    const headers = {
      ...this.getHeaders(),
      'X-Idempotency-Key': idempotencyKey,
    };
    
    logger.info('Cancelling claim', { version, cancelState });

    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          version: version,
          cancel_state: cancelState,
        }),
      }, logger, corrId);

      return await response.json();
    }, {}, corrId);

    logger.info('Claim cancelled', { status: data.status });
    
    return data;
  }
}

export const yandexGoService = new YandexGoService();
