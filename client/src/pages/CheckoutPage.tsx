import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { useTelegramMainButton } from '@/hooks/useTelegramMainButton';
import { hapticFeedback } from '@/lib/telegram';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { ShoppingBag, Gift } from 'lucide-react';
import type { Cart, Product, Bonus } from '@shared/schema';

const checkoutFormSchema = z.object({
  customerName: z.string().min(2, 'Введите имя (минимум 2 символа)'),
  customerPhone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Введите корректный номер телефона'),
  customerEmail: z.string().email('Введите корректный адрес электронной почты'),
  deliveryAddress: z.string().min(10, 'Введите полный адрес доставки'),
  deliveryFlat: z.string().optional(),
  deliveryNotes: z.string().optional(),
});

type CheckoutFormData = z.infer<typeof checkoutFormSchema>;

interface StructuredAddress {
  deliveryCity?: string;
  deliveryStreet?: string;
  deliveryBuilding?: string;
  deliveryFlat?: string;
  deliveryPostalCode?: string;
  dadataFiasId?: string;
}

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [structuredAddress, setStructuredAddress] = useState<StructuredAddress>({});

  const { data: cart, isLoading } = useQuery<Cart>({
    queryKey: ['/api/cart'],
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: fortuneData } = useQuery<{
    spinTokens: number;
    bonuses: Bonus[];
    totalBonusAmount: string;
  }>({
    queryKey: ['/api/fortune'],
  });

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutFormSchema),
    mode: 'onChange',
    defaultValues: {
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      deliveryAddress: '',
      deliveryFlat: '',
      deliveryNotes: '',
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      console.log('🔄 Creating order...', data);
      const orderData = {
        ...data,
        ...structuredAddress,
        deliveryFlat: data.deliveryFlat || structuredAddress.deliveryFlat,
      };
      console.log('📦 Order data:', orderData);
      const res = await apiRequest('POST', '/api/orders', orderData);
      const result = await res.json();
      console.log('✅ Order created:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('🎉 Order success:', data);
      hapticFeedback('success');
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      queryClient.invalidateQueries({ queryKey: ['/api/fortune'] });
      toast({
        title: 'Заказ создан!',
        description: `Заказ #${data.id.slice(0, 8)} успешно оформлен`,
      });
      setLocation(`/order/${data.id}`);
    },
    onError: (error: Error) => {
      console.error('❌ Order error:', error);
      toast({
        title: 'Ошибка создания заказа',
        description: error.message,
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });

  useTelegramBackButton(() => setLocation('/cart'), true);

  const onSubmit = (data: CheckoutFormData) => {
    console.log('📝 Form submitted:', data);
    console.log('📋 Form valid:', form.formState.isValid);
    console.log('🏠 Structured address:', structuredAddress);
    setIsSubmitting(true);
    createOrderMutation.mutate(data);
  };

  // Telegram MainButton для submit
  useTelegramMainButton({
    text: isSubmitting ? 'Обработка...' : 'Оформить заказ',
    onClick: () => {
      form.handleSubmit(onSubmit)();
    },
    enabled: !isSubmitting && form.formState.isValid,
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

  // Calcola totali
  const cartItems = (cart?.items || []).map(item => {
    const product = allProducts.find(p => p.id === item.productId);
    return {
      ...item,
      product,
      total: parseFloat(item.priceAtAdd) * item.quantity,
    };
  });

  const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
  const availableBonusAmount = parseFloat(fortuneData?.totalBonusAmount || '0');
  const bonusDiscount = Math.min(availableBonusAmount, subtotal);
  const finalTotal = Math.max(0, subtotal - bonusDiscount);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  if (!cart?.items.length) {
    setLocation('/cart');
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Оформление заказа</h1>
            <p className="text-sm text-muted-foreground">
              {cartItems.length} {cartItems.length === 1 ? 'товар' : 'товара'}
            </p>
          </div>
        </div>

        {/* Riepilogo ordine */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Ваш заказ</h3>
          
          <div className="space-y-2">
            {cartItems.map((item) => (
              <div key={item.productId} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.product?.name} × {item.quantity}
                </span>
                <span className="font-medium">{formatPrice(item.total)}</span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span>Сумма:</span>
              <span className="font-medium">{formatPrice(subtotal)}</span>
            </div>
            
            {bonusDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span className="flex items-center gap-1">
                  <Gift className="w-4 h-4" />
                  Бонусы:
                </span>
                <span className="font-medium">-{formatPrice(bonusDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Итого:</span>
              <span>{formatPrice(finalTotal)}</span>
            </div>
          </div>
        </Card>

        {/* Form dati cliente */}
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Данные для доставки</h3>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Имя и фамилия *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Иван Иванов"
                        data-testid="input-customer-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Телефон *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="tel"
                        placeholder="+79991234567"
                        data-testid="input-customer-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="email"
                        placeholder="ivanov@example.com"
                        data-testid="input-customer-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес доставки *</FormLabel>
                    <FormControl>
                      <AddressAutocomplete
                        value={field.value}
                        onChange={(value, suggestion) => {
                          field.onChange(value);
                          if (suggestion) {
                            setStructuredAddress({
                              deliveryCity: suggestion.city || undefined,
                              deliveryStreet: suggestion.street || undefined,
                              deliveryBuilding: suggestion.building || undefined,
                              deliveryPostalCode: suggestion.postalCode || undefined,
                              dadataFiasId: suggestion.fiasId,
                            });
                            if (suggestion.flat) {
                              form.setValue('deliveryFlat', suggestion.flat);
                            }
                          } else {
                            setStructuredAddress({});
                          }
                        }}
                        placeholder="Начните вводить адрес: город, улица, дом..."
                        testId="input-delivery-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveryFlat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер квартиры</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="45"
                        data-testid="input-delivery-flat"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveryNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Комментарий к заказу (опционально)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Домофон не работает, позвоните за 5 минут..."
                        rows={2}
                        data-testid="input-delivery-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Нажмите кнопку внизу экрана для оформления заказа
        </p>
      </div>
    </div>
  );
}
