interface DaDataSuggestion {
  value: string;
  unrestricted_value: string;
  data: {
    postal_code: string | null;
    country: string;
    region: string;
    city: string | null;
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
}

export class DaDataService {
  private apiToken: string;
  private apiUrl = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
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
      
      return data.suggestions.map(s => ({
        fullAddress: s.value,
        city: s.data.city,
        street: s.data.street,
        building: s.data.house,
        flat: s.data.flat,
        postalCode: s.data.postal_code,
        fiasId: s.data.fias_id,
      }));
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
