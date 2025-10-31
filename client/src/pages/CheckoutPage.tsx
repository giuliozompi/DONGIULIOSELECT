import { useState, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { FallbackMainButton } from '@/components/FallbackMainButton';
import { ShoppingBag, Gift, MapPin, X, Truck, Wallet } from 'lucide-react';
import type { Cart, Product, Bonus, UserAddress } from '@shared/schema';
import { DELIVERY_METHODS, DELIVERY_METHOD_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@shared/schema';
import { normalizePhoneNumber } from '@/lib/utils';

const checkoutFormSchema = z.object({
  customerName: z.string().min(2, 'Введите имя (минимум 2 символа)'),
  customerPhone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Введите корректный номер телефона'),
  customerEmail: z.string().email('Введите корректный адрес электронной почты'),
  deliveryAddress: z.string().min(10, 'Введите полный адрес доставки'),
  deliveryNotes: z.string().optional(),
  deliveryMethod: z.enum([
    DELIVERY_METHODS.YANDEX_GO,
    DELIVERY_METHODS.CDEK,
    DELIVERY_METHODS.DON_GIULIO_COURIER,
    DELIVERY_METHODS.PICKUP,
  ] as [string, ...string[]], {
    required_error: 'Выберите способ доставки',
  }),
  paymentMethod: z.enum([
    PAYMENT_METHODS.YOOKASSA,
    PAYMENT_METHODS.CASH_ON_DELIVERY,
  ] as [string, ...string[]], {
    required_error: 'Выберите способ оплаты',
  }),
  saveAddress: z.boolean().default(false),
  addressLabel: z.string().optional(),
}).refine((data) => {
  if (data.saveAddress && !data.addressLabel) {
    return false;
  }
  return true;
}, {
  message: 'Введите название адреса',
  path: ['addressLabel'],
});

type CheckoutFormData = z.infer<typeof checkoutFormSchema>;

interface StructuredAddress {
  deliveryPostalCode?: string;
  dadataFiasId?: string;
  deliveryLatitude?: string;
  deliveryLongitude?: string;
}

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [structuredAddress, setStructuredAddress] = useState<StructuredAddress>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);

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

  const { data: savedAddresses = [], isLoading: isLoadingAddresses } = useQuery<UserAddress[]>({
    queryKey: ['/api/user/addresses'],
  });

  const { data: userData } = useQuery<{ 
    id: string; 
    username: string | null; 
    firstName: string | null; 
    lastName: string | null;
    phone: string | null;
    email: string | null;
    customerName: string | null;
  }>({
    queryKey: ['/api/user'],
  });

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutFormSchema),
    mode: 'onChange',
    defaultValues: {
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      deliveryAddress: '',
      deliveryNotes: '',
      deliveryMethod: DELIVERY_METHODS.YANDEX_GO,
      paymentMethod: PAYMENT_METHODS.YOOKASSA,
      saveAddress: false,
      addressLabel: '',
    },
  });

  // Pre-compila form con dati utente salvati
  useEffect(() => {
    if (userData) {
      const updates: Partial<CheckoutFormData> = {};
      
      // Pre-compila nome se salvato dal precedente ordine
      if (userData.customerName) {
        updates.customerName = userData.customerName;
      }
      
      // Pre-compila telefono se salvato
      if (userData.phone) {
        updates.customerPhone = userData.phone;
      }
      
      // Pre-compila email se salvata
      if (userData.email) {
        updates.customerEmail = userData.email;
      }
      
      // Aggiorna solo i campi che hanno valori salvati
      if (Object.keys(updates).length > 0) {
        Object.entries(updates).forEach(([key, value]) => {
          form.setValue(key as keyof CheckoutFormData, value);
        });
      }
    }
  }, [userData, form]);

  // Pre-compila automaticamente l'indirizzo di default se presente
  useEffect(() => {
    if (savedAddresses && savedAddresses.length > 0 && !form.getValues('deliveryAddress')) {
      const defaultAddress = savedAddresses.find(addr => addr.isDefault);
      if (defaultAddress) {
        // Pre-compila automaticamente il form con l'indirizzo di default
        form.setValue('deliveryAddress', defaultAddress.fullAddress);
        setStructuredAddress({
          deliveryPostalCode: defaultAddress.postalCode || undefined,
          dadataFiasId: defaultAddress.dadataFiasId || undefined,
          deliveryLatitude: defaultAddress.latitude || undefined,
          deliveryLongitude: defaultAddress.longitude || undefined,
        });
      }
    }
  }, [savedAddresses, form]);

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      await apiRequest('DELETE', `/api/user/addresses/${addressId}`);
    },
    onSuccess: () => {
      hapticFeedback('success');
      queryClient.invalidateQueries({ queryKey: ['/api/user/addresses'] });
      toast({
        title: 'Адрес удалён',
        description: 'Сохранённый адрес успешно удалён',
      });
      setDeleteDialogOpen(false);
      setAddressToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка удаления',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      const orderData = {
        ...data,
        customerPhone: normalizePhoneNumber(data.customerPhone),
        ...structuredAddress,
      };
      const res = await apiRequest('POST', '/api/orders', orderData);
      return await res.json();
    },
    onSuccess: (data) => {
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
    setIsSubmitting(true);
    createOrderMutation.mutate(data);
  };

  // Listen for test-fill event from BottomNav
  useEffect(() => {
    const handleTestFill = () => {
      hapticFeedback('light');
      form.setValue('customerName', 'Джулио Дзомпи');
      form.setValue('customerPhone', '+79268429284');
      form.setValue('customerEmail', 'test@dongiulio.ru');
      form.setValue('deliveryAddress', 'г Москва, ул Скобелевская, д 34, кв 17');
      form.setValue('deliveryNotes', 'Тестовый заказ для проверки');
      form.setValue('deliveryMethod', DELIVERY_METHODS.YANDEX_GO);
      form.setValue('paymentMethod', PAYMENT_METHODS.YOOKASSA);
      form.setValue('saveAddress', false);
      
      setStructuredAddress({
        deliveryPostalCode: '117311',
        dadataFiasId: 'test-fias-id',
        deliveryLatitude: '55.622824',
        deliveryLongitude: '37.605207',
      });

      toast({
        title: 'Данные заполнены',
        description: 'Форма заполнена тестовыми данными. Можете оформить заказ.',
      });
    };

    window.addEventListener('test-fill-checkout', handleTestFill);
    return () => window.removeEventListener('test-fill-checkout', handleTestFill);
  }, [form, toast]);

  const handleUseAddress = (address: UserAddress) => {
    hapticFeedback('light');
    form.setValue('deliveryAddress', address.fullAddress);
    setStructuredAddress({
      deliveryPostalCode: address.postalCode || undefined,
      dadataFiasId: address.dadataFiasId || undefined,
      deliveryLatitude: address.latitude || undefined,
      deliveryLongitude: address.longitude || undefined,
    });
  };

  const handleDeleteAddress = (addressId: string) => {
    hapticFeedback('light');
    setAddressToDelete(addressId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteAddress = () => {
    if (addressToDelete) {
      deleteAddressMutation.mutate(addressToDelete);
    }
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

  const formatQuantity = (qty: number, unit?: string) => {
    const rounded = Number(qty.toFixed(3));
    if (unit === 'кг') {
      return `${rounded} кг`;
    }
    return `${rounded}`;
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

  const saveAddress = form.watch('saveAddress');

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
                  {item.product?.name} × {formatQuantity(item.quantity, item.product?.unit)}
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
                        dir="ltr"
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
                        dir="ltr"
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
                        dir="ltr"
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
                              deliveryPostalCode: suggestion.postalCode || undefined,
                              dadataFiasId: suggestion.fiasId,
                              deliveryLatitude: suggestion.geoLat || undefined,
                              deliveryLongitude: suggestion.geoLon || undefined,
                            });
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

              {/* Indirizzi salvati */}
              {!isLoadingAddresses && savedAddresses.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Сохранённые адреса
                  </h4>
                  <div className="space-y-2">
                    {savedAddresses.map((address) => (
                      <div
                        key={address.id}
                        className="p-3 border rounded-md hover-elevate"
                        data-testid={`saved-address-${address.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{address.label}</span>
                              {address.isDefault && (
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-default-${address.id}`}>
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{address.fullAddress}</p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteAddress(address.id)}
                            data-testid={`button-delete-address-${address.id}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUseAddress(address)}
                          className="w-full"
                          data-testid={`button-use-address-${address.id}`}
                        >
                          Использовать этот адрес
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save address checkbox */}
              <FormField
                control={form.control}
                name="saveAddress"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-save-address"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Сохранить этот адрес
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Адрес будет доступен для быстрого выбора в следующих заказах
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {/* Address label input (shown when saveAddress is checked) */}
              {saveAddress && (
                <FormField
                  control={form.control}
                  name="addressLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название адреса *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          dir="ltr"
                          placeholder='Например: "Дом", "Офис", "Дача"'
                          data-testid="input-address-label"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Delivery method selection */}
              <FormField
                control={form.control}
                name="deliveryMethod"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Способ доставки *
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-2"
                      >
                        {Object.entries(DELIVERY_METHOD_LABELS).map(([value, label]) => (
                          <div
                            key={value}
                            className="flex items-center space-x-3 space-y-0 rounded-md border p-3"
                          >
                            <RadioGroupItem
                              value={value}
                              id={value}
                              data-testid={`radio-delivery-${value}`}
                            />
                            <label
                              htmlFor={value}
                              className="text-sm font-normal leading-tight cursor-pointer flex-1"
                            >
                              {label}
                            </label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Payment method selection */}
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      Способ оплаты *
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="space-y-2"
                      >
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                          <div
                            key={value}
                            className="flex items-center space-x-3 space-y-0 rounded-md border p-3"
                          >
                            <RadioGroupItem
                              value={value}
                              id={value}
                              data-testid={`radio-payment-${value}`}
                            />
                            <label
                              htmlFor={value}
                              className="text-sm font-normal leading-tight cursor-pointer flex-1"
                            >
                              {label}
                            </label>
                          </div>
                        ))}
                      </RadioGroup>
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
                        dir="ltr" 
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

      {/* Fallback Main Button per preview (visibile solo fuori da Telegram) */}
      <FallbackMainButton
        text={isSubmitting ? 'Обработка...' : 'Оформить заказ'}
        onClick={() => form.handleSubmit(onSubmit)()}
        enabled={!isSubmitting && form.formState.isValid}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-address">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить адрес?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить этот сохранённый адрес? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteAddress}
              data-testid="button-confirm-delete"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
