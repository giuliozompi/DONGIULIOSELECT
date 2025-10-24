import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import { Loader2, Truck, DollarSign, MapPin, Phone, User } from 'lucide-react';
import type { Order } from '@shared/schema';

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
  
  // Form state
  const [pickupAddress, setPickupAddress] = useState('Москва, ул. Примерная, д. 1');
  const [pickupCoords, setPickupCoords] = useState<[number, number]>([37.6173, 55.7558]);
  const [deliveryCoords, setDeliveryCoords] = useState<[number, number]>([37.5879, 55.7344]);
  const [pickupContactName, setPickupContactName] = useState('Don Giulio Select');
  const [pickupContactPhone, setPickupContactPhone] = useState('+79001234567');
  
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  
  // Calculate price mutation
  const calculatePriceMutation = useMutation({
    mutationFn: async () => {
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
  
  const handleCalculatePrice = async () => {
    setIsCalculatingPrice(true);
    try {
      await calculatePriceMutation.mutateAsync();
    } finally {
      setIsCalculatingPrice(false);
    }
  };
  
  const handleCreateDelivery = async () => {
    if (!priceInfo) {
      toast({
        title: 'Ошибка',
        description: 'Сначала рассчитайте цену доставки',
        variant: 'destructive',
      });
      return;
    }
    
    await createDeliveryMutation.mutateAsync();
  };
  
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
        
        <div className="space-y-6 py-4">
          {/* Pickup Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Точка отправления (Pick-up)
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="pickup-address" data-testid="label-pickup-address">Адрес</Label>
              <Input
                id="pickup-address"
                data-testid="input-pickup-address"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Москва, ул. Примерная, д. 1"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pickup-lon" data-testid="label-pickup-lon">Долгота (Longitude)</Label>
                <Input
                  id="pickup-lon"
                  data-testid="input-pickup-lon"
                  type="number"
                  step="0.0001"
                  value={pickupCoords[0]}
                  onChange={(e) => setPickupCoords([parseFloat(e.target.value), pickupCoords[1]])}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pickup-lat" data-testid="label-pickup-lat">Широта (Latitude)</Label>
                <Input
                  id="pickup-lat"
                  data-testid="input-pickup-lat"
                  type="number"
                  step="0.0001"
                  value={pickupCoords[1]}
                  onChange={(e) => setPickupCoords([pickupCoords[0], parseFloat(e.target.value)])}
                />
              </div>
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
                />
              </div>
            </div>
          </div>
          
          {/* Delivery Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Точка доставки (Delivery)
            </h3>
            
            <div className="space-y-2">
              <Label data-testid="label-delivery-address">Адрес</Label>
              <Input
                data-testid="input-delivery-address"
                value={order.deliveryAddress}
                disabled
                className="bg-muted"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="delivery-lon" data-testid="label-delivery-lon">Долгота (Longitude)</Label>
                <Input
                  id="delivery-lon"
                  data-testid="input-delivery-lon"
                  type="number"
                  step="0.0001"
                  value={deliveryCoords[0]}
                  onChange={(e) => setDeliveryCoords([parseFloat(e.target.value), deliveryCoords[1]])}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery-lat" data-testid="label-delivery-lat">Широта (Latitude)</Label>
                <Input
                  id="delivery-lat"
                  data-testid="input-delivery-lat"
                  type="number"
                  step="0.0001"
                  value={deliveryCoords[1]}
                  onChange={(e) => setDeliveryCoords([deliveryCoords[0], parseFloat(e.target.value)])}
                />
              </div>
            </div>
            
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
            onClick={handleCalculatePrice}
            disabled={isCalculatingPrice || calculatePriceMutation.isPending}
            data-testid="button-calculate-price"
          >
            {(isCalculatingPrice || calculatePriceMutation.isPending) && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Рассчитать цену
          </Button>
          <Button
            onClick={handleCreateDelivery}
            disabled={!priceInfo || createDeliveryMutation.isPending}
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
