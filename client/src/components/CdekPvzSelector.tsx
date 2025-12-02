import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MapPin, Clock, Phone, ChevronDown, ChevronUp, Package, CreditCard, Banknote, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CdekCity {
  code: number;
  city: string;
  country_code: string;
  region_code: number;
  region: string;
  postal_codes?: string[];
  longitude: number;
  latitude: number;
}

interface CdekPickupPoint {
  code: string;
  name: string;
  type: string;
  location: {
    country_code: string;
    region_code?: number;
    region?: string;
    city_code?: number;
    city: string;
    postal_code?: string;
    longitude: number;
    latitude: number;
    address: string;
    address_full?: string;
  };
  work_time?: string;
  phones?: Array<{ number: string }>;
  email?: string;
  note?: string;
  nearest_metro_station?: string;
  have_cashless?: boolean;
  have_cash?: boolean;
  allowed_cod?: boolean;
  is_handout?: boolean;
  is_dressing_room?: boolean;
  weight_max?: number;
}

interface CdekTariff {
  tariff_code: number;
  tariff_name: string;
  tariff_description?: string;
  delivery_mode: number;
  delivery_sum: number;
  period_min: number;
  period_max: number;
}

interface CdekPvzSelectorProps {
  onSelect: (pvz: CdekPickupPoint | null, tariff: CdekTariff | null, cityCode: number | null) => void;
  selectedPvzCode?: string | null;
  totalWeight?: number;
}

export function CdekPvzSelector({ onSelect, selectedPvzCode, totalWeight = 1000 }: CdekPvzSelectorProps) {
  const [citySearch, setCitySearch] = useState('');
  const [selectedCity, setSelectedCity] = useState<CdekCity | null>(null);
  const [selectedPvz, setSelectedPvz] = useState<CdekPickupPoint | null>(null);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [expandedPvz, setExpandedPvz] = useState<string | null>(null);

  const { data: cities = [], isLoading: isLoadingCities } = useQuery<CdekCity[]>({
    queryKey: ['/api/cdek/cities', citySearch],
    queryFn: async () => {
      if (citySearch.length < 2) return [];
      const response = await fetch(`/api/cdek/cities?city=${encodeURIComponent(citySearch)}&size=10`);
      if (!response.ok) throw new Error('Failed to fetch cities');
      return response.json();
    },
    enabled: citySearch.length >= 2,
    staleTime: 60000,
  });

  const { data: pickupPoints = [], isLoading: isLoadingPvz } = useQuery<CdekPickupPoint[]>({
    queryKey: ['/api/cdek/pvz', selectedCity?.code],
    queryFn: async () => {
      if (!selectedCity?.code) return [];
      const response = await fetch(`/api/cdek/pvz?city_code=${selectedCity.code}&is_handout=true`);
      if (!response.ok) throw new Error('Failed to fetch pickup points');
      return response.json();
    },
    enabled: !!selectedCity?.code,
    staleTime: 300000,
  });

  const { data: tariffs, isLoading: isLoadingTariffs } = useQuery<{ tariffs: CdekTariff[] }>({
    queryKey: ['/api/cdek/calculate', selectedCity?.code, totalWeight],
    queryFn: async () => {
      if (!selectedCity?.code) return { tariffs: [] };
      const response = await fetch('/api/cdek/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_city_code: 44,
          to_city_code: selectedCity.code,
          weight: totalWeight,
        }),
      });
      if (!response.ok) throw new Error('Failed to calculate tariffs');
      return response.json();
    },
    enabled: !!selectedCity?.code,
    staleTime: 60000,
  });

  const warehouseTariff = tariffs?.tariffs?.find(
    (t) => t.delivery_mode === 4 || t.delivery_mode === 6
  );

  const handleCitySelect = (city: CdekCity) => {
    setSelectedCity(city);
    setCitySearch(city.city);
    setShowCityDropdown(false);
    setSelectedPvz(null);
    onSelect(null, null, city.code);
  };

  const handlePvzSelect = (pvz: CdekPickupPoint) => {
    setSelectedPvz(pvz);
    onSelect(pvz, warehouseTariff || null, selectedCity?.code || null);
  };

  useEffect(() => {
    if (selectedPvzCode && pickupPoints.length > 0) {
      const pvz = pickupPoints.find((p) => p.code === selectedPvzCode);
      if (pvz) {
        setSelectedPvz(pvz);
      }
    }
  }, [selectedPvzCode, pickupPoints]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={citySearch}
            onChange={(e) => {
              setCitySearch(e.target.value);
              setShowCityDropdown(true);
              if (e.target.value.length < 2) {
                setSelectedCity(null);
                setSelectedPvz(null);
              }
            }}
            onFocus={() => setShowCityDropdown(true)}
            placeholder="Введите город доставки..."
            className="pl-10"
            data-testid="input-cdek-city"
          />
          {isLoadingCities && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {showCityDropdown && cities.length > 0 && (
          <Card className="absolute z-50 w-full mt-1 max-h-48 overflow-auto shadow-lg">
            {cities.map((city) => (
              <button
                key={city.code}
                type="button"
                onClick={() => handleCitySelect(city)}
                className="w-full px-4 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2"
                data-testid={`cdek-city-${city.code}`}
              >
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{city.city}</div>
                  <div className="text-xs text-muted-foreground truncate">{city.region}</div>
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>

      {selectedCity && (
        <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="font-medium">{selectedCity.city}</span>
            <span className="text-sm text-muted-foreground">{selectedCity.region}</span>
          </div>
          {warehouseTariff && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              от {Math.round(warehouseTariff.delivery_sum)} ₽
              <span className="text-muted-foreground">
                ({warehouseTariff.period_min}-{warehouseTariff.period_max} дн.)
              </span>
            </Badge>
          )}
        </div>
      )}

      {isLoadingPvz && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Загрузка пунктов выдачи...</span>
        </div>
      )}

      {selectedCity && !isLoadingPvz && pickupPoints.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          Пунктов выдачи не найдено для выбранного города
        </div>
      )}

      {selectedCity && pickupPoints.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Пункты выдачи СДЭК ({pickupPoints.length})</span>
            {selectedPvz && (
              <Badge variant="default" className="flex items-center gap-1">
                <Check className="w-3 h-3" />
                Выбрано
              </Badge>
            )}
          </div>
          
          <ScrollArea className="h-[300px] rounded-md border">
            <div className="p-2 space-y-2">
              {pickupPoints.map((pvz) => {
                const isSelected = selectedPvz?.code === pvz.code;
                const isExpanded = expandedPvz === pvz.code;
                
                return (
                  <Card
                    key={pvz.code}
                    className={cn(
                      "p-3 cursor-pointer transition-all",
                      isSelected && "ring-2 ring-primary bg-primary/5",
                      !isSelected && "hover:bg-muted/50"
                    )}
                    onClick={() => handlePvzSelect(pvz)}
                    data-testid={`cdek-pvz-${pvz.code}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{pvz.name}</span>
                          {pvz.type === 'POSTAMAT' && (
                            <Badge variant="outline" className="text-xs">Постамат</Badge>
                          )}
                          {isSelected && (
                            <Check className="w-4 h-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {pvz.location.address_full || pvz.location.address}
                        </p>
                        
                        {pvz.nearest_metro_station && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            м. {pvz.nearest_metro_station}
                          </div>
                        )}
                      </div>
                      
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0 h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedPvz(isExpanded ? null : pvz.code);
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t space-y-2 text-sm">
                        {pvz.work_time && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>{pvz.work_time}</span>
                          </div>
                        )}
                        
                        {pvz.phones && pvz.phones.length > 0 && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="w-4 h-4" />
                            <span>{pvz.phones[0].number}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-3">
                          {pvz.have_cashless && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CreditCard className="w-3 h-3" />
                              Карта
                            </div>
                          )}
                          {pvz.have_cash && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Banknote className="w-3 h-3" />
                              Наличные
                            </div>
                          )}
                          {pvz.is_dressing_room && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              Примерочная
                            </div>
                          )}
                        </div>
                        
                        {pvz.note && (
                          <p className="text-xs text-muted-foreground italic">{pvz.note}</p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {selectedPvz && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-2">
            <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Выбранный пункт выдачи</div>
              <div className="text-sm">{selectedPvz.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {selectedPvz.location.address_full || selectedPvz.location.address}
              </div>
              {selectedPvz.work_time && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {selectedPvz.work_time}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
