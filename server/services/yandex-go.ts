
// Yandex Go API - General delivery service
// Docs: https://yandex.ru/support/taxi-for-business/api/
// Production endpoint: https://b2b.taxi.yandex.net
const YANDEX_GO_BASE_URL = 'https://b2b.taxi.yandex.net';
const YANDEX_GO_TOKEN = process.env.YANDEX_GO_TOKEN;
const YANDEX_GO_CLIENT_ID = process.env.YANDEX_GO_CLIENT_ID;

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
    fullname: string;
  }>;
  requirements?: {
    taxi_class?: string;
    cargo_type?: string;
    cargo_options?: string[];
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

  private getHeaders(): Record<string, string> {
    if (!this.token) {
      throw new Error('Yandex Go OAuth token not configured. Get token from Yandex Go B2B Corporate Dashboard (separate from Yandex Dostavka).');
    }

    const cleanToken = this.token.trim();

    // Yandex Go usa endpoint: https://b2b.taxi.yandex.net
    // Il token deve essere ottenuto dal dashboard Yandex Go B2B (NON Yandex Dostavka)
    // Formato: y2_... (diverso dal token Dostavka)
    return {
      'Authorization': `Bearer ${cleanToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'ru',
    };
  }

  /**
   * Calculate delivery price (step 1)
   */
  async checkPrice(request: YandexGoCheckPriceRequest): Promise<YandexGoCheckPriceResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v1/check-price`;
    
    console.log('Yandex Go checkPrice request to:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    console.log('Yandex Go checkPrice response:', {
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yandex Go checkPrice error:', errorText);
      
      if (response.status === 403) {
        throw new Error(`Yandex Go API: Access denied (403). Verify that YANDEX_GO_TOKEN is valid and obtained from Yandex Go B2B Corporate Dashboard (not Yandex Dostavka). Token format should be: y2_...`);
      }
      
      throw new Error(`Yandex Go API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Yandex Go price data:', data);
    
    return data;
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
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/accept`;
    
    console.log('Yandex Go acceptClaim request:', {
      url,
      claimId,
      version
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        claim_id: claimId,
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
