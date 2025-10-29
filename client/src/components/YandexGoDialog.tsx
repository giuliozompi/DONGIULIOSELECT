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
import { Loader2, Truck, DollarSign, MapPin, Phone, User, Save, RefreshCw, Edit, XCircle } from 'lucide-react';
import { AddressAutocomplete, type AddressSuggestion } from '@/components/AddressAutocomplete';
import type { Order, PickupAddress } from '@shared/schema';

interface YandexGoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
}

interface PriceInfo {
  price: string;
  currency: string;
  distance: number;
  time: number;
}

export function YandexGoDialog({
  open,
  onOpenChange,
  order,
}: YandexGoDialogProps) {
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
  
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  
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
    setPriceInfo(null); // Reset price info when order changes
  }, [order]);
  
  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPriceInfo(null);
    }
  }, [open]);
  
  // Handle pickup address change from dropdown
  const handlePickupChange = (addressId: string) => {
    const selectedAddr = pickupAddresses.find(addr => addr.id === addressId);
    if (!selectedAddr) return;
    
    setSelectedPickupId(selectedAddr.id);
    setPickupAddress(selectedAddr.fullAddress);
    setPickupContactName(selectedAddr.contactName || '');
    setPickupContactPhone(selectedAddr.contactPhone || '');
    setPickupLabel(selectedAddr.label);
    
    if (selectedAddr.latitude && selectedAddr.longitude) {
      setPickupCoords([
        parseFloat(selectedAddr.longitude),
        parseFloat(selectedAddr.latitude)
      ]);
    }
  };
  
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
  const savePickupAddressMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/pickup-addresses', {
        label: pickupLabel,
        fullAddress: pickupAddress,
        city: pickupStructured.city,
        street: pickupStructured.street,
        building: pickupStructured.building,
        postalCode: pickupStructured.postalCode,
        dadataFiasId: pickupStructured.dadataFiasId,
        latitude: pickupCoords?.[1]?.toString(),
        longitude: pickupCoords?.[0]?.toString(),
        contactName: pickupContactName,
        contactPhone: pickupContactPhone,
        isDefault: false,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pickup-addresses'] });
      setShowPickupForm(false);
      toast({
        title: 'Адрес забора сохранен',
        description: 'Теперь его можно использовать для следующих заказов',
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
        throw new Error('Координаты не указаны');
      }
      
      const response = await apiRequest('POST', `/api/admin/orders/${order.id}/yandex-go-price`, {
        pickupAddress,
        pickupCoords,
      });
      
      return response.json();
    },
    onSuccess: (data: PriceInfo) => {
      setPriceInfo(data);
      toast({
        title: 'Цена рассчитана',
        description: `${data.price} ${data.currency}`,
      });
    },
    onError: (error: any) => {
      // Handle different error types
      if (error.status === 403) {
        toast({
          title: 'Token non autorizzato',
          description: 'Il token Yandex Go non ha i permessi corretti. Contatta l\'amministratore per configurare il token con permessi "cargo:write" e "cargo:read".',
          variant: 'destructive',
        });
      } else if (error.status === 401) {
        toast({
          title: 'Token non valido',  
          description: 'Il token Yandex Go non è valido o è scaduto. Contatta l\'amministratore.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Ошибка',
          description: error.message || 'Не удалось рассчитать цену',
          variant: 'destructive',
        });
      }
    },
  });
  
  // Create delivery mutation
  const createDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!pickupCoords || !deliveryCoords) {
        throw new Error('Координаты не указаны');
      }
      
      const response = await apiRequest('POST', `/api/admin/orders/${order.id}/yandex-go`, {
        pickupAddress,
        pickupCoords,
        pickupContactName,
        pickupContactPhone,
        deliveryAddress,
        deliveryCoords,
        deliveryContactName,
        deliveryContactPhone,
      });
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: 'Курьер вызван!',
        description: 'Yandex Go доставка создана успешно',
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      // Handle different error types
      if (error.status === 403) {
        toast({
          title: 'Token non autorizzato',
          description: 'Il token Yandex Go non ha i permessi corretti. Contatta l\'amministratore per configurare il token con permessi "cargo:write" e "cargo:read".',
          variant: 'destructive',
        });
      } else if (error.status === 401) {
        toast({
          title: 'Token non valido',  
          description: 'Il token Yandex Go non è valido o è scaduto. Contatta l\'amministratore.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Ошибка',
          description: error.message || 'Не удалось вызвать курьера',
          variant: 'destructive',
        });
      }
    },
  });
  
  // Cancel delivery mutation
  const cancelDeliveryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/orders/${order.id}/yandex-go-cancel`, {});
      return response.json();
    },
    onSuccess: async () => {
      // Invalida la query per ricaricare la lista ordini
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({
        title: 'Доставка отменена',
        description: 'Yandex Go доставка успешно отменена. Ora puoi richiamare il corriere.',
      });
      // Chiudi il dialog - quando si riapre vedrà l'ordine aggiornato
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
  
  const handleCalculatePrice = () => {
    if (!pickupAddress || !pickupCoords) {
      toast({
        title: 'Ошибка',
        description: 'Укажите адрес забора',
        variant: 'destructive',
      });
      return;
    }
    
    if (!deliveryCoords) {
      toast({
        title: 'Ошибка',
        description: 'Координаты доставки не найдены',
        variant: 'destructive',
      });
      return;
    }
    
    calculatePriceMutation.mutate();
  };
  
  const handleCreateDelivery = () => {
    if (!pickupAddress || !pickupCoords || !pickupContactPhone) {
      toast({
        title: 'Ошибка',
        description: 'Заполните адрес забора и телефон',
        variant: 'destructive',
      });
      return;
    }
    
    if (!deliveryCoords || !deliveryContactPhone) {
      toast({
        title: 'Ошибка',
        description: 'Координаты доставки и телефон обязательны',
        variant: 'destructive',
      });
      return;
    }
    
    createDeliveryMutation.mutate();
  };
  
  const canCalculatePrice = pickupAddress && pickupCoords && deliveryCoords;
  const canCreateDelivery = canCalculatePrice && priceInfo && pickupContactPhone && deliveryContactPhone;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Yandex Go - Вызов курьера
          </DialogTitle>
          <DialogDescription>
            Заказ #{order.id.substring(0, 8)} • {order.customerName}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Pickup Address Section */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Адрес забора
            </h3>
            
            {!showPickupForm && pickupAddresses.length > 0 ? (
              <>
                <div className="space-y-2">
                  <Label>Выберите адрес</Label>
                  <Select value={selectedPickupId} onValueChange={handlePickupChange}>
                    <SelectTrigger data-testid="select-pickup-address">
                      <SelectValue placeholder="Выберите адрес" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickupAddresses.map((addr) => (
                        <SelectItem key={addr.id} value={addr.id} data-testid={`select-option-pickup-${addr.id}`}>
                          {addr.label} {addr.contactPhone ? `- ${addr.contactPhone}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label data-testid="label-pickup-current-address">
                    <MapPin className="w-3 h-3 inline mr-1" />
                    Адрес
                  </Label>
                  <Input
                    id="pickup-current-address"
                    data-testid="input-pickup-current-address"
                    value={pickupAddress}
                    readOnly
                    className="bg-muted"
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pickup-current-name" data-testid="label-pickup-current-name">
                        <User className="w-3 h-3 inline mr-1" />
                        Контактное лицо
                      </Label>
                      <Input
                        id="pickup-current-name"
                        data-testid="input-pickup-current-name"
                        value={pickupContactName}
                        onChange={(e) => setPickupContactName(e.target.value)}
                        placeholder="Don Giulio Select"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pickup-current-phone" data-testid="label-pickup-current-phone">
                        <Phone className="w-3 h-3 inline mr-1" />
                        Телефон (обязательно)
                      </Label>
                      <Input
                        id="pickup-current-phone"
                        data-testid="input-pickup-current-phone"
                        value={pickupContactPhone}
                        onChange={(e) => setPickupContactPhone(e.target.value)}
                        placeholder="+7 (900) 123-45-67"
                        className={!pickupContactPhone ? 'border-destructive' : ''}
                      />
                      {!pickupContactPhone && (
                        <p className="text-xs text-destructive">
                          Укажите телефон для связи с курьером
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {pickupCoords && (
                    <div className="text-sm text-muted-foreground">
                      Координаты: {pickupCoords[1].toFixed(6)}, {pickupCoords[0].toFixed(6)}
                    </div>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPickupForm(true)}
                  data-testid="button-add-new-pickup"
                >
                  + Добавить новый адрес
                </Button>
              </>
            ) : (
              <div className="space-y-4 p-4 border rounded-md">
                <div className="space-y-2">
                  <Label>Название адреса</Label>
                  <Input
                    value={pickupLabel}
                    onChange={(e) => setPickupLabel(e.target.value)}
                    placeholder="Например: Магазин Don Giulio"
                    data-testid="input-pickup-label"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Адрес забора</Label>
                  <AddressAutocomplete
                    value={pickupAddress}
                    onChange={setPickupAddress}
                    onSelect={handlePickupAddressSelect}
                    placeholder="Начните вводить адрес..."
                    testId="input-pickup-address"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Контактное лицо</Label>
                    <Input
                      value={pickupContactName}
                      onChange={(e) => setPickupContactName(e.target.value)}
                      placeholder="Имя"
                      data-testid="input-pickup-contact-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Телефон <span className="text-destructive">*</span></Label>
                    <Input
                      value={pickupContactPhone}
                      onChange={(e) => setPickupContactPhone(e.target.value)}
                      placeholder="+7 XXX XXX XX XX"
                      data-testid="input-pickup-contact-phone"
                    />
                  </div>
                </div>
                
                <Button
                  onClick={() => savePickupAddressMutation.mutate()}
                  disabled={!pickupAddress || !pickupContactPhone || savePickupAddressMutation.isPending}
                  className="w-full"
                  variant="outline"
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
                      Сохранить адрес забора
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
          
          {/* Delivery Address Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Адрес доставки
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
                  onChange={setDeliveryAddress}
                  onSelect={handleDeliveryAddressSelect}
                  placeholder="Начните вводить адрес..."
                  testId="input-delivery-address-autocomplete"
                />
              ) : (
                <Input
                  value={deliveryAddress}
                  readOnly
                  className="bg-muted"
                  data-testid="input-delivery-address"
                />
              )}
            </div>
            
            {isEditingDelivery && (
              <div className="flex gap-2">
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
                <Button
                  size="sm"
                  variant="default"
                  onClick={recalculateDeliveryCoords}
                  disabled={isRecalculatingDelivery}
                  data-testid="button-recalculate-delivery-coords-edit"
                >
                  {isRecalculatingDelivery && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Рассчитать координаты
                </Button>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Получатель</Label>
                <Input
                  value={deliveryContactName}
                  onChange={(e) => setDeliveryContactName(e.target.value)}
                  placeholder="Имя получателя"
                  data-testid="input-delivery-contact-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Телефон <span className="text-destructive">*</span></Label>
                <Input
                  value={deliveryContactPhone}
                  onChange={(e) => setDeliveryContactPhone(e.target.value)}
                  placeholder="+7 XXX XXX XX XX"
                  data-testid="input-delivery-contact-phone"
                />
              </div>
            </div>
            
            {!isEditingDelivery && (
              deliveryCoords ? (
                <div className="text-sm text-muted-foreground">
                  Координаты: {deliveryCoords[1].toFixed(6)}, {deliveryCoords[0].toFixed(6)}
                </div>
              ) : (
                <div className="p-3 border border-amber-500/50 rounded-md bg-amber-500/10">
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                    ⚠️ Координаты доставки отсутствуют. Нажмите кнопку ниже, чтобы рассчитать их из адреса.
                  </p>
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
              )
            )}
          </div>
          
          {/* Price Info */}
          {priceInfo && (
            <div className="p-4 border rounded-md bg-muted/50 space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Информация о доставке
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Цена:</span>
                  <p className="font-semibold">{priceInfo.price} {priceInfo.currency}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Расстояние:</span>
                  <p className="font-semibold">{(priceInfo.distance / 1000).toFixed(1)} км</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Время:</span>
                  <p className="font-semibold">{Math.round(priceInfo.time / 60)} мин</p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-yandex-go"
          >
            Отмена
          </Button>
          
          {order.yandexGoClaimId ? (
            <Button
              onClick={() => cancelDeliveryMutation.mutate()}
              disabled={cancelDeliveryMutation.isPending}
              variant="destructive"
              data-testid="button-cancel-yandex-go-delivery"
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
              <Button
                onClick={handleCalculatePrice}
                disabled={!canCalculatePrice || calculatePriceMutation.isPending}
                variant="secondary"
                data-testid="button-calculate-price-yandex-go"
              >
                {calculatePriceMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Расчет...
                  </>
                ) : (
                  <>
                    <DollarSign className="w-4 h-4 mr-2" />
                    Рассчитать цену
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleCreateDelivery}
                disabled={!canCreateDelivery || createDeliveryMutation.isPending}
                data-testid="button-call-courier-yandex-go"
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
