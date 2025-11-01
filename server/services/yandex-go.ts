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

// Yandex Go Доставка для бизнеса - Business taxi delivery service
// Docs: https://yandex.com/dev/logistics/api/ref/v2/
// Production endpoint: https://b2b.taxi.yandex.net/b2b/cargo/integration/v2
// IMPORTANTE: Yandex Go e Yandex Dostavka usano GLI STESSI ENDPOINT ma token DIVERSI
// - Yandex Dostavka: Token per servizio "courier" (corriere a piedi/bicicletta)
// - Yandex Go: Token per servizio "express" (corriere in auto)
const YANDEX_GO_BASE_URL = 'https://b2b.taxi.yandex.net/b2b/cargo/integration/v2';

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
  currency_rules: {
    code: string;
    sign: string;
    template: string;
    text: string;
  };
  distance_meters: number;
  eta: number;
  offer_id: string;
  all_offers: any[];
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
  comment?: string;
  emergency_contact?: {
    phone: string;
    name: string;
  };
  offer_id?: string;
  selected_offer?: any;
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
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  /**
   * Get OAuth access token (supports both static token and OAuth flow)
   * Follows official Yandex Go documentation
   */
  private async getAccessToken(): Promise<string> {
    // Check for static token first (simpler approach)
    const staticToken = process.env.YANDEX_GO_TOKEN;
    if (staticToken) {
      return staticToken;
    }

    // OAuth Client Credentials flow (if configured)
    const clientId = process.env.YANDEX_GO_CLIENT_ID;
    const clientSecret = process.env.YANDEX_GO_CLIENT_SECRET;
    const tokenUrl = process.env.YANDEX_OAUTH_TOKEN_URL || 'https://oauth.yandex.ru/token';

    if (!clientId || !clientSecret) {
      throw new Error(
        'YANDEX_GO_TOKEN o (YANDEX_GO_CLIENT_ID + YANDEX_GO_CLIENT_SECRET) devono essere configurati. ' +
        'Aggiungi le credenziali nei secrets di Replit.'
      );
    }

    // Check if we have a valid cached token
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    // Request new token via OAuth
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OAuth token request failed: ${error}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('OAuth response missing access_token');
    }
    
    this.accessToken = data.access_token;
    const expiresInSec = data.expires_in || 3600;
    this.tokenExpiresAt = now + expiresInSec * 1000;

    return this.accessToken!
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ru',
    };
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

    // IMPORTANTE: Yandex Go usa gli STESSI endpoint di Yandex Dostavka
    const url = `${this.baseUrl}/offers/calculate`;
    const idempotencyKey = generateIdempotencyKey();
    
    const headers = {
      ...(await this.getHeaders()),
      'X-Idempotency-Key': idempotencyKey,
    };
    
    logger.info('Starting price calculation', { idempotencyKey });

    try {
      const data = await withRetry(async () => {
        const response = await yandexFetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(request),
        }, logger, corrId);

        return await response.json();
      }, {}, corrId);
      
      // Log TUTTE le tariffe disponibili da Yandex prima del filtro
      logger.info('Price calculation response received', {
        offersCount: data.offers?.length || 0,
        allAvailableDescriptions: data.offers?.map((o: any) => o.description) || []
      });

      // Filtra le tariffe desiderate - STESSA LOGICA di Yandex Dostavka
      const allowedTariffs = [
        'express',
        'express_30min_longer', 
        'express_60min_longer',
        '2_hours_delivery',
        '4_hours_delivery',
      ];
      
      const filteredOffers = data.offers?.filter((offer: any) => 
        allowedTariffs.includes(offer.description)
      ) || [];
      
      // Se non ci sono offerte filtrate, usa tutte le offerte disponibili
      const availableOffers = filteredOffers.length > 0 ? filteredOffers : data.offers;
      
      const bestOffer = availableOffers?.[0];
      if (!bestOffer) {
        throw new Error('No delivery offers available');
      }
      
      logger.info('Selected offer', {
        taxiClass: bestOffer.taxi_class,
        description: bestOffer.description,
        filteredOffersCount: filteredOffers.length,
        totalOffersCount: data.offers?.length || 0,
        filteredDescriptions: filteredOffers.map((o: any) => o.description)
      });

      // Estrai prezzo e valuta dal campo price
      const currency = bestOffer.price?.currency || 'RUB';
      const totalPrice = bestOffer.price?.total_price || '0';

      // Calcola ETA in secondi dalla differenza tra delivery e pickup
      let etaSeconds = 0;
      if (bestOffer.delivery_interval?.to && bestOffer.pickup_interval?.from) {
        const deliveryTime = new Date(bestOffer.delivery_interval.to).getTime();
        const pickupTime = new Date(bestOffer.pickup_interval.from).getTime();
        etaSeconds = Math.round((deliveryTime - pickupTime) / 1000);
      }

      // Calcola distanza approssimativa dalle coordinate
      let distanceMeters = 0;
      if (request.route_points && request.route_points.length >= 2) {
        const pickup = request.route_points[0];
        const delivery = request.route_points[1];
        if (pickup.coordinates && delivery.coordinates) {
          const R = 6371000; // Earth radius in meters
          const lat1 = pickup.coordinates[1] * Math.PI / 180;
          const lat2 = delivery.coordinates[1] * Math.PI / 180;
          const dLat = (delivery.coordinates[1] - pickup.coordinates[1]) * Math.PI / 180;
          const dLon = (delivery.coordinates[0] - pickup.coordinates[0]) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          distanceMeters = Math.round(R * c);
        }
      }

      return {
        price: totalPrice,
        currency_rules: {
          code: currency,
          sign: currency === 'RUB' ? '₽' : currency,
          template: '$VALUE$ $SIGN$$CURRENCY$',
          text: currency,
        },
        distance_meters: distanceMeters,
        eta: etaSeconds,
        offer_id: bestOffer.payload || '', // payload è l'offer_id di Yandex
        all_offers: filteredOffers.length > 0 ? filteredOffers : data.offers, // Offerte filtrate
      };
    } catch (error) {
      logger.error('Yandex Go checkPrice error', { error });
      throw error;
    }
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

    // IMPORTANTE: Yandex Go usa gli STESSI endpoint di Yandex Dostavka
    const url = `${this.baseUrl}/claims/create`;
    
    const headers = {
      ...(await this.getHeaders()),
      'X-Idempotency-Key': idempotencyKey,
    };
    
    // Costruisci il payload finale con la struttura corretta per Yandex
    // IMPORTANTE: Il campo si chiama "offer_payload" secondo la documentazione ufficiale!
    const { offer_id, selected_offer, ...cleanedRequest } = request;
    const finalPayload: any = {
      ...cleanedRequest,
    };
    
    // Se c'è un offer_id, passalo come "offer_payload"
    if (offer_id) {
      finalPayload.offer_payload = offer_id;
    }

    // Aggiungi callback URL e webhook secret (seguendo doc ufficiale)
    const webhookSecret = process.env.YANDEX_WEBHOOK_SECRET;
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.REPL_SLUG 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : 'http://localhost:5000';
    
    if (webhookSecret) {
      finalPayload.callback_url = `${publicBaseUrl}/api/webhooks/yandex-go`;
      finalPayload.webhook_secret = webhookSecret;
      logger.info('Webhook configured', { 
        callbackUrl: finalPayload.callback_url 
      });
    }
    
    logger.info('Creating claim', { 
      requestId, 
      idempotencyKey,
      offerId: request.offer_id,
      offerPayload: finalPayload.offer_payload,
      payloadPreview: {
        hasItems: !!request.items?.length,
        hasRoutePoints: !!request.route_points?.length,
        hasComment: !!request.comment,
        hasOfferPayload: !!finalPayload.offer_payload
      }
    });

    try {
      const data = await withRetry(async () => {
        // Log the exact payload being sent
        const payload = JSON.stringify(finalPayload);
        logger.info('Sending payload to Yandex', { 
          payloadLength: payload.length,
          hasOfferPayload: !!finalPayload.offer_payload,
          offerPayloadValue: finalPayload.offer_payload,
          actualPayload: finalPayload
        });
        
        const response = await yandexFetch(url, {
          method: 'POST',
          headers,
          body: payload,
        }, logger, corrId);

        return await response.json();
      }, {}, corrId);

      logger.info('Claim created successfully', {
        claimId: data.id,
        status: data.status
      });

      return data;
    } catch (error) {
      logger.error('Create claim failed', { error });
      throw error;
    }
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

    // IMPORTANTE: Yandex Go usa gli STESSI endpoint di Yandex Dostavka
    const url = `${this.baseUrl}/claims/info?claim_id=${claimId}`;
    
    logger.info('Getting claim info');

    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'GET',
        headers: await this.getHeaders(),
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

    const url = `${this.baseUrl}/claims/accept?claim_id=${claimId}`;
    
    const headers = {
      ...(await this.getHeaders()),
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

    const url = `${this.baseUrl}/claims/cancel-info?claim_id=${claimId}`;
    
    logger.info('Getting cancel info');

    const data = await withRetry(async () => {
      const response = await yandexFetch(url, {
        method: 'POST',
        headers: await this.getHeaders(),
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

    // IMPORTANTE: Yandex Go usa gli STESSI endpoint di Yandex Dostavka
    const url = `${this.baseUrl}/claims/cancel?claim_id=${claimId}`;
    
    const headers = {
      ...(await this.getHeaders()),
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
