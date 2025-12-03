interface DaDataSuggestion {
  value: string;
  unrestricted_value: string;
  data: {
    postal_code: string | null;
    country: string;
    region: string | null;
    region_type: string | null;
    city: string | null;
    city_type: string | null;
    settlement: string | null;
    settlement_type: string | null;
    street: string | null;
    house: string | null;
    flat: string | null;
    fias_id: string;
    geo_lat: string | null;
    geo_lon: string | null;
  };
}

interface DaDataResponse {
  suggestions: DaDataSuggestion[];
}

interface AddressSuggestion {
  fullAddress: string;
  city: string | null;
  street: string | null;
  building: string | null;
  flat: string | null;
  postalCode: string | null;
  fiasId: string;
  geoLat: string | null;
  geoLon: string | null;
}

export class DaDataService {
  private apiToken: string;
  private apiUrl = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
  private geolocateUrl = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  async getCityFromCoordinates(lat: number, lon: number): Promise<string | null> {
    try {
      const response = await fetch(this.geolocateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Token ${this.apiToken}`,
        },
        body: JSON.stringify({ 
          lat,
          lon,
          count: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`DaData Geolocate API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.suggestions && data.suggestions.length > 0) {
        const suggestion = data.suggestions[0];
        const isFederalCity = suggestion.data?.region_type === 'г';
        return suggestion.data?.city || suggestion.data?.settlement || (isFederalCity ? suggestion.data?.region : null);
      }
      
      return null;
    } catch (error) {
      console.error('DaData Geolocate API error:', error);
      return null;
    }
  }

  async suggestAddress(query: string, count: number = 5): Promise<AddressSuggestion[]> {
    if (!query || query.length < 2) {
      return [];
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Token ${this.apiToken}`,
        },
        body: JSON.stringify({ 
          query,
          count,
          locations: [{ country: "Россия" }]
        }),
      });

      if (!response.ok) {
        throw new Error(`DaData API error: ${response.status}`);
      }

      const data: DaDataResponse = await response.json();
      
      return data.suggestions.map(s => {
        // For federal cities (Moscow, St. Petersburg, Sevastopol), the city might be in region
        // DaData returns region_type = "г" for federal cities
        const isFederalCity = s.data.region_type === 'г';
        const city = s.data.city || s.data.settlement || (isFederalCity ? s.data.region : null);
        
        return {
          fullAddress: s.value,
          city,
          street: s.data.street,
          building: s.data.house,
          flat: s.data.flat,
          postalCode: s.data.postal_code,
          fiasId: s.data.fias_id,
          geoLat: s.data.geo_lat,
          geoLon: s.data.geo_lon,
        };
      });
    } catch (error) {
      console.error('DaData API error:', error);
      return [];
    }
  }
}

let dadataService: DaDataService | null = null;

export function getDaDataService(): DaDataService | null {
  const apiToken = process.env.DADATA_API_TOKEN;
  
  if (!apiToken) {
    console.warn('DADATA_API_TOKEN not configured. Address autocomplete will be disabled.');
    return null;
  }

  if (!dadataService) {
    dadataService = new DaDataService(apiToken);
  }

  return dadataService;
}
