
// Yandex Delivery API - Express/Courier service for small packages
// Docs: https://yandex.com/support/delivery-profile/en/api/express/overview
const YANDEX_DELIVERY_BASE_URL = 'https://b2b.taxi.yandex.net/b2b/cargo/integration/v2';
const YANDEX_DELIVERY_TOKEN = process.env.YANDEX_GO_TOKEN;
const YANDEX_DELIVERY_CLIENT_ID = process.env.YANDEX_GO_CLIENT_ID;

export interface YandexDeliveryItem {
  weight: number;  // kg
  size: {
    length: number;  // meters
    width: number;   // meters
    height: number;  // meters
  };
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
  offer_id: string;
  price: string;
  price_raw: number;
  currency: string;
  currency_rules: {
    code: string;
    sign: string;
    template: string;
    text: string;
  };
  eta: number; // seconds
  distance: number; // meters
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
    if (!this.token || !this.clientId) {
      console.error('Yandex Delivery credentials missing:', {
        hasToken: !!this.token,
        hasClientId: !!this.clientId,
        tokenLength: this.token?.length || 0,
        clientIdLength: this.clientId?.length || 0,
      });
      throw new Error('Yandex Delivery OAuth token or client_id not configured');
    }

    console.log('Yandex Delivery credentials check:', {
      hasToken: !!this.token,
      hasClientId: !!this.clientId,
      tokenLength: this.token?.length,
      clientIdLength: this.clientId?.length,
      tokenPrefix: this.token?.substring(0, 10) + '...',
      clientIdPrefix: this.clientId?.substring(0, 10) + '...',
    });

    // Formato OAuth ufficiale Yandex Delivery
    return {
      'Authorization': `OAuth oauth_token="${this.token}", oauth_client_id="${this.clientId}"`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ru',
    };
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
    const deliveryItems: YandexDeliveryItem[] = [{
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

      return {
        price: bestOffer.price,
        currency_rules: bestOffer.currency_rules,
        distance_meters: bestOffer.distance,
        eta: bestOffer.eta,
        offer_id: bestOffer.offer_id,
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
    const url = `${this.baseUrl}/claims/create`;
    
    console.log('Yandex Delivery createOrder request:', {
      url,
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
