import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Truck, MapPin, Phone, User, Save, RefreshCw, Edit, XCircle, Car, Package } from 'lucide-react';
import { AddressAutocomplete, type AddressSuggestion } from '@/components/AddressAutocomplete';
import type { Order, PickupAddress } from '@shared/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface DeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
}

interface DostavkaOffer {
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
  payload: string;
  offer_ttl: string;
}

interface DostavkaPriceInfo {
  price: string;
  currency_rules: {
    code: string;
    sign: string;
  };
  distance_meters: number;
  eta: number;
  offer_id: string;
  all_offers: DostavkaOffer[];
}

interface GoPriceInfo {
  price: string;
  currency: string;
  distance: number;
  time: number;
}

export function DeliveryDialog({
  open,
  onOpenChange,
  order,
}: DeliveryDialogProps) {
  const { toast } = useToast();
  
  // Pickup address state
  const [selectedPickupId, setSelectedPickupId] = useState<string>('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [pickupContactName, setPickupContactName] = useState('');
  const [pickupContactPhone, setPickupContactPhone] = useState('');
  const [pickupLabel, setPickupLabel] = useState('');
  const [showPickupForm, setShowPickupForm] = useState(false);
  
  // Delivery address state
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState<[number, number] | null>(null);
  const [deliveryContactName, setDeliveryContactName] = useState('');
  const [deliveryContactPhone, setDeliveryContactPhone] = useState('');
  const [isEditingDelivery, setIsEditingDelivery] = useState(false);
  const [isRecalculatingDelivery, setIsRecalculatingDelivery] = useState(false);
  
  // Structured address data for saving
  const [pickupStructured, setPickupStructured] = useState<{
    city?: string;
    street?: string;
    building?: string;
    postalCode?: string;
    dadataFiasId?: string;
  }>({});
  
  // Price info for both services
  const [dostavkaPriceInfo, setDostavkaPriceInfo] = useState<DostavkaPriceInfo | null>(null);
  const [goPriceInfo, setGoPriceInfo] = useState<GoPriceInfo | null>(null);
  const [dostavkaError, setDostavkaError] = useState<string | null>(null);
  const [goError, setGoError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<'dostavka' | 'go' | null>(null);
  const [selectedDostavkaOffer, setSelectedDostavkaOffer] = useState<string>(''); // payload dell'offerta selezionata
  
  // Load pickup addresses
  const { data: pickupAddresses = [], isLoading: isLoadingPickup } = useQuery<PickupAddress[]>({
    queryKey: ['/api/admin/pickup-addresses'],
    enabled: open,
  });
  
  // Initialize with default pickup address or show form
  useEffect(() => {
    if (pickupAddresses.length > 0 && !selectedPickupId) {
      const defaultAddr = pickupAddresses.find(addr => addr.isDefault) || pickupAddresses[0];
      setSelectedPickupId(defaultAddr.id);
      setPickupAddress(defaultAddr.fullAddress);
      setPickupContactName(defaultAddr.contactName || '');
      setPickupContactPhone(defaultAddr.contactPhone || '');
      setPickupLabel(defaultAddr.label);
      
      if (defaultAddr.latitude && defaultAddr.longitude) {
        setPickupCoords([
          parseFloat(defaultAddr.longitude),
          parseFloat(defaultAddr.latitude)
        ]);
      }
      setShowPickupForm(false);
    } else if (pickupAddresses.length === 0 && !selectedPickupId) {
      setShowPickupForm(true);
      setPickupLabel('Магазин Don Giulio');
      setPickupContactName('Don Giulio Select');
    }
  }, [pickupAddresses, selectedPickupId]);
  
  // Initialize delivery address and coordinates from order
  useEffect(() => {
    setDeliveryAddress(order.deliveryAddress);
    setDeliveryContactName(order.customerName);
    setDeliveryContactPhone(order.customerPhone);
    
    if (order.deliveryLongitude && order.deliveryLatitude) {
      setDeliveryCoords([
        parseFloat(order.deliveryLongitude),
        parseFloat(order.deliveryLatitude)
      ]);
    } else {
      setDeliveryCoords(null);
    }
    
    setIsEditingDelivery(false);
  }, [order]);
  
  // Removed auto-calculate - now user must click button to calculate prices
  
  // Reset prices, errors and selection when dialog closes
  useEffect(() => {
    if (!open) {
      setDostavkaPriceInfo(null);
      setGoPriceInfo(null);
      setDostavkaError(null);
      setGoError(null);
      setSelectedService(null);
      setSelectedDostavkaOffer('');
    }
  }, [open]);
  
  // Handle pickup address selection change
  const handlePickupChange = (pickupId: string) => {
    if (pickupId === 'new') {
      setShowPickupForm(true);
      setSelectedPickupId('');
      setPickupAddress('');
      setPickupCoords(null);
      setPickupContactName('');
      setPickupContactPhone('');
      setPickupLabel('');
    } else {
      const addr = pickupAddresses.find(a => a.id === pickupId);
      if (addr) {
        setSelectedPickupId(addr.id);
        setPickupAddress(addr.fullAddress);
        setPickupContactName(addr.contactName || '');
        setPickupContactPhone(addr.contactPhone || '');
        setPickupLabel(addr.label);
        
        const newCoords = addr.latitude && addr.longitude ? [
          parseFloat(addr.longitude),
          parseFloat(addr.latitude)
        ] as [number, number] : null;
        
        setPickupCoords(newCoords);
        setShowPickupForm(false);
        
        // Se erano già stati calcolati i prezzi e abbiamo coordinate valide, ricalcola automaticamente
        if ((dostavkaPriceInfo || goPriceInfo) && newCoords && deliveryCoords) {
          // Resetta i prezzi precedenti
          setDostavkaPriceInfo(null);
          setGoPriceInfo(null);
          setDostavkaError(null);
          setGoError(null);
          setSelectedService(null);
          
          // Ricalcola automaticamente dopo un breve delay per permettere l'aggiornamento dello stato
          setTimeout(() => {
            calculatePricesMutation.mutate();
          }, 100);
        }
      }
    }
  };
  
  // Handle pickup address selection from autocomplete
  const handlePickupAddressSelect = (suggestion: AddressSuggestion) => {
    setPickupAddress(suggestion.fullAddress);
    
    const newCoords = suggestion.geoLat && suggestion.geoLon ? [
      parseFloat(suggestion.geoLon),
      parseFloat(suggestion.geoLat)
    ] as [number, number] : null;
    
    setPickupCoords(newCoords);
    
    setPickupStructured({
      city: suggestion.city || undefined,
      street: suggestion.street || undefined,
      building: suggestion.building || undefined,
      postalCode: suggestion.postalCode || undefined,
      dadataFiasId: suggestion.fiasId,
    });
    
    // Se erano già stati calcolati i prezzi e abbiamo coordinate valide, ricalcola automaticamente
    if ((dostavkaPriceInfo || goPriceInfo) && newCoords && deliveryCoords) {
      // Resetta i prezzi precedenti
      setDostavkaPriceInfo(null);
      setGoPriceInfo(null);
      setDostavkaError(null);
      setGoError(null);
      setSelectedService(null);
      setSelectedDostavkaOffer('');
      
      // Ricalcola automaticamente dopo un breve delay per permettere l'aggiornamento dello stato
      setTimeout(() => {
        calculatePricesMutation.mutate();
      }, 100);
    }
  };
  
  // Handle delivery address selection
  const handleDeliveryAddressSelect = (suggestion: AddressSuggestion) => {
    setDeliveryAddress(suggestion.fullAddress);
    
    const newCoords = suggestion.geoLat && suggestion.geoLon ? [
      parseFloat(suggestion.geoLon),
      parseFloat(suggestion.geoLat)
    ] as [number, number] : null;
    
    setDeliveryCoords(newCoords);
    
    // Se erano già stati calcolati i prezzi e abbiamo coordinate valide, ricalcola automaticamente
    if ((dostavkaPriceInfo || goPriceInfo) && pickupCoords && newCoords) {
      // Resetta i prezzi precedenti
      setDostavkaPriceInfo(null);
      setGoPriceInfo(null);
      setDostavkaError(null);
      setGoError(null);
      setSelectedService(null);
      setSelectedDostavkaOffer('');
      
      // Ricalcola automaticamente dopo un breve delay per permettere l'aggiornamento dello stato
      setTimeout(() => {
        calculatePricesMutation.mutate();
      }, 100);
    }
  };
  
  // Recalculate delivery coordinates from current address
  const recalculateDeliveryCoords = async () => {
    setIsRecalculatingDelivery(true);
    try {
      const response = await fetch(`/api/address/suggest?query=${encodeURIComponent(deliveryAddress)}`);
      const data = await response.json();
      
      if (data.suggestions && data.suggestions.length > 0) {
        const suggestion = data.suggestions[0];
        
        if (suggestion.geoLat && suggestion.geoLon) {
          const coords: [number, number] = [
            parseFloat(suggestion.geoLon),
            parseFloat(suggestion.geoLat)
          ];
          setDeliveryCoords(coords);
          
          await apiRequest('PATCH', `/api/admin/orders/${order.id}`, {
            deliveryLatitude: coords[1].toString(),
            deliveryLongitude: coords[0].toString(),
          });
          
          queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
          
          toast({
            title: 'Координаты найдены',
            description: 'Координаты доставки успешно рассчитаны и сохранены',
          });
          
          // Se erano già stati calcolati i prezzi, ricalcola automaticamente
          if ((dostavkaPriceInfo || goPriceInfo) && pickupCoords && coords) {
            // Resetta i prezzi precedenti
            setDostavkaPriceInfo(null);
            setGoPriceInfo(null);
            setDostavkaError(null);
            setGoError(null);
            setSelectedService(null);
            
            // Ricalcola automaticamente dopo un breve delay
            setTimeout(() => {
              calculatePricesMutation.mutate();
            }, 100);
          }
        } else {
          throw new Error('DaData не вернул координаты для этого адреса');
        }
      } else {
        throw new Error('Адрес не найден в DaData');
      }
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось рассчитать координаты',
        variant: 'destructive',
      });
    } finally {
      setIsRecalculatingDelivery(false);
    }
  };
  
  // Save new pickup address mutation
  const savePickupAddressMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/pickup-addresses', {
        label: pickupLabel,
        fullAddress: pickupAddress,
        city: pickupStructured.city,
        street: pickupStructured.street,
        building: pickupStructured.building,
        postalCode: pickupStructured.postalCode,
        latitude: pickupCoords?.[1]?.toString(),
        longitude: pickupCoords?.[0]?.toString(),
        contactName: pickupContactName,
        contactPhone: pickupContactPhone,
        dadataFiasId: pickupStructured.dadataFiasId,
      });
      
      return response.json();
    },
    onSuccess: (data) => {
      setSelectedPickupId(data.id);
      setShowPickupForm(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pickup-addresses'] });
      toast({
        title: 'Адрес сохранен',
        description: `Адрес "${pickupLabel}" успешно сохранен`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка сохранения',
        description: error.message || 'Не удалось сохранить адрес',
        variant: 'destructive',
      });
    },
  });
  
  // Calculate prices for both services
  const calculatePricesMutation = useMutation({
    mutationFn: async () => {
      if (!pickupCoords || !deliveryCoords) {
        throw new Error('Координаты не указаны');
      }
      
      // Reset previous errors and prices
      setDostavkaError(null);
      setGoError(null);
      setDostavkaPriceInfo(null);
      setGoPriceInfo(null);
      
      // Calculate prices for both services in parallel
      const [dostavkaResponse, goResponse] = await Promise.allSettled([
        apiRequest('POST', `/api/admin/orders/${order.id}/yandex-delivery-price`, {
          pickupCoordinates: pickupCoords,
          deliveryCoordinates: deliveryCoords,
        }),
        apiRequest('POST', `/api/admin/orders/${order.id}/yandex-go-price`, {
          pickupAddress,
          pickupCoords,
        })
      ]);
      
      const results: { dostavka?: any; dostavkaError?: string; go?: any; goError?: string } = {};
      
      if (dostavkaResponse.status === 'fulfilled') {
        try {
          results.dostavka = await dostavkaResponse.value.json();
        } catch (e) {
          results.dostavkaError = 'Ошибка обработки ответа от Yandex Dostavka';
        }
      } else {
        results.dostavkaError = dostavkaResponse.reason?.message || 'Сервис Yandex Dostavka недоступен';
      }
      
      if (goResponse.status === 'fulfilled') {
        try {
          results.go = await goResponse.value.json();
        } catch (e) {
          results.goError = 'Ошибка обработки ответа от Yandex Go';
        }
      } else {
        results.goError = goResponse.reason?.message || 'Сервис Yandex Go недоступен';
      }
      
      return results;
    },
    onSuccess: (data) => {
      // Handle Yandex Dostavka result
      if (data.dostavka) {
        setDostavkaPriceInfo(data.dostavka);
        setDostavkaError(null);
      } else if (data.dostavkaError) {
        setDostavkaPriceInfo(null);
        setDostavkaError(data.dostavkaError);
      }
      
      // Handle Yandex Go result
      if (data.go) {
        setGoPriceInfo(data.go);
        setGoError(null);
      } else if (data.goError) {
        setGoPriceInfo(null);
        setGoError(data.goError);
      }
      
      // Show success notification only if at least one service returned a price
      if (data.dostavka || data.go) {
        toast({
          title: 'Расчет завершен',
          description: 'Результаты отображены ниже',
        });
      } else {
        toast({
          title: 'Не удалось рассчитать цены',
          description: 'Оба сервиса недоступны. Проверьте адреса и попробуйте снова.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось выполнить расчет',
        variant: 'destructive',
      });
    },
  });
  
  // Create delivery with Yandex Dostavka
  const createDostavkaDelivery = async () => {
    if (!pickupCoords || !deliveryCoords) {
      throw new Error('Координаты не указаны');
    }
    
    if (!selectedDostavkaOffer && dostavkaPriceInfo?.all_offers?.length) {
      throw new Error('Выберите вариант доставки');
    }
    
    const response = await apiRequest('POST', `/api/admin/orders/${order.id}/yandex-delivery`, {
      pickupAddress,
      pickupCoordinates: pickupCoords,
      deliveryAddress,
      deliveryCoordinates: deliveryCoords,
      pickupContact: {
        name: pickupContactName || 'Don Giulio Select',
        phone: pickupContactPhone || '+79000000000',
      },
      deliveryContact: {
        name: deliveryContactName || order.customerName,
        phone: deliveryContactPhone || order.customerPhone,
      },
      offerId: selectedDostavkaOffer || dostavkaPriceInfo?.offer_id,  // Passa l'offerta selezionata
    });
    
    return response.json();
  };
  
  // Create delivery with Yandex Go
  const createGoDelivery = async () => {
    if (!pickupCoords || !deliveryCoords) {
      throw new Error('Координаты не указаны');
    }
    
    const response = await apiRequest('POST', `/api/admin/orders/${order.id}/yandex-go`, {
      pickupAddress,
      pickupCoords,
      pickupContactName: pickupContactName || 'Don Giulio Select',
      pickupContactPhone: pickupContactPhone || '+79000000000',
      deliveryAddress,
      deliveryCoords,
      deliveryContactName: deliveryContactName || order.customerName,
      deliveryContactPhone: deliveryContactPhone || order.customerPhone,
    });
    
    return response.json();
  };
  
  // Create delivery mutation
  const createDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!selectedService) {
        throw new Error('Выберите службу доставки');
      }
      
      if (selectedService === 'dostavka') {
        return await createDostavkaDelivery();
      } else {
        return await createGoDelivery();
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: 'Курьер вызван',
        description: `Заказ на доставку создан успешно`,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось создать заказ на доставку',
        variant: 'destructive',
      });
    },
  });
  
  // Cancel delivery mutation
  const cancelDeliveryMutation = useMutation({
    mutationFn: async () => {
      let endpoint = '';
      if (order.yandexClaimId) {
        endpoint = `/api/admin/orders/${order.id}/yandex-delivery-cancel`;
      } else if (order.yandexGoClaimId) {
        endpoint = `/api/admin/orders/${order.id}/yandex-go-cancel`;
      } else {
        throw new Error('Нет активной доставки для отмены');
      }
      
      const response = await apiRequest('POST', endpoint);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: 'Доставка отменена',
        description: 'Заказ на доставку успешно отменен',
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось отменить доставку',
        variant: 'destructive',
      });
    },
  });
  
  const handleCalculatePrices = () => {
    if (!pickupAddress || !pickupCoords) {
      toast({
        title: 'Ошибка',
        description: 'Укажите адрес и координаты точки отправления',
        variant: 'destructive',
      });
      return;
    }
    
    if (!deliveryAddress || !deliveryCoords) {
      toast({
        title: 'Ошибка',
        description: 'Укажите адрес и координаты точки доставки',
        variant: 'destructive',
      });
      return;
    }
    
    calculatePricesMutation.mutate();
  };
  
  const handleCreateDelivery = () => {
    if (!selectedService) {
      toast({
        title: 'Ошибка',
        description: 'Выберите службу доставки',
        variant: 'destructive',
      });
      return;
    }
    
    createDeliveryMutation.mutate();
  };
  
  const canCalculatePrices = pickupCoords && deliveryCoords && !calculatePricesMutation.isPending;
  const canCreateDelivery = (dostavkaPriceInfo || goPriceInfo) && selectedService && !createDeliveryMutation.isPending;
  const hasActiveDelivery = !!(order.yandexClaimId || order.yandexGoClaimId);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-unified-delivery">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            {hasActiveDelivery ? 'Управление доставкой' : 'Вызов курьера'}
          </DialogTitle>
          <DialogDescription>
            Заказ {order.id.substring(0, 8)} • {order.customerName}
          </DialogDescription>
        </DialogHeader>
        
        {hasActiveDelivery ? (
          <div className="space-y-4">
            {order.yandexClaimId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Yandex Dostavka
                  </CardTitle>
                  <CardDescription>ID: {order.yandexClaimId}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Статус:</span>
                      <Badge>{order.yandexDeliveryStatus || 'В обработке'}</Badge>
                    </div>
                    {order.yandexDeliveryPrice && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Стоимость:</span>
                        <span className="text-sm">{order.yandexDeliveryPrice} ₽</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {order.yandexGoClaimId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Car className="w-4 h-4" />
                    Yandex Go Express
                  </CardTitle>
                  <CardDescription>ID: {order.yandexGoClaimId}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Статус:</span>
                      <Badge>{order.yandexGoStatus || 'В обработке'}</Badge>
                    </div>
                    {order.yandexGoPrice && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Стоимость:</span>
                        <span className="text-sm">{order.yandexGoPrice} ₽</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pickup Address Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Адрес отправления
              </Label>
              
              {!showPickupForm ? (
                <Select value={selectedPickupId} onValueChange={handlePickupChange}>
                  <SelectTrigger data-testid="select-pickup-address">
                    <SelectValue placeholder="Выберите адрес отправления" />
                  </SelectTrigger>
                  <SelectContent>
                    {pickupAddresses.map((addr) => (
                      <SelectItem key={addr.id} value={addr.id}>
                        {addr.label} - {addr.fullAddress}
                      </SelectItem>
                    ))}
                    <SelectItem value="new">+ Добавить новый адрес</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-3 border p-3 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="pickup-label">Название адреса</Label>
                    <Input
                      id="pickup-label"
                      value={pickupLabel}
                      onChange={(e) => setPickupLabel(e.target.value)}
                      placeholder="Например: Магазин на Тверской"
                      data-testid="input-pickup-label"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Адрес</Label>
                    <AddressAutocomplete
                      value={pickupAddress}
                      onChange={setPickupAddress}
                      onSelect={handlePickupAddressSelect}
                      placeholder="Введите адрес отправления"
                      testId="input-pickup-address"
                    />
                    {pickupCoords && (
                      <p className="text-xs text-muted-foreground">
                        Координаты: {pickupCoords[1]}, {pickupCoords[0]}
                      </p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Контактное лицо
                      </Label>
                      <Input
                        value={pickupContactName}
                        onChange={(e) => setPickupContactName(e.target.value)}
                        placeholder="Имя"
                        data-testid="input-pickup-contact-name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Телефон
                      </Label>
                      <Input
                        value={pickupContactPhone}
                        onChange={(e) => setPickupContactPhone(e.target.value)}
                        placeholder="+7 (999) 999-99-99"
                        data-testid="input-pickup-contact-phone"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setShowPickupForm(false);
                        if (pickupAddresses.length > 0) {
                          const addr = pickupAddresses[0];
                          handlePickupChange(addr.id);
                        }
                      }}
                      data-testid="button-cancel-new-pickup"
                    >
                      Отмена
                    </Button>
                    
                    <Button
                      size="sm"
                      onClick={() => savePickupAddressMutation.mutate()}
                      disabled={!pickupLabel || !pickupAddress || !pickupCoords || savePickupAddressMutation.isPending}
                      data-testid="button-save-pickup-address"
                    >
                      {savePickupAddressMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Сохранение...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Сохранить адрес
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
              
              {pickupContactPhone && (
                <p className="text-sm text-muted-foreground">
                  Контакт: {pickupContactName} • {pickupContactPhone}
                </p>
              )}
            </div>
            
            <Separator />
            
            {/* Delivery Address Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Адрес доставки
                </Label>
                {!isEditingDelivery && deliveryAddress && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingDelivery(true)}
                    data-testid="button-edit-delivery"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                )}
              </div>
              
              {isEditingDelivery ? (
                <div className="space-y-3 border p-3 rounded-lg">
                  <AddressAutocomplete
                    value={deliveryAddress}
                    onChange={setDeliveryAddress}
                    onSelect={handleDeliveryAddressSelect}
                    placeholder="Введите адрес доставки"
                    testId="input-delivery-address"
                  />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Получатель
                      </Label>
                      <Input
                        value={deliveryContactName}
                        onChange={(e) => setDeliveryContactName(e.target.value)}
                        placeholder="Имя получателя"
                        data-testid="input-delivery-contact-name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Телефон
                      </Label>
                      <Input
                        value={deliveryContactPhone}
                        onChange={(e) => setDeliveryContactPhone(e.target.value)}
                        placeholder="+7 (999) 999-99-99"
                        data-testid="input-delivery-contact-phone"
                      />
                    </div>
                  </div>
                  
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setIsEditingDelivery(false)}
                    data-testid="button-save-delivery-changes"
                  >
                    Готово
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm">{deliveryAddress}</p>
                  <p className="text-sm text-muted-foreground">
                    Получатель: {deliveryContactName} • {deliveryContactPhone}
                  </p>
                  {deliveryCoords ? (
                    <p className="text-xs text-muted-foreground">
                      Координаты: {deliveryCoords[1]}, {deliveryCoords[0]}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-red-500">Координаты не указаны</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={recalculateDeliveryCoords}
                        disabled={isRecalculatingDelivery}
                        data-testid="button-recalculate-delivery-coords"
                      >
                        {isRecalculatingDelivery ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Поиск...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Рассчитать координаты
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Price Comparison Section - Always show after calculation */}
            {(dostavkaPriceInfo || goPriceInfo || dostavkaError || goError) && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label>Результаты расчета стоимости доставки:</Label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Yandex Dostavka Card - Shows all available offers */}
                    <Card 
                      className={`transition-all ${
                        dostavkaPriceInfo ? `${selectedService === 'dostavka' ? 'ring-2 ring-primary' : ''}` : 'opacity-75'
                      }`}
                      data-testid="card-dostavka-option"
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          Yandex Dostavka
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {dostavkaPriceInfo ? (
                          <div className="space-y-3">
                            {/* Mostra tutte le offerte disponibili */}
                            {dostavkaPriceInfo.all_offers && dostavkaPriceInfo.all_offers.length > 0 ? (
                              <div className="space-y-2">
                                {dostavkaPriceInfo.all_offers.map((offer, index) => {
                                  // Calcola i tempi di consegna dalle date ISO
                                  const deliveryTime = offer.delivery_interval?.to ? 
                                    Math.round((new Date(offer.delivery_interval.to).getTime() - new Date(offer.delivery_interval.from).getTime()) / 60000) : 
                                    Math.round(dostavkaPriceInfo.eta / 60);
                                  
                                  // Traduci le descrizioni
                                  const descriptions: { [key: string]: string } = {
                                    'express': 'Экспресс доставка',
                                    'express_30min_longer': 'Стандарт (+30 мин)',
                                    'express_60min_longer': 'Эконом (+60 мин)',
                                    '2_hours_delivery': 'В течение 2 часов',
                                    '4_hours_delivery': 'В течение 4 часов'
                                  };
                                  
                                  return (
                                    <div
                                      key={offer.payload}
                                      className={`p-2 border rounded cursor-pointer transition-all ${
                                        selectedDostavkaOffer === offer.payload ? 
                                        'border-primary bg-primary/5' : 
                                        'border-muted hover:border-primary/50'
                                      }`}
                                      onClick={() => {
                                        setSelectedService('dostavka');
                                        setSelectedDostavkaOffer(offer.payload);
                                      }}
                                      data-testid={`dostavka-offer-${index}`}
                                    >
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <p className="font-medium text-sm">
                                            {descriptions[offer.description] || offer.description}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            ~{deliveryTime} мин • {(dostavkaPriceInfo.distance_meters / 1000).toFixed(1)} км
                                          </p>
                                        </div>
                                        <p className="font-bold text-lg">
                                          {offer.price.total_price} ₽
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              // Fallback se non ci sono all_offers (compatibilità)
                              <div className="space-y-1">
                                <p className="text-2xl font-bold">
                                  {dostavkaPriceInfo.price} {dostavkaPriceInfo.currency_rules.sign}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  ~{Math.round(dostavkaPriceInfo.eta / 60)} мин • {(dostavkaPriceInfo.distance_meters / 1000).toFixed(1)} км
                                </p>
                                <Badge variant="secondary" className="text-xs">
                                  Курьер пешком/велосипед
                                </Badge>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-destructive">
                              <XCircle className="w-4 h-4" />
                              <span className="text-sm font-medium">Недоступно</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {dostavkaError || 'Не удалось получить расчет'}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    
                    {/* Yandex Go Card - Always show after calculation */}
                    <Card 
                      className={`transition-all ${
                        goPriceInfo ? `cursor-pointer ${selectedService === 'go' ? 'ring-2 ring-primary' : ''}` : 'opacity-75'
                      }`}
                      onClick={() => goPriceInfo && setSelectedService('go')}
                      data-testid="card-go-option"
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Car className="w-4 h-4" />
                          Yandex Go Express
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {goPriceInfo ? (
                          <div className="space-y-1">
                            <p className="text-2xl font-bold">
                              {goPriceInfo.price} ₽
                            </p>
                            <p className="text-sm text-muted-foreground">
                              ~{goPriceInfo.time} мин • {goPriceInfo.distance.toFixed(1)} км
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              Курьер на авто
                            </Badge>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-destructive">
                              <XCircle className="w-4 h-4" />
                              <span className="text-sm font-medium">Недоступно</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {goError || 'Не удалось получить расчет'}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-delivery"
          >
            Отмена
          </Button>
          
          {hasActiveDelivery ? (
            <Button
              onClick={() => cancelDeliveryMutation.mutate()}
              disabled={cancelDeliveryMutation.isPending}
              variant="destructive"
              data-testid="button-cancel-active-delivery"
            >
              {cancelDeliveryMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отмена...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Отменить доставку
                </>
              )}
            </Button>
          ) : (
            <>
              {!(dostavkaPriceInfo || goPriceInfo) && (
                <Button
                  onClick={handleCalculatePrices}
                  disabled={!canCalculatePrices}
                  variant="secondary"
                  data-testid="button-calculate-prices"
                >
                  {calculatePricesMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Расчет...
                    </>
                  ) : (
                    <>
                      Рассчитать стоимость
                    </>
                  )}
                </Button>
              )}
              
              {(dostavkaPriceInfo || goPriceInfo) && (
                <Button
                  onClick={handleCreateDelivery}
                  disabled={!canCreateDelivery}
                  data-testid="button-call-courier"
                >
                  {createDeliveryMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Вызов...
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4 mr-2" />
                      Вызвать курьера
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}