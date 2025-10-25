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
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Truck, DollarSign, MapPin, Phone, User, Save, RefreshCw, Edit } from 'lucide-react';
import { AddressAutocomplete, type AddressSuggestion } from '@/components/AddressAutocomplete';
import type { Order, PickupAddress } from '@shared/schema';

interface YandexDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
}

interface PriceInfo {
  price: string;
  currency_rules: {
    code: string;
    sign: string;
  };
  distance_meters: number;
  eta: number;
}

export function YandexDeliveryDialog({
  open,
  onOpenChange,
  order,
}: YandexDeliveryDialogProps) {
  const { toast } = useToast();
  
  // Pickup address state
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [pickupContactName, setPickupContactName] = useState('');
  const [pickupContactPhone, setPickupContactPhone] = useState('');
  const [pickupLabel, setPickupLabel] = useState('');
  const [showPickupForm, setShowPickupForm] = useState(false);
  
  // Delivery address state
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState<[number, number] | null>(null);
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
  
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  
  // Load pickup addresses
  const { data: pickupAddresses = [], isLoading: isLoadingPickup } = useQuery<PickupAddress[]>({
    queryKey: ['/api/admin/pickup-addresses'],
    enabled: open,
  });
  
  // Initialize with default pickup address or show form
  useEffect(() => {
    if (pickupAddresses.length > 0) {
      const defaultAddr = pickupAddresses.find(addr => addr.isDefault) || pickupAddresses[0];
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
    } else {
      // No pickup addresses exist - show form to create one
      setShowPickupForm(true);
      setPickupLabel('Магазин Don Giulio');
      setPickupContactName('Don Giulio Select');
    }
  }, [pickupAddresses]);
  
  // Initialize delivery address and coordinates from order
  useEffect(() => {
    setDeliveryAddress(order.deliveryAddress);
    
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
  
  // Handle address selection from DaData (for pickup)
  const handlePickupAddressSelect = (suggestion: AddressSuggestion) => {
    setPickupAddress(suggestion.fullAddress);
    setPickupStructured({
      city: suggestion.city || undefined,
      street: suggestion.street || undefined,
      building: suggestion.building || undefined,
      postalCode: suggestion.postalCode || undefined,
      dadataFiasId: suggestion.fiasId,
    });
    
    if (suggestion.geoLat && suggestion.geoLon) {
      setPickupCoords([
        parseFloat(suggestion.geoLon),
        parseFloat(suggestion.geoLat)
      ]);
    }
  };
  
  // Handle delivery address selection from DaData
  const handleDeliveryAddressSelect = (suggestion: AddressSuggestion) => {
    setDeliveryAddress(suggestion.fullAddress);
    
    if (suggestion.geoLat && suggestion.geoLon) {
      const coords: [number, number] = [
        parseFloat(suggestion.geoLon),
        parseFloat(suggestion.geoLat)
      ];
      setDeliveryCoords(coords);
    }
  };
  
  // Recalculate delivery coordinates from current address using DaData
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
          
          // Save coordinates to order
          await apiRequest('PATCH', `/api/admin/orders/${order.id}`, {
            deliveryLatitude: coords[1].toString(),
            deliveryLongitude: coords[0].toString(),
          });
          
          queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
          
          toast({
            title: 'Координаты найдены',
            description: 'Координаты доставки успешно рассчитаны и сохранены',
          });
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
  const savePickupMutation = useMutation({
    mutationFn: async () => {
      if (!pickupCoords) {
        throw new Error('Координаты pick-up не найдены');
      }
      
      const res = await apiRequest('POST', '/api/admin/pickup-addresses', {
        label: pickupLabel,
        fullAddress: pickupAddress,
        ...pickupStructured,
        latitude: pickupCoords[1].toString(),
        longitude: pickupCoords[0].toString(),
        contactName: pickupContactName,
        contactPhone: pickupContactPhone,
        isDefault: pickupAddresses.length === 0, // First one becomes default
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pickup-addresses'] });
      setShowPickupForm(false);
      toast({
        title: 'Адрес сохранён',
        description: 'Адрес pick-up успешно сохранён',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось сохранить адрес',
        variant: 'destructive',
      });
    },
  });
  
  // Calculate price mutation
  const calculatePriceMutation = useMutation({
    mutationFn: async () => {
      if (!pickupCoords || !deliveryCoords) {
        throw new Error('Координаты не найдены');
      }
      
      const res = await apiRequest('POST', `/api/admin/orders/${order.id}/yandex-delivery-price`, {
        pickupCoordinates: pickupCoords,
        deliveryCoordinates: deliveryCoords,
        requirements: {
          taxi_class: 'cargo',
          cargo_options: ['thermobag'],
        },
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setPriceInfo(data);
      toast({
        title: 'Цена рассчитана',
        description: `${data.price} ${data.currency_rules.code}, ETA: ${Math.round(data.eta / 60)} мин`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось рассчитать цену доставки',
        variant: 'destructive',
      });
    },
  });
  
  // Create delivery mutation
  const createDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!pickupCoords || !deliveryCoords) {
        throw new Error('Координаты не найдены');
      }
      
      const res = await apiRequest('POST', `/api/admin/orders/${order.id}/yandex-delivery`, {
        pickupCoordinates: pickupCoords,
        deliveryCoordinates: deliveryCoords,
        pickupAddress,
        pickupContact: {
          name: pickupContactName,
          phone: pickupContactPhone,
        },
        deliveryContact: {
          name: order.customerName,
          phone: order.customerPhone,
        },
        requirements: {
          taxi_class: 'cargo',
          cargo_options: ['thermobag'],
        },
        comment: `Заказ ${order.id.slice(0, 8)} - Don Giulio Select`,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Курьер вызван',
        description: 'Заказ на доставку Яндекс Go создан успешно',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
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
  
  const canCalculate = pickupCoords && deliveryCoords && !showPickupForm;
  const canCreateDelivery = priceInfo && pickupCoords && deliveryCoords && !showPickupForm;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Вызов курьера Яндекс Go
          </DialogTitle>
          <DialogDescription>
            Заказ #{order.id.slice(0, 8)} - {order.customerName}
          </DialogDescription>
        </DialogHeader>
        
        {isLoadingPickup ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Pickup Info */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Точка отправления (Pick-up)
                </h3>
                {!showPickupForm && pickupAddresses.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPickupForm(true)}
                    data-testid="button-add-pickup"
                  >
                    Новый адрес
                  </Button>
                )}
              </div>
              
              {showPickupForm ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pickup-label" data-testid="label-pickup-label">
                      Название адреса
                    </Label>
                    <Input
                      id="pickup-label"
                      data-testid="input-pickup-label"
                      value={pickupLabel}
                      onChange={(e) => setPickupLabel(e.target.value)}
                      placeholder="Магазин Don Giulio"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="pickup-address" data-testid="label-pickup-address">
                      Адрес (с DaData автозаполнением)
                    </Label>
                    <AddressAutocomplete
                      value={pickupAddress}
                      onChange={(value) => setPickupAddress(value)}
                      onSelect={handlePickupAddressSelect}
                      placeholder="Москва, ул. Примерная, д. 1"
                      testId="input-pickup-address"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pickup-name" data-testid="label-pickup-name">
                        <User className="w-3 h-3 inline mr-1" />
                        Контакт
                      </Label>
                      <Input
                        id="pickup-name"
                        data-testid="input-pickup-name"
                        value={pickupContactName}
                        onChange={(e) => setPickupContactName(e.target.value)}
                        placeholder="Don Giulio Select"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pickup-phone" data-testid="label-pickup-phone">
                        <Phone className="w-3 h-3 inline mr-1" />
                        Телефон
                      </Label>
                      <Input
                        id="pickup-phone"
                        data-testid="input-pickup-phone"
                        value={pickupContactPhone}
                        onChange={(e) => setPickupContactPhone(e.target.value)}
                        placeholder="+7 (900) 123-45-67"
                      />
                    </div>
                  </div>
                  
                  {pickupCoords && (
                    <div className="text-sm text-muted-foreground">
                      Координаты: {pickupCoords[1].toFixed(6)}, {pickupCoords[0].toFixed(6)}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={() => savePickupMutation.mutate()}
                      disabled={!pickupAddress || !pickupCoords || savePickupMutation.isPending}
                      data-testid="button-save-pickup"
                    >
                      {savePickupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <Save className="w-4 h-4 mr-2" />
                      Сохранить адрес
                    </Button>
                    {pickupAddresses.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setShowPickupForm(false)}
                        data-testid="button-cancel-pickup"
                      >
                        Отмена
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label data-testid="label-pickup-current">Адрес</Label>
                    <Input
                      data-testid="input-pickup-current"
                      value={pickupAddress}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label data-testid="label-pickup-current-name">Контакт</Label>
                      <Input
                        data-testid="input-pickup-current-name"
                        value={pickupContactName}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label data-testid="label-pickup-current-phone">Телефон</Label>
                      <Input
                        data-testid="input-pickup-current-phone"
                        value={pickupContactPhone}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>
                  
                  {pickupCoords && (
                    <div className="text-sm text-muted-foreground">
                      Координаты: {pickupCoords[1].toFixed(6)}, {pickupCoords[0].toFixed(6)}
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Delivery Info */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Точка доставки (Delivery)
                </h3>
                {!isEditingDelivery && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingDelivery(true)}
                    data-testid="button-edit-delivery"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Изменить
                  </Button>
                )}
              </div>
              
              <div className="space-y-2">
                <Label data-testid="label-delivery-address">Адрес</Label>
                {isEditingDelivery ? (
                  <AddressAutocomplete
                    value={deliveryAddress}
                    onChange={(value) => setDeliveryAddress(value)}
                    onSelect={handleDeliveryAddressSelect}
                    placeholder="Москва, ул. Примерная, д. 1"
                    testId="input-delivery-address-edit"
                  />
                ) : (
                  <Input
                    data-testid="input-delivery-address"
                    value={deliveryAddress}
                    disabled
                    className="bg-muted"
                  />
                )}
              </div>
              
              {isEditingDelivery && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDeliveryAddress(order.deliveryAddress);
                    setIsEditingDelivery(false);
                  }}
                  data-testid="button-cancel-delivery-edit"
                >
                  Отмена
                </Button>
              )}
              
              {deliveryCoords ? (
                <div className="text-sm text-muted-foreground">
                  Координаты: {deliveryCoords[1].toFixed(6)}, {deliveryCoords[0].toFixed(6)}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-destructive">
                    ⚠️ Координаты доставки не найдены
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={recalculateDeliveryCoords}
                    disabled={isRecalculatingDelivery}
                    data-testid="button-recalculate-delivery-coords"
                  >
                    {isRecalculatingDelivery && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Рассчитать координаты из адреса
                  </Button>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label data-testid="label-delivery-name">Контакт</Label>
                  <Input
                    data-testid="input-delivery-name"
                    value={order.customerName}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label data-testid="label-delivery-phone">Телефон</Label>
                  <Input
                    data-testid="input-delivery-phone"
                    value={order.customerPhone}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
            </div>
            
            {/* Price Info */}
            {priceInfo && (
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Информация о доставке
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Стоимость:</span>
                    <span className="ml-2 font-semibold" data-testid="text-delivery-price">
                      {priceInfo.price} {priceInfo.currency_rules.sign}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Время:</span>
                    <span className="ml-2 font-semibold" data-testid="text-delivery-eta">
                      ~{Math.round(priceInfo.eta / 60)} мин
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Расстояние:</span>
                    <span className="ml-2 font-semibold" data-testid="text-delivery-distance">
                      {(priceInfo.distance_meters / 1000).toFixed(1)} км
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Отмена
          </Button>
          <Button
            variant="secondary"
            onClick={() => calculatePriceMutation.mutate()}
            disabled={!canCalculate || calculatePriceMutation.isPending}
            data-testid="button-calculate-price"
          >
            {calculatePriceMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Рассчитать цену
          </Button>
          <Button
            onClick={() => createDeliveryMutation.mutate()}
            disabled={!canCreateDelivery || createDeliveryMutation.isPending}
            data-testid="button-create-delivery"
          >
            {createDeliveryMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Вызвать курьера
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
