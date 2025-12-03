import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MapPin, Clock, Phone, ChevronDown, ChevronUp, Package, CreditCard, Banknote, Check, Navigation, AlertCircle } from 'lucide-react';
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
  customerAddress?: string;
  customerLatitude?: string;
  customerLongitude?: string;
  customerCity?: string;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function CdekPvzSelector({ 
  onSelect, 
  selectedPvzCode, 
  totalWeight = 1000,
  customerAddress,
  customerLatitude,
  customerLongitude,
  customerCity
}: CdekPvzSelectorProps) {
  const [selectedCity, setSelectedCity] = useState<CdekCity | null>(null);
  const [selectedPvz, setSelectedPvz] = useState<CdekPickupPoint | null>(null);
  const [expandedPvz, setExpandedPvz] = useState<string | null>(null);
  const [showAllPvz, setShowAllPvz] = useState(false);
  
  const customerCoords = (customerLatitude && customerLongitude) 
    ? { lat: parseFloat(customerLatitude), lon: parseFloat(customerLongitude) }
    : null;

  // Allow CDEK selector to work if we have either city or coordinates
  // Coordinates are optional - if present, we sort by distance to customer
  // If only city is available, we sort by distance to city center
  const hasCustomerAddress = !!(customerCity || customerCoords);

  const { data: citiesForAddress = [], isLoading: isLoadingCities } = useQuery<CdekCity[]>({
    queryKey: ['/api/cdek/cities', customerCity],
    queryFn: async () => {
      if (!customerCity) return [];
      const response = await fetch(`/api/cdek/cities?city=${encodeURIComponent(customerCity)}&size=5`);
      if (!response.ok) throw new Error('Failed to fetch cities');
      return response.json();
    },
    enabled: !!customerCity,
    staleTime: 60000,
  });

  useEffect(() => {
    if (citiesForAddress.length > 0 && customerCity) {
      const exactMatch = citiesForAddress.find(c => 
        c.city.toLowerCase() === customerCity.toLowerCase()
      );
      const cityToSelect = exactMatch || citiesForAddress[0];
      if (!selectedCity || selectedCity.code !== cityToSelect.code) {
        setSelectedCity(cityToSelect);
        setSelectedPvz(null);
        setShowAllPvz(false);
        onSelect(null, null, cityToSelect.code);
      }
    }
  }, [citiesForAddress, customerCity]);

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

  const { data: tariffs } = useQuery<{ tariffs: CdekTariff[] }>({
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
  
  const sortedPickupPoints = customerCoords ? pickupPoints.map(pvz => ({
    ...pvz,
    distance: calculateDistance(
      customerCoords.lat, 
      customerCoords.lon,
      pvz.location.latitude, 
      pvz.location.longitude
    )
  })).sort((a, b) => a.distance - b.distance) : pickupPoints.map(pvz => ({
    ...pvz,
    distance: selectedCity ? calculateDistance(
      selectedCity.latitude, 
      selectedCity.longitude,
      pvz.location.latitude, 
      pvz.location.longitude
    ) : 0
  })).sort((a, b) => a.distance - b.distance);
  
  const displayedPvz = showAllPvz ? sortedPickupPoints : sortedPickupPoints.slice(0, 3);

  const handlePvzSelect = (pvz: CdekPickupPoint & { distance: number }) => {
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

  if (!hasCustomerAddress) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Выберите адрес из списка подсказок
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Введите адрес в поле выше и выберите его из появившегося списка, чтобы мы определили ваш город и показали ближайшие пункты выдачи
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selectedCity && (
        <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{selectedCity.city}</span>
              <span className="text-xs text-muted-foreground ml-2">{selectedCity.region}</span>
            </div>
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

      {customerCoords && (
        <div className="text-xs text-muted-foreground flex items-center gap-1 px-1">
          <Navigation className="w-3 h-3" />
          ПВЗ отсортированы по расстоянию от: {customerAddress?.substring(0, 50)}...
        </div>
      )}

      {(isLoadingCities || isLoadingPvz) && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            {isLoadingCities ? 'Поиск города...' : 'Загрузка пунктов выдачи...'}
          </span>
        </div>
      )}

      {selectedCity && !isLoadingPvz && pickupPoints.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          Пунктов выдачи не найдено для города {selectedCity.city}
        </div>
      )}

      {selectedCity && sortedPickupPoints.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {showAllPvz 
                ? `Все пункты выдачи (${sortedPickupPoints.length})`
                : `Ближайшие пункты выдачи (${displayedPvz.length} из ${sortedPickupPoints.length})`
              }
            </span>
            {selectedPvz && (
              <Badge variant="default" className="flex items-center gap-1">
                <Check className="w-3 h-3" />
                Выбрано
              </Badge>
            )}
          </div>
          
          <ScrollArea className={cn("rounded-md border", showAllPvz ? "h-[300px]" : "h-auto max-h-[300px]")}>
            <div className="p-2 space-y-2">
              {displayedPvz.map((pvz) => {
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{pvz.name}</span>
                          {pvz.type === 'POSTAMAT' && (
                            <Badge variant="outline" className="text-xs">Постамат</Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {pvz.distance < 1 
                              ? `${Math.round(pvz.distance * 1000)} м` 
                              : `${pvz.distance.toFixed(1)} км`
                            }
                          </Badge>
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
          
          {!showAllPvz && sortedPickupPoints.length > 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => setShowAllPvz(true)}
              data-testid="button-show-all-pvz"
            >
              Показать все пункты выдачи ({sortedPickupPoints.length})
            </Button>
          )}
          
          {showAllPvz && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full mt-2"
              onClick={() => setShowAllPvz(false)}
              data-testid="button-show-nearest-pvz"
            >
              Показать только ближайшие
            </Button>
          )}
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
