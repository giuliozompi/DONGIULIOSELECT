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

// Yandex Dostavka API - Express/Courier service for small packages
// Docs: https://yandex.ru/support/delivery-profile/ru/api/express/quickstart
// Production endpoint: https://b2b.taxi.yandex.net (stesso endpoint di Yandex Go)
const YANDEX_DELIVERY_BASE_URL = 'https://b2b.taxi.yandex.net/b2b/cargo/integration/v2';
const YANDEX_DELIVERY_TOKEN = process.env.YANDEX_DOSTAVKA_TOKEN;
const YANDEX_DELIVERY_CLIENT_ID = process.env.YANDEX_DOSTAVKA_CLIENT_ID;

export interface YandexDeliveryItem {
  extra_id?: string; // ID ordine cliente per riferimento
  title: string; // Descrizione dell'item
  quantity: number;
  weight: number;  // kg
  size: {
    length: number;  // meters
    width: number;   // meters
    height: number;  // meters
  };
  pickup_point: number; // point_id del punto di prelievo (source)
  droppof_point: number; // point_id del punto di consegna (destination) - nota: typo ufficiale Yandex
  cost_value: string; // Valore dichiarato per l'assicurazione
  cost_currency: string; // Valuta (es. RUB)
}

export interface YandexDeliveryRoutePoint {
  point_id: number; // ID univoco del punto (1, 2, 3, ...)
  visit_order: number; // Ordine di visita (1, 2, 3, ...)
  coordinates: [number, number]; // [longitude, latitude]
  type: 'source' | 'destination';
  address: {
    fullname: string;
    coordinates: [number, number];
  };
  contact: {
    name: string;
    phone: string;
    email?: string;
  };
}

export interface YandexDeliveryOffer {
  price: {
    total_price: string;
    total_price_with_vat: string;
    surge_ratio: number;
    currency: string;
  };
  taxi_class: string;
  pickup_interval: {
    from: string;
    to: string;
  };
  delivery_interval: {
    from: string;
    to: string;
  };
  description: string;
  payload: string; // Questo è l'offer_id di Yandex
  offer_ttl: string;
}

export interface YandexDeliveryCalculateResponse {
  offers: YandexDeliveryOffer[];
}

export interface YandexDeliveryClaimResponse {
  id: string;
  status: string;
  version: number;
  items: YandexDeliveryItem[];
  route_points: YandexDeliveryRoutePoint[];
  pricing?: {
    currency: string;
    currency_rules: {
      code: string;
      sign: string;
      template: string;
      text: string;
    };
    offer?: {
      offer_id: string;
      price: string;
    };
  };
  performer_info?: {
    courier_name: string;
    car_model?: string;
    car_number?: string;
  };
  created_ts: string;
  updated_ts: string;
}

class YandexDostavkaService {
  private baseUrl = YANDEX_DELIVERY_BASE_URL;
  private token = YANDEX_DELIVERY_TOKEN;
  private clientId = YANDEX_DELIVERY_CLIENT_ID;

  private getHeaders(): Record<string, string> {
    if (!this.token) {
      throw new Error('Yandex Dostavka OAuth token not configured');
    }

    // Trim token per rimuovere spazi accidentali
    const cleanToken = this.token.trim();

    // Formato Bearer token ufficiale Yandex Dostavka
    // Endpoint: https://b2b.taxi.yandex.net (stesso di Yandex Go)
    // Token da: Dashboard Yandex Dostavka → Интеграции → Получить токен
    return {
      'Authorization': `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ru',
    };
  }

  /**
   * Calcola distanza tra due coordinate GPS usando la formula Haversine
   * @param coord1 [longitude, latitude]
   * @param coord2 [longitude, latitude]
   * @returns distanza in metri
   */
  private calculateDistance(coord1: [number, number], coord2: [number, number]): number {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    const R = 6371e3; // Raggio Terra in metri
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c); // distanza in metri
  }

  /**
   * Calculate delivery price and options
   * Yandex Dostavka API - for small packages/express courier
   */
  async checkPrice(
    pickupCoords: [number, number],
    deliveryCoords: [number, number],
    items?: any[],
    requirements?: any,
    correlationId?: string
  ): Promise<any> {
    const corrId = correlationId || generateCorrelationId();
    const logger = new YandexLogger({
      correlationId: corrId,
      service: 'yandex-dostavka',
      operation: 'checkPrice',
    });

    // Validate coordinates
    const pickupValidation = validateCoordinates(pickupCoords, 'pickupCoords');
    if (!pickupValidation.valid) {
      logger.error('Pickup coordinate validation failed', { errors: pickupValidation.errors });
      throw new Error(`Validazione coordinate pickup fallita: ${pickupValidation.errors.join(', ')}`);
    }

    const deliveryValidation = validateCoordinates(deliveryCoords, 'deliveryCoords');
    if (!deliveryValidation.valid) {
      logger.error('Delivery coordinate validation failed', { errors: deliveryValidation.errors });
      throw new Error(`Validazione coordinate consegna fallita: ${deliveryValidation.errors.join(', ')}`);
    }

    const url = `${this.baseUrl}/offers/calculate`;
    const idempotencyKey = generateIdempotencyKey();
    
    // Prepara items per Yandex Dostavka (dimensioni in METRI)
    const deliveryItems = [{
      quantity: 1,
      weight: 2, // Default 2kg per piccoli ordini food
      size: {
        length: 0.30,  // 30cm = 0.30 metri
        width: 0.20,   // 20cm = 0.20 metri
        height: 0.15,  // 15cm = 0.15 metri
      }
    }];

    // Validate package
    const packageValidation = validatePackage(deliveryItems[0]);
    if (!packageValidation.valid) {
      logger.error('Package validation failed', { errors: packageValidation.errors });
      throw new Error(`Validazione pacco fallita: ${packageValidation.errors.join(', ')}`);
    }
    
    const payload = {
      items: deliveryItems,
      route_points: [
        {
          coordinates: pickupCoords,
          type: 'source' as const,
        },
        {
          coordinates: deliveryCoords,
          type: 'destination' as const,
        },
      ],
    };

    const headers = {
      ...this.getHeaders(),
      'X-Idempotency-Key': idempotencyKey,
    };

    logger.info('Starting price calculation', { idempotencyKey });

    try {
      const data = await withRetry(async () => {
        const response = await yandexFetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        }, logger, corrId);

        return await response.json() as YandexDeliveryCalculateResponse;
      }, {}, corrId);
      
      logger.info('Price calculation response received', {
        offersCount: data.offers?.length || 0,
      });

      // Filtra le tariffe desiderate: Express, 2 ore, 4 ore, bici
      const allowedTariffs = [
        'express',
        'express_30min_longer', 
        'express_60min_longer',
        '2_hours_delivery',
        '4_hours_delivery',
        'courier',  // вело курьер
        'bicycle'   // possibile alternativa per вело курьер
      ];
      
      const filteredOffers = data.offers?.filter((offer: any) => 
        allowedTariffs.includes(offer.taxi_class)
      ) || [];
      
      // Se non ci sono offerte filtrate, usa tutte le offerte disponibili
      const availableOffers = filteredOffers.length > 0 ? filteredOffers : data.offers;
      
      const bestOffer = availableOffers?.[0];
      if (!bestOffer) {
        throw new Error('No delivery offers available');
      }
      
      logger.info('Selected offer', {
        taxiClass: bestOffer.taxi_class,
        filteredOffersCount: filteredOffers.length,
        totalOffersCount: data.offers?.length || 0,
        availableTaxiClasses: filteredOffers.map((o: any) => o.taxi_class)
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

      // Calcola distanza approssimativa dalle coordinate (formula Haversine)
      const distanceMeters = this.calculateDistance(pickupCoords, deliveryCoords);

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
        all_offers: expressOffers.length > 0 ? expressOffers : data.offers, // Solo offerte Express
      };
    } catch (error) {
      console.error('Yandex Dostavka checkPrice error:', error);
      throw error;
    }
  }

  /**
   * Create delivery order (claim)
   */
  async createOrder(
    orderData: {
      items: YandexDeliveryItem[];
      route_points: YandexDeliveryRoutePoint[];
      comment?: string;
      offer_id?: string;
    },
    orderId?: string,
    correlationId?: string
  ): Promise<YandexDeliveryClaimResponse> {
    const corrId = correlationId || generateCorrelationId();
    const requestId = generateRequestId();
    const idempotencyKey = generateIdempotencyKey();
    
    const logger = new YandexLogger({
      correlationId: corrId,
      requestId,
      idempotencyKey,
      service: 'yandex-dostavka',
      operation: 'createOrder',
      orderId,
    });

    // Validate route points
    for (const point of orderData.route_points) {
      const validation = validateCoordinates(point.coordinates, `${point.type} coordinates`);
      if (!validation.valid) {
        logger.error('Route point validation failed', { errors: validation.errors });
        throw new Error(`Validazione punto percorso fallita: ${validation.errors.join(', ')}`);
      }
    }

    const url = `${this.baseUrl}/claims/create?request_id=${encodeURIComponent(requestId)}`;
    
    const headers = {
      ...this.getHeaders(),
      'X-Idempotency-Key': idempotencyKey,
    };
    
    logger.info('Creating order', { 
      requestId, 
      idempotencyKey,
      offerId: orderData.offer_id,
      hasOfferId: !!orderData.offer_id,
      payloadPreview: {
        hasItems: !!orderData.items?.length,
        hasRoutePoints: !!orderData.route_points?.length,
        hasComment: !!orderData.comment,
        offerIdValue: orderData.offer_id
      }
    });

    try {
      const data = await withRetry(async () => {
        // Log the exact payload being sent
        const payload = JSON.stringify(orderData);
        logger.info('Sending payload to Yandex', { 
          payloadLength: payload.length,
          offerIdIncluded: payload.includes('offer_id')
        });
        
        const response = await yandexFetch(url, {
          method: 'POST',
          headers,
          body: payload,
        }, logger, corrId);

        return await response.json() as YandexDeliveryClaimResponse;
      }, {}, corrId);

      logger.info('Order created successfully', {
        claimId: data.id,
        status: data.status
      });

      return data;
    } catch (error) {
      logger.error('Create order failed', { error });
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(claimId: string, correlationId?: string): Promise<YandexDeliveryClaimResponse> {
    const corrId = correlationId || generateCorrelationId();
    const logger = new YandexLogger({
      correlationId: corrId,
      service: 'yandex-dostavka',
      operation: 'getOrderStatus',
      claimId,
    });

    const url = `${this.baseUrl}/claims/info`;
    
    logger.info('Getting order status');

    try {
      const data = await withRetry(async () => {
        const response = await yandexFetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ claim_id: claimId }),
        }, logger, corrId);

        return await response.json() as YandexDeliveryClaimResponse;
      }, {}, corrId);

      logger.info('Order status retrieved', { status: data.status });

      return data;
    } catch (error) {
      logger.error('Get order status failed', { error });
      throw error;
    }
  }

  /**
   * Get cancel info (required before cancelling)
   */
  async getCancelInfo(claimId: string, correlationId?: string): Promise<{ cancel_state: string }> {
    const corrId = correlationId || generateCorrelationId();
    const logger = new YandexLogger({
      correlationId: corrId,
      service: 'yandex-dostavka',
      operation: 'getCancelInfo',
      claimId,
    });

    const url = `${this.baseUrl}/claims/cancel-info?claim_id=${encodeURIComponent(claimId)}`;
    
    logger.info('Getting cancel info');

    try {
      const data = await withRetry(async () => {
        const response = await yandexFetch(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({}),
        }, logger, corrId);

        return await response.json();
      }, {}, corrId);

      logger.info('Cancel info retrieved', { 
        cancelState: data.cancel_state 
      });

      return data;
    } catch (error) {
      logger.error('Get cancel info failed', { error });
      throw error;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(claimId: string, correlationId?: string): Promise<YandexDeliveryClaimResponse> {
    const corrId = correlationId || generateCorrelationId();
    const idempotencyKey = generateIdempotencyKey();
    
    const logger = new YandexLogger({
      correlationId: corrId,
      idempotencyKey,
      service: 'yandex-dostavka',
      operation: 'cancelOrder',
      claimId,
    });

    // First, get the cancel info to obtain cancel_state
    const cancelInfo = await this.getCancelInfo(claimId, corrId);

    // Check if cancellation is available
    if (cancelInfo.cancel_state === 'unavailable') {
      const error = new Error('Невозможно отменить доставку. Заказ уже в финальном состоянии (доставлен или отменен ранее).');
      logger.error('Cancellation unavailable', { cancelState: cancelInfo.cancel_state });
      throw error;
    }

    // claim_id deve essere passato come query parameter, non nel body
    const url = `${this.baseUrl}/claims/cancel?claim_id=${encodeURIComponent(claimId)}`;
    
    const headers = {
      ...this.getHeaders(),
      'X-Idempotency-Key': idempotencyKey,
    };
    
    logger.info('Cancelling order', { cancelState: cancelInfo.cancel_state });

    try {
      const data = await withRetry(async () => {
        const response = await yandexFetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            version: 1,
            cancel_state: cancelInfo.cancel_state,
          }),
        }, logger, corrId);

        return await response.json() as YandexDeliveryClaimResponse;
      }, {}, corrId);

      logger.info('Order cancelled', { status: data.status });

      return data;
    } catch (error) {
      logger.error('Cancel order failed', { error });
      throw error;
    }
  }
}

export const yandexDostavkaService = new YandexDostavkaService();
