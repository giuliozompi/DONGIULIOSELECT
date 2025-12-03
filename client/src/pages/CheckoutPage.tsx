import { useState, useEffect, useMemo } from 'react';
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
import { CdekPvzSelector } from '@/components/CdekPvzSelector';
import { ShoppingBag, Gift, MapPin, X, Truck, Wallet, Tag, Package } from 'lucide-react';
import type { Cart, Product, Bonus, UserAddress } from '@shared/schema';
import { DELIVERY_METHODS, DELIVERY_METHOD_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@shared/schema';
import { normalizePhoneNumber } from '@/lib/utils';
import CountdownTimer from '@/components/CountdownTimer';

const checkoutFormSchema = z.object({
  customerName: z.string().min(2, 'Введите имя (минимум 2 символа)'),
  customerPhone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Введите корректный номер телефона'),
  customerEmail: z.string().email('Введите корректный адрес электронной почты'),
  deliveryAddress: z.string().optional(), // Made optional - validated conditionally below
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
  // CDEK-specific fields
  cdekPvzCode: z.string().optional(),
  cdekPvzAddress: z.string().optional(),
}).refine((data) => {
  // Require deliveryAddress for all delivery methods (for CDEK it's used to find nearest PVZ)
  return data.deliveryAddress && data.deliveryAddress.length >= 10;
}, {
  message: 'Введите полный адрес',
  path: ['deliveryAddress'],
}).refine((data) => {
  // Require PVZ selection for CDEK delivery
  if (data.deliveryMethod === DELIVERY_METHODS.CDEK) {
    return !!data.cdekPvzCode;
  }
  return true;
}, {
  message: 'Выберите пункт выдачи СДЭК',
  path: ['cdekPvzCode'],
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
  deliveryCity?: string;
}

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [structuredAddress, setStructuredAddress] = useState<StructuredAddress>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<string | null>(null);
  
  // Discount code states
  const [discountCode, setDiscountCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validatedDiscount, setValidatedDiscount] = useState<{
    code: string;
    percent: number;
    expiresAt: Date;
  } | null>(null);
  
  // CDEK delivery states
  const [cdekPvz, setCdekPvz] = useState<any>(null);
  const [cdekTariff, setCdekTariff] = useState<any>(null);
  const [cdekCityCode, setCdekCityCode] = useState<number | null>(null);

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
      deliveryMethod: undefined as unknown as string,
      paymentMethod: undefined as unknown as string,
      saveAddress: false,
      addressLabel: '',
      cdekPvzCode: '',
      cdekPvzAddress: '',
    },
  });
  
  // Watch delivery method to clear CDEK data when switching away
  const watchedDeliveryMethod = form.watch('deliveryMethod');
  
  useEffect(() => {
    if (watchedDeliveryMethod !== DELIVERY_METHODS.CDEK) {
      // Clear CDEK-specific data when switching to other delivery methods
      setCdekPvz(null);
      setCdekTariff(null);
      setCdekCityCode(null);
      form.setValue('cdekPvzCode', '');
      form.setValue('cdekPvzAddress', '');
    }
  }, [watchedDeliveryMethod, form]);

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

  const validateDiscountMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/cart/validate-discount/${code.trim().toUpperCase()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Неверный код скидки');
      }
      
      return data;
    },
    onSuccess: (data: { discountCode: string; discountPercent: number; expiresAt: string }) => {
      hapticFeedback('success');
      setValidatedDiscount({
        code: data.discountCode,
        percent: data.discountPercent,
        expiresAt: new Date(data.expiresAt),
      });
      setValidationError(null);
      setDiscountCode('');
      toast({
        title: 'Промокод применён!',
        description: `Скидка ${data.discountPercent}% активирована`,
      });
    },
    onError: (error: Error) => {
      hapticFeedback('light');
      setValidationError(error.message);
      toast({
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      const orderData: any = {
        ...data,
        customerPhone: normalizePhoneNumber(data.customerPhone),
        ...structuredAddress,
        abandonedCartCode: validatedDiscount?.code || null,
      };
      
      // Add CDEK data if CDEK delivery is selected
      if (data.deliveryMethod === DELIVERY_METHODS.CDEK) {
        // Use form values (they are set when PVZ is selected)
        orderData.cdekPvzCode = data.cdekPvzCode || null;
        orderData.cdekPvzAddress = data.cdekPvzAddress || null;
        orderData.cdekTariffCode = cdekTariff?.tariff_code || null;
        orderData.cdekTariffName = cdekTariff?.tariff_name || null;
        orderData.cdekPrice = cdekTariff?.delivery_sum?.toString() || null;
        orderData.cdekCityCode = cdekCityCode;
        orderData.cdekDeliveryMode = data.cdekPvzCode ? 'office' : 'door';
      }
      
      const res = await apiRequest('POST', '/api/orders', orderData);
      return await res.json();
    },
    onSuccess: (data) => {
      hapticFeedback('success');
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      queryClient.invalidateQueries({ queryKey: ['/api/fortune'] });
      setValidatedDiscount(null);
      setDiscountCode('');
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
    // Validate CDEK PVZ selection - use form value instead of state
    if (data.deliveryMethod === DELIVERY_METHODS.CDEK && !data.cdekPvzCode) {
      toast({
        description: 'Выберите пункт выдачи СДЭК для оформления заказа',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    createOrderMutation.mutate(data);
  };

  const handleUseAddress = (address: UserAddress) => {
    hapticFeedback('light');
    form.setValue('deliveryAddress', address.fullAddress);
    setStructuredAddress({
      deliveryPostalCode: address.postalCode || undefined,
      dadataFiasId: address.dadataFiasId || undefined,
      deliveryLatitude: address.latitude || undefined,
      deliveryLongitude: address.longitude || undefined,
      deliveryCity: address.city || undefined,
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

  // Calculate totals with abandoned cart / bonus mutual exclusivity
  const { subtotal, abandonedCartDiscount, bonusDiscount, finalTotal } = useMemo(() => {
    const sub = cartItems.reduce((sum, item) => sum + item.total, 0);
    const availableBonusAmount = parseFloat(fortuneData?.totalBonusAmount || '0');
    
    // Mutual exclusivity: abandoned cart discount OR bonuses, never both
    const abandonedDiscount = validatedDiscount 
      ? (sub * validatedDiscount.percent) / 100 
      : 0;
    const bonusDisc = abandonedDiscount > 0 
      ? 0 
      : Math.min(availableBonusAmount, sub);
    
    const final = Math.max(0, sub - abandonedDiscount - bonusDisc);
    
    return {
      subtotal: sub,
      abandonedCartDiscount: abandonedDiscount,
      bonusDiscount: bonusDisc,
      finalTotal: final,
    };
  }, [cartItems, validatedDiscount, fortuneData?.totalBonusAmount]);
  
  // Handlers
  const handleValidateDiscount = () => {
    if (!discountCode.trim()) return;
    validateDiscountMutation.mutate(discountCode.trim());
  };
  
  const handleRemoveDiscount = () => {
    setValidatedDiscount(null);
    setDiscountCode('');
    setValidationError(null);
  };
  
  const handleDiscountExpired = () => {
    setValidatedDiscount(null);
    toast({
      title: 'Промокод истёк',
      description: 'Время действия скидки закончилось',
      variant: 'destructive',
    });
  };
  
  // Reset discount when cart changes
  useEffect(() => {
    if (validatedDiscount && cart?.items) {
      setValidatedDiscount(null);
      setValidationError(null);
    }
  }, [cart?.items]);

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
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center gap-3">
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
          
          {/* Development Submit Button - Emulates Telegram MainButton */}
          {import.meta.env.MODE === 'development' && (
            <Button
              onClick={() => form.handleSubmit(onSubmit)()}
              disabled={isSubmitting || !form.formState.isValid}
              className="w-full"
              data-testid="button-dev-submit-order"
            >
              {isSubmitting ? 'Обработка...' : 'Оформить заказ'}
            </Button>
          )}
        </div>

        {/* Промокод */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Промокод
          </h3>
          
          {!validatedDiscount ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={discountCode}
                  onChange={(e) => {
                    setDiscountCode(e.target.value.toUpperCase());
                    setValidationError(null);
                  }}
                  placeholder="Введите код скидки"
                  disabled={validateDiscountMutation.isPending}
                  maxLength={20}
                  data-testid="input-discount-code"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleValidateDiscount();
                    }
                  }}
                />
                <Button
                  onClick={handleValidateDiscount}
                  disabled={!discountCode.trim() || validateDiscountMutation.isPending}
                  data-testid="button-apply-discount"
                >
                  {validateDiscountMutation.isPending ? 'Проверка...' : 'Применить'}
                </Button>
              </div>
              {validationError && (
                <p className="text-sm text-destructive" data-testid="text-discount-error">
                  {validationError}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="default" className="text-sm" data-testid="badge-active-discount">
                  Скидка {validatedDiscount.percent}% ({validatedDiscount.code})
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveDiscount}
                  data-testid="button-remove-discount"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CountdownTimer
                expiresAt={validatedDiscount.expiresAt}
                discountCode={validatedDiscount.code}
                discountPercent={validatedDiscount.percent}
                labels={{
                  title: `Скидка ${validatedDiscount.percent}% действует!`,
                  expiresLabel: 'Истекает через:',
                  expiredTitle: 'Промокод истёк',
                  expiredMessage: 'Время действия скидки закончилось',
                }}
              />
            </div>
          )}
        </Card>

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
            
            {abandonedCartDiscount > 0 && (
              <div className="flex justify-between text-sm text-primary" data-testid="row-discount-applied">
                <span className="flex items-center gap-1">
                  <Tag className="w-4 h-4" />
                  Промокод ({validatedDiscount?.percent}%):
                </span>
                <span className="font-medium">-{formatPrice(abandonedCartDiscount)}</span>
              </div>
            )}
            
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
              <span data-testid="text-final-total">{formatPrice(finalTotal)}</span>
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

              {/* Address field - always visible, used for all delivery methods */}
              <FormField
                control={form.control}
                name="deliveryAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {form.watch('deliveryMethod') === DELIVERY_METHODS.CDEK 
                        ? 'Ваш адрес (для поиска ближайших ПВЗ) *'
                        : 'Адрес доставки *'
                      }
                    </FormLabel>
                    <FormControl>
                      <AddressAutocomplete
                        value={field.value || ''}
                        onChange={(value, suggestion) => {
                          field.onChange(value);
                          if (suggestion) {
                            setStructuredAddress({
                              deliveryPostalCode: suggestion.postalCode || undefined,
                              dadataFiasId: suggestion.fiasId,
                              deliveryLatitude: suggestion.geoLat || undefined,
                              deliveryLongitude: suggestion.geoLon || undefined,
                              deliveryCity: suggestion.city || undefined,
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
                        value={field.value || ''}
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

              {/* CDEK PVZ selector - shown when CDEK is selected */}
              {form.watch('deliveryMethod') === DELIVERY_METHODS.CDEK && (
                <Card className="p-4 border-dashed border-2">
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-5 h-5 text-primary" />
                    <h3 className="font-medium">Выберите пункт выдачи СДЭК</h3>
                  </div>
                  <CdekPvzSelector
                    onSelect={(pvz, tariff, cityCode) => {
                      setCdekPvz(pvz);
                      setCdekTariff(tariff);
                      setCdekCityCode(cityCode);
                      if (pvz) {
                        const pvzAddress = pvz.location.address_full || pvz.location.address;
                        form.setValue('cdekPvzCode', pvz.code, { shouldValidate: true });
                        form.setValue('cdekPvzAddress', pvzAddress, { shouldValidate: true });
                      } else {
                        form.setValue('cdekPvzCode', '', { shouldValidate: true });
                        form.setValue('cdekPvzAddress', '', { shouldValidate: true });
                      }
                    }}
                    selectedPvzCode={form.watch('cdekPvzCode') || cdekPvz?.code}
                    customerAddress={form.watch('deliveryAddress')}
                    customerLatitude={structuredAddress.deliveryLatitude}
                    customerLongitude={structuredAddress.deliveryLongitude}
                    customerCity={structuredAddress.deliveryCity}
                  />
                  {cdekTariff && (
                    <div className="mt-4 p-3 bg-muted rounded-md flex items-center justify-between">
                      <span className="text-sm">Стоимость доставки СДЭК:</span>
                      <Badge variant="secondary" className="text-base">
                        {Math.round(cdekTariff.delivery_sum)} ₽
                      </Badge>
                    </div>
                  )}
                  {!cdekPvz && cdekCityCode && (
                    <p className="text-sm text-amber-600 mt-2">
                      Выберите пункт выдачи для оформления заказа
                    </p>
                  )}
                  
                  {/* Show validation error for PVZ selection */}
                  {form.formState.errors.cdekPvzCode && (
                    <p className="text-sm text-destructive mt-2">
                      {form.formState.errors.cdekPvzCode.message}
                    </p>
                  )}
                </Card>
              )}

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
                        value={field.value || ''}
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
