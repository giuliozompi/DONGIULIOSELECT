
// Yandex Go API - General delivery service
// Docs: https://yandex.ru/support/taxi-for-business/api/
// Production endpoint: https://b2b.taxi.yandex.net
// NOTE: Yandex Dostavka and Yandex Go use the SAME API endpoint (b2b.taxi.yandex.net)
// According to documentation, they may use the same token if it has correct permissions
// Testing with Dostavka token since both services share the same underlying API
const YANDEX_GO_BASE_URL = 'https://b2b.taxi.yandex.net';
const YANDEX_GO_TOKEN = process.env.YANDEX_DOSTAVKA_TOKEN; // Using Dostavka token (same API)
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
  async checkPrice(request: YandexGoCheckPriceRequest): Promise<YandexGoCheckPriceResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/offers/calculate`;
    
    const headers = this.getHeaders('v2'); // V2 = only Bearer token (no Client-Id)
    
    console.log('Yandex Go V2 offers/calculate request to:', url);
    console.log('Yandex Go V2 headers:', {
      'Content-Type': headers['Content-Type'],
      'Accept': headers['Accept'],
      'Accept-Language': headers['Accept-Language'],
      'Authorization': headers['Authorization'] ? `Bearer ${headers['Authorization'].substring(7, 15)}...` : 'MISSING'
    });
    console.log('Yandex Go V2 request body:', JSON.stringify(request, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(request),
    });

    console.log('Yandex Go checkPrice response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yandex Go checkPrice error:', errorText);
      
      if (response.status === 403 || response.status === 401) {
        throw new Error(`Yandex Go API: Access denied (${response.status}). Verify that YANDEX_GO_TOKEN is valid and obtained from Yandex Go B2B Corporate Dashboard (separate from Yandex Dostavka).`);
      }
      
      throw new Error(`Yandex Go API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Yandex Go price data:', data);
    
    // Parse Yandex response - API returns { offers: [...] }
    if (!data.offers || !Array.isArray(data.offers) || data.offers.length === 0) {
      throw new Error('No delivery offers available for this route');
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
  async createClaim(request: YandexGoClaimRequest, requestId: string): Promise<YandexGoClaimResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/create?request_id=${requestId}`;
    
    console.log('Yandex Go createClaim request to:', url, 'with requestId:', requestId);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    console.log('Yandex Go createClaim response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yandex Go createClaim error:', errorText);
      throw new Error(`Yandex Go API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Yandex Go claim created:', {
      claimId: data.id,
      status: data.status,
      pricing: data.pricing
    });
    
    return data;
  }

  /**
   * Get claim info (step 3)
   */
  async getClaimInfo(claimId: string): Promise<YandexGoClaimResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/info?claim_id=${claimId}`;
    
    console.log('Yandex Go getClaimInfo request:', {
      url,
      claimId
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({}),
    });

    console.log('Yandex Go getClaimInfo response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yandex Go getClaimInfo error:', errorText);
      throw new Error(`Yandex Go API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Yandex Go claim info:', {
      claimId: data.id,
      status: data.status,
      pricing: data.pricing,
      performer: data.performer_info
    });
    
    return data;
  }

  /**
   * Accept claim (step 4)
   */
  async acceptClaim(claimId: string, version: number): Promise<YandexGoClaimResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/accept?claim_id=${claimId}`;
    
    console.log('Yandex Go acceptClaim request:', {
      url,
      claimId,
      version
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        version: version,
      }),
    });

    console.log('Yandex Go acceptClaim response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yandex Go acceptClaim error:', errorText);
      throw new Error(`Yandex Go API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Yandex Go claim accepted:', {
      claimId: data.id,
      status: data.status
    });
    
    return data;
  }

  /**
   * Get cancel info
   */
  async getCancelInfo(claimId: string): Promise<YandexGoCancelInfoResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/cancel-info`;
    
    console.log('Yandex Go getCancelInfo request:', {
      url,
      claimId
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        claim_id: claimId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yandex Go getCancelInfo error:', errorText);
      throw new Error(`Yandex Go API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Cancel claim
   */
  async cancelClaim(claimId: string, version: number, cancelState?: string): Promise<YandexGoClaimResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/cancel`;
    
    console.log('Yandex Go cancelClaim request:', {
      url,
      claimId,
      version,
      cancelState
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        claim_id: claimId,
        version: version,
        cancel_state: cancelState,
      }),
    });

    console.log('Yandex Go cancelClaim response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yandex Go cancelClaim error:', errorText);
      throw new Error(`Yandex Go API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Yandex Go claim cancelled:', {
      claimId: data.id,
      status: data.status
    });
    
    return data;
  }
}

export const yandexGoService = new YandexGoService();
