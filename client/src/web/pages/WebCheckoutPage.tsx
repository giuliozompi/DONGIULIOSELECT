import { useState } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import {
  ChevronRight, Loader2, Tag, X, CreditCard, Banknote, MapPin, User, Phone, Mail, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWebCart } from '../hooks/useWebCart';
import { useWebAuth } from '../hooks/useWebAuth';
import { webApi } from '../lib/webApi';

const checkoutSchema = z.object({
  customerName: z.string().min(2, 'Введите имя и фамилию'),
  customerPhone: z.string().min(10, 'Введите корректный номер телефона'),
  customerEmail: z.string().email('Некорректный email').optional().or(z.literal('')),
  deliveryAddress: z.string().min(10, 'Введите полный адрес доставки'),
  deliveryNotes: z.string().optional(),
  paymentMethod: z.enum(['yookassa', 'cash_on_delivery']),
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

interface PromoResult {
  valid: boolean;
  discountPercent?: number;
  code?: string;
  message?: string;
}

export default function WebCheckoutPage() {
  const [, setLocation] = useLocation();
  const { items, subtotal, itemCount, clearCart } = useWebCart();
  const { user, isAuthenticated } = useWebAuth();
  const { toast } = useToast();

  const [promoInput, setPromoInput] = useState('');
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customerName: user ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : '',
      customerPhone: user?.phone || '',
      customerEmail: user?.email || '',
      deliveryAddress: '',
      deliveryNotes: '',
      paymentMethod: 'yookassa',
    },
  });

  const discountAmount = promoResult?.valid && promoResult.discountPercent
    ? Math.round(subtotal * promoResult.discountPercent / 100)
    : 0;
  const finalAmount = subtotal - discountAmount;

  const createOrderMutation = useMutation({
    mutationFn: (data: CheckoutForm) =>
      webApi.post<{ id: string; status: string }>('/orders', {
        ...data,
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          price: i.price,
          unit: i.unit,
        })),
        amount: finalAmount.toFixed(2),
        promoCode: promoResult?.valid ? promoResult.code : undefined,
        discountPercent: promoResult?.valid ? promoResult.discountPercent : undefined,
        discount: discountAmount > 0 ? discountAmount.toFixed(2) : undefined,
      }),
    onSuccess: (order) => {
      clearCart();
      setLocation(`/web/order-success/${order.id}`);
    },
    onError: (err) => {
      toast({ title: err instanceof Error ? err.message : 'Ошибка оформления заказа', variant: 'destructive' });
    },
  });

  const handlePromoApply = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    try {
      const res = await webApi.post<PromoResult>('/promo/validate', { code: promoInput.trim() });
      setPromoResult({ ...res, code: promoInput.trim() });
      if (res.valid) {
        toast({ title: `Промокод применён: -${res.discountPercent}%` });
      } else {
        toast({ title: res.message || 'Промокод не действителен', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Ошибка проверки промокода', variant: 'destructive' });
    } finally {
      setPromoLoading(false);
    }
  };

  const clearPromo = () => {
    setPromoResult(null);
    setPromoInput('');
  };

  if (items.length === 0) {
    setLocation('/web/cart');
    return null;
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-neutral-600 mb-4">Для оформления заказа необходимо войти в аккаунт</p>
        <Button className="bg-amber-600 text-white" onClick={() => setLocation('/web/cart')}>
          Назад в корзину
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-neutral-500 mb-6">
        <button onClick={() => setLocation('/web')} className="hover:text-neutral-900">Главная</button>
        <ChevronRight className="w-3 h-3" />
        <button onClick={() => setLocation('/web/cart')} className="hover:text-neutral-900">Корзина</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-neutral-900">Оформление заказа</span>
      </nav>

      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Оформление заказа</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => createOrderMutation.mutate(d))}>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left — form */}
            <div className="flex-1 space-y-5">
              {/* Contact */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5">
                <h2 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4 text-neutral-400" /> Контактные данные
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="customerName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя и фамилия *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <Input {...field} placeholder="Иван Петров" className="pl-9" data-testid="input-checkout-name" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="customerPhone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Телефон *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <Input {...field} placeholder="+7 (999) 123-45-67" type="tel" className="pl-9" data-testid="input-checkout-phone" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="mt-4">
                  <FormField control={form.control} name="customerEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-neutral-400" /> Email
                        <span className="text-neutral-400 font-normal">(для уведомлений)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="your@email.com" data-testid="input-checkout-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Delivery address */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5">
                <h2 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-neutral-400" /> Адрес доставки
                </h2>
                <FormField control={form.control} name="deliveryAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Полный адрес *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Город, улица, дом, квартира, подъезд, этаж"
                        className="resize-none"
                        rows={3}
                        data-testid="input-checkout-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="mt-4">
                  <FormField control={form.control} name="deliveryNotes" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-neutral-400" /> Комментарий к заказу
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Время доставки, код домофона, особые пожелания..."
                          className="resize-none"
                          rows={2}
                          data-testid="input-checkout-notes"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
              </div>

              {/* Payment */}
              <div className="bg-white rounded-xl border border-neutral-200 p-5">
                <h2 className="font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-neutral-400" /> Способ оплаты
                </h2>
                <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-3">
                        <div className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${field.value === 'yookassa' ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 hover:border-neutral-300'}`}
                          onClick={() => field.onChange('yookassa')}>
                          <RadioGroupItem value="yookassa" id="pay-yookassa" className="mt-0.5" />
                          <Label htmlFor="pay-yookassa" className="cursor-pointer flex-1">
                            <div className="flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-amber-700" />
                              <span className="font-medium">Онлайн-оплата (ЮKassa)</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">Карта, СБП, ЮMoney — ссылка на оплату придёт после подтверждения заказа</p>
                          </Label>
                        </div>
                        <div className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${field.value === 'cash_on_delivery' ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 hover:border-neutral-300'}`}
                          onClick={() => field.onChange('cash_on_delivery')}>
                          <RadioGroupItem value="cash_on_delivery" id="pay-cash" className="mt-0.5" />
                          <Label htmlFor="pay-cash" className="cursor-pointer flex-1">
                            <div className="flex items-center gap-2">
                              <Banknote className="w-4 h-4 text-green-700" />
                              <span className="font-medium">Наличными при получении</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">Оплата курьеру наличными или картой</p>
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Right — summary */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="bg-white rounded-xl border border-neutral-200 p-5 sticky top-24 space-y-4">
                <h2 className="font-semibold text-neutral-900">Ваш заказ</h2>

                {/* Items preview */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {items.map(item => (
                    <div key={item.productId} className="flex justify-between text-sm gap-2">
                      <span className="text-neutral-700 truncate flex-1">{item.productName}</span>
                      <span className="text-neutral-500 shrink-0">
                        {item.unit === 'кг' ? item.quantity.toFixed(3) : item.quantity} {item.unit}
                      </span>
                      <span className="font-medium shrink-0">
                        {(parseFloat(item.price) * item.quantity).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                      </span>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Promo code */}
                <div>
                  <p className="text-sm font-medium text-neutral-700 mb-2 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-neutral-400" /> Промокод
                  </p>
                  {promoResult?.valid ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-green-700 text-sm font-medium flex-1">{promoResult.code} (-{promoResult.discountPercent}%)</span>
                      <button onClick={clearPromo} className="text-green-600 hover:text-green-800">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={promoInput}
                        onChange={e => setPromoInput(e.target.value.toUpperCase())}
                        placeholder="PROMO123"
                        className="text-sm h-9"
                        onKeyDown={e => e.key === 'Enter' && handlePromoApply()}
                        data-testid="input-promo-code"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePromoApply}
                        disabled={promoLoading || !promoInput.trim()}
                        className="h-9 shrink-0"
                        data-testid="button-apply-promo"
                      >
                        {promoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'OK'}
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-neutral-600">
                    <span>Товары ({itemCount})</span>
                    <span>{subtotal.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Скидка по промокоду</span>
                      <span>-{discountAmount.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  )}
                  <div className="flex justify-between text-neutral-500">
                    <span>Доставка</span>
                    <span>уточняется</span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between font-bold text-neutral-900">
                  <span>Итого к оплате</span>
                  <span>{finalAmount.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={createOrderMutation.isPending}
                  data-testid="button-place-order"
                >
                  {createOrderMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Оформляем...</>
                    : 'Оформить заказ'}
                </Button>

                <p className="text-xs text-neutral-400 text-center">
                  Нажимая «Оформить заказ», вы соглашаетесь с условиями оферты
                </p>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
