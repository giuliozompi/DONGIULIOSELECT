
const YANDEX_GO_BASE_URL = 'https://b2b.taxi.yandex.net';
const YANDEX_GO_TOKEN = process.env.YANDEX_GO_TOKEN;
const YANDEX_GO_CLIENT_ID = process.env.YANDEX_GO_CLIENT_ID;

export interface YandexGoItem {
  quantity: number;
  size: {
    height: number;
    length: number;
    width: number;
  };
  weight: number;
}

export interface YandexGoRequirements {
  cargo_loaders?: number;
  cargo_options?: string[];
  cargo_type?: string;
  pro_courier?: boolean;
  taxi_class?: string;
}

export interface YandexGoPriceResponse {
  currency_rules: {
    code: string;
    sign: string;
    template: string;
    text: string;
  };
  distance_meters: number;
  eta: number;
  price: string;
  requirements: YandexGoRequirements;
  zone_id: string;
}

export interface YandexGoCreateOrderRequest {
  callback_properties?: {
    callback_url?: string;
  };
  comment?: string;
  emergency_contact?: {
    name: string;
    phone: string;
  };
  items: YandexGoItem[];
  optional_return?: boolean;
  referral_source?: string;
  requirements?: YandexGoRequirements;
  route_points: Array<{
    address: {
      fullname: string;
      coordinates: [number, number];
      country?: string;
      city?: string;
      street?: string;
      building?: string;
      porch?: string;
      floor?: string;
      flat?: string;
      door_code?: string;
      comment?: string;
    };
    contact: {
      name: string;
      phone: string;
      email?: string;
    };
    external_order_id?: string;
    skip_confirmation?: boolean;
    type: 'source' | 'destination';
    visit_order: number;
  }>;
  skip_door_to_door?: boolean;
}

export interface YandexGoOrderResponse {
  id: string;
  status: string;
  version: number;
  user_request_revision: string;
  skip_client_notify: boolean;
  items: YandexGoItem[];
  route_points: Array<{
    id: number;
    address: {
      fullname: string;
      coordinates: [number, number];
    };
    contact: {
      name: string;
      phone: string;
    };
    type: string;
    visit_order: number;
    visit_status: string;
  }>;
  available_cancel_state: string;
  created_ts: string;
  updated_ts: string;
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
    legal_name: string;
    car_model: string;
    car_number: string;
  };
}

export interface YandexGoOrderStatusResponse extends YandexGoOrderResponse {
  status: 
    | 'new'
    | 'estimating'
    | 'ready_for_approval'
    | 'accepted'
    | 'performer_lookup'
    | 'performer_draft'
    | 'performer_found'
    | 'performer_not_found'
    | 'pickup_arrived'
    | 'ready_for_pickup_confirmation'
    | 'pickuped'
    | 'delivery_arrived'
    | 'ready_for_delivery_confirmation'
    | 'delivered'
    | 'delivered_finish'
    | 'returning'
    | 'return_arrived'
    | 'returned'
    | 'returned_finish'
    | 'failed'
    | 'cancelled'
    | 'cancelled_with_payment'
    | 'cancelled_by_taxi'
    | 'cancelled_with_items_on_hands';
}

class YandexGoService {
  private baseUrl = YANDEX_GO_BASE_URL;
  private token = YANDEX_GO_TOKEN;
  private clientId = YANDEX_GO_CLIENT_ID;

  private getHeaders(): Record<string, string> {
    if (!this.token || !this.clientId) {
      throw new Error('Yandex Go credentials not configured');
    }

    return {
      'Authorization': `Bearer ${this.token}`,
      'X-B2B-Client-Id': this.clientId,
      'Content-Type': 'application/json',
      'Accept-Language': 'ru',
    };
  }

  async checkPrice(
    pickupCoords: [number, number],
    deliveryCoords: [number, number],
    items: YandexGoItem[],
    requirements?: YandexGoRequirements
  ): Promise<YandexGoPriceResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v1/check-price`;
    
    const payload: any = {
      items,
      route_points: [
        { coordinates: pickupCoords },
        { coordinates: deliveryCoords },
      ],
      skip_door_to_door: false,
    };

    if (requirements) {
      payload.requirements = requirements;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yandex Go API error: ${response.status} - ${error}`);
      }

      return await response.json() as YandexGoPriceResponse;
    } catch (error) {
      console.error('Yandex Go checkPrice error:', error);
      throw error;
    }
  }

  async createOrder(orderData: YandexGoCreateOrderRequest): Promise<YandexGoOrderResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/create`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yandex Go API error: ${response.status} - ${error}`);
      }

      return await response.json() as YandexGoOrderResponse;
    } catch (error) {
      console.error('Yandex Go createOrder error:', error);
      throw error;
    }
  }

  async getOrderStatus(claimId: string): Promise<YandexGoOrderStatusResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/info`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ claim_id: claimId }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yandex Go API error: ${response.status} - ${error}`);
      }

      return await response.json() as YandexGoOrderStatusResponse;
    } catch (error) {
      console.error('Yandex Go getOrderStatus error:', error);
      throw error;
    }
  }

  async cancelOrder(claimId: string, cancelState?: string): Promise<YandexGoOrderResponse> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/cancel`;
    
    const payload: any = {
      claim_id: claimId,
      version: 1,
    };

    if (cancelState) {
      payload.cancel_state = cancelState;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yandex Go API error: ${response.status} - ${error}`);
      }

      return await response.json() as YandexGoOrderResponse;
    } catch (error) {
      console.error('Yandex Go cancelOrder error:', error);
      throw error;
    }
  }

  async getCancelInfo(claimId: string): Promise<any> {
    const url = `${this.baseUrl}/b2b/cargo/integration/v2/claims/cancel-info`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ claim_id: claimId }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Yandex Go API error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Yandex Go getCancelInfo error:', error);
      throw error;
    }
  }
}

export const yandexGoService = new YandexGoService();
