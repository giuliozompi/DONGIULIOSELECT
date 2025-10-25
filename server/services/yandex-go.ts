
// Yandex Go Taxi API (not Cargo!)
const YANDEX_TAXI_BASE_URL = 'https://taxi-routeinfo.taxi.yandex.net';
const YANDEX_GO_CLIENT_ID = process.env.YANDEX_GO_CLIENT_ID; // clid
const YANDEX_GO_API_KEY = process.env.YANDEX_GO_TOKEN; // apikey

export interface YandexTaxiOption {
  price: number;
  min_price?: number;
  waiting_time: number;
  class_name: string;
  class_text: string;
  class_level: number;
  price_text: string;
}

export interface YandexTaxiPriceResponse {
  options: YandexTaxiOption[];
  currency: string;
  distance: number;
  time: number;
}

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

class YandexGoService {
  private baseUrl = YANDEX_TAXI_BASE_URL;
  private clid = YANDEX_GO_CLIENT_ID;
  private apikey = YANDEX_GO_API_KEY;

  private getHeaders(): Record<string, string> {
    if (!this.apikey || !this.clid) {
      console.error('Yandex Taxi credentials missing:', {
        hasApiKey: !!this.apikey,
        apiKeyLength: this.apikey?.length || 0,
        hasClid: !!this.clid,
        clidLength: this.clid?.length || 0,
      });
      throw new Error('Yandex Taxi credentials not configured');
    }

    console.log('Yandex Taxi credentials check:', {
      hasApiKey: !!this.apikey,
      apiKeyLength: this.apikey?.length,
      hasClid: !!this.clid,
      clidLength: this.clid?.length,
      apiKeyPrefix: this.apikey?.substring(0, 10) + '...',
    });

    return {
      'YaTaxi-Api-Key': this.apikey,
      'Accept': 'application/json',
      'Accept-Language': 'ru',
    };
  }

  /**
   * Check price for taxi delivery
   * Uses Yandex Taxi API (not Cargo)
   */
  async checkPrice(
    pickupCoords: [number, number],
    deliveryCoords: [number, number],
    items?: YandexGoItem[],
    requirements?: YandexGoRequirements
  ): Promise<YandexTaxiPriceResponse> {
    const url = `${this.baseUrl}/taxi_info`;
    
    // Format coordinates as: lon1,lat1~lon2,lat2
    const rll = `${pickupCoords[0]},${pickupCoords[1]}~${deliveryCoords[0]},${deliveryCoords[1]}`;
    
    // Use express class for fast delivery
    const taxiClass = 'express,courier';
    
    const params = new URLSearchParams({
      clid: this.clid!,
      rll: rll,
      class: taxiClass,
    });

    const fullUrl = `${url}?${params.toString()}`;

    console.log('Yandex Taxi checkPrice request:', {
      url: fullUrl,
      clid: this.clid,
      rll,
      class: taxiClass,
    });

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      console.log('Yandex Taxi checkPrice response:', {
        status: response.status,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Yandex Taxi checkPrice error response:', error);
        throw new Error(`Yandex Taxi API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as YandexTaxiPriceResponse;
      
      console.log('Yandex Taxi price data:', {
        options: data.options?.length || 0,
        currency: data.currency,
        distance: data.distance,
        time: data.time,
      });

      return data;
    } catch (error) {
      console.error('Yandex Taxi checkPrice error:', error);
      throw error;
    }
  }

  /**
   * Check available taxi classes in a region
   */
  async checkZone(coordinates: [number, number]): Promise<any> {
    const url = `${this.baseUrl}/zone_info`;
    
    const params = new URLSearchParams({
      clid: this.clid!,
      ll: `${coordinates[0]},${coordinates[1]}`,
    });

    const fullUrl = `${url}?${params.toString()}`;

    console.log('Yandex Taxi zone check:', fullUrl);

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Yandex Taxi zone error:', error);
        throw new Error(`Yandex Taxi zone API error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Yandex Taxi zone error:', error);
      throw error;
    }
  }
}

export const yandexGoService = new YandexGoService();
