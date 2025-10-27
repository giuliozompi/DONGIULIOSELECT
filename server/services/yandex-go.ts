
// Yandex Delivery API - Express/Courier service for small packages
// Docs: https://yandex.com/support/delivery-profile/en/api/express/overview
const YANDEX_DELIVERY_BASE_URL = 'https://b2b.taxi.yandex.net/b2b/cargo/integration/v2';
const YANDEX_DELIVERY_TOKEN = process.env.YANDEX_GO_TOKEN;
const YANDEX_DELIVERY_CLIENT_ID = process.env.YANDEX_GO_CLIENT_ID;

export interface YandexDeliveryItem {
  title: string; // Descrizione dell'item
  quantity: number;
  weight: number;  // kg
  size: {
    length: number;  // meters
    width: number;   // meters
    height: number;  // meters
  };
  pickup_point: number; // Indice del punto di prelievo nella route_points
  cost_value: string; // Valore dichiarato per l'assicurazione
  cost_currency: string; // Valuta (es. RUB)
}

export interface YandexDeliveryRoutePoint {
  coordinates: [number, number]; // [longitude, latitude]
  type: 'source' | 'destination';
  fullname?: string;
  contact?: {
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

class YandexGoService {
  private baseUrl = YANDEX_DELIVERY_BASE_URL;
  private token = YANDEX_DELIVERY_TOKEN;
  private clientId = YANDEX_DELIVERY_CLIENT_ID;

  private getHeaders(): Record<string, string> {
    if (!this.token) {
      console.error('Yandex Delivery token missing:', {
        hasToken: !!this.token,
        tokenLength: this.token?.length || 0,
      });
      throw new Error('Yandex Delivery OAuth token not configured');
    }

    console.log('Yandex Delivery credentials check:', {
      hasToken: !!this.token,
      tokenLength: this.token?.length,
      tokenPrefix: this.token?.substring(0, 10) + '...',
    });

    // Formato Bearer token (ufficiale Yandex Delivery)
    return {
      'Authorization': `Bearer ${this.token}`,
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
   * Yandex Delivery API - for small packages/express courier
   */
  async checkPrice(
    pickupCoords: [number, number],
    deliveryCoords: [number, number],
    items?: any[],
    requirements?: any
  ): Promise<any> {
    const url = `${this.baseUrl}/offers/calculate`;
    
    // Prepara items per Yandex Delivery (dimensioni in METRI)
    const deliveryItems = [{
      quantity: 1,
      weight: 2, // Default 2kg per piccoli ordini food
      size: {
        length: 0.30,  // 30cm = 0.30 metri
        width: 0.20,   // 20cm = 0.20 metri
        height: 0.15,  // 15cm = 0.15 metri
      }
    }];
    
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

    console.log('Yandex Delivery checkPrice request:', {
      url,
      payload: JSON.stringify(payload, null, 2),
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      console.log('Yandex Delivery checkPrice response:', {
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Yandex Delivery checkPrice error response:', error);
        throw new Error(`Yandex Delivery API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as YandexDeliveryCalculateResponse;
      
      console.log('Yandex Delivery price data:', {
        offersCount: data.offers?.length || 0,
        firstOffer: data.offers?.[0],
      });

      // Converti formato per compatibilità con frontend
      const bestOffer = data.offers?.[0];
      if (!bestOffer) {
        throw new Error('No delivery offers available');
      }

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
        all_offers: data.offers,
      };
    } catch (error) {
      console.error('Yandex Delivery checkPrice error:', error);
      throw error;
    }
  }

  /**
   * Create delivery order (claim)
   */
  async createOrder(orderData: {
    items: YandexDeliveryItem[];
    route_points: YandexDeliveryRoutePoint[];
    comment?: string;
    offer_id?: string;
  }): Promise<YandexDeliveryClaimResponse> {
    // Genera request_id univoco (richiesto da Yandex API)
    const requestId = `don-giulio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const url = `${this.baseUrl}/claims/create?request_id=${encodeURIComponent(requestId)}`;
    
    console.log('Yandex Delivery createOrder request:', {
      url,
      requestId,
      payload: JSON.stringify(orderData, null, 2),
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(orderData),
      });

      console.log('Yandex Delivery createOrder response:', {
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Yandex Delivery createOrder error:', error);
        throw new Error(`Yandex Delivery API error: ${response.status} - ${error}`);
      }

      return await response.json() as YandexDeliveryClaimResponse;
    } catch (error) {
      console.error('Yandex Delivery createOrder error:', error);
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(claimId: string): Promise<YandexDeliveryClaimResponse> {
    const url = `${this.baseUrl}/claims/info`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ claim_id: claimId }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yandex Delivery API error: ${response.status} - ${error}`);
      }

      return await response.json() as YandexDeliveryClaimResponse;
    } catch (error) {
      console.error('Yandex Delivery getOrderStatus error:', error);
      throw error;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(claimId: string): Promise<YandexDeliveryClaimResponse> {
    const url = `${this.baseUrl}/claims/cancel`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ 
          claim_id: claimId,
          version: 1,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yandex Delivery API error: ${response.status} - ${error}`);
      }

      return await response.json() as YandexDeliveryClaimResponse;
    } catch (error) {
      console.error('Yandex Delivery cancelOrder error:', error);
      throw error;
    }
  }
}

export const yandexGoService = new YandexGoService();
