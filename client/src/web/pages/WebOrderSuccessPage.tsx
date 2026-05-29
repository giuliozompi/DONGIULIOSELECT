import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Package, Phone, ArrowRight, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { webApi } from '../lib/webApi';

interface Order {
  id: string;
  status: string;
  amount: string;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  createdAt: string;
  items: Array<{ productId: string; productName: string; quantity: number; price: string; unit: string }>;
}

export default function WebOrderSuccessPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: order } = useQuery({
    queryKey: ['/web-api/orders', id],
    queryFn: () => webApi.get<Order>(`/orders/${id}`),
    enabled: !!id,
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      {/* Success icon */}
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>

      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Заказ оформлен!</h1>
      <p className="text-neutral-500 mb-1">Номер заказа: <span className="font-mono font-medium text-neutral-800">#{id?.slice(0, 8).toUpperCase()}</span></p>
      <p className="text-neutral-500 text-sm mb-8">
        Мы свяжемся с вами для подтверждения заказа и уточнения деталей доставки
      </p>

      {order && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 text-left mb-6 space-y-4">
          <div>
            <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Получатель</p>
            <p className="font-medium text-neutral-900">{order.customerName}</p>
            <p className="text-sm text-neutral-500 flex items-center gap-1.5 mt-0.5">
              <Phone className="w-3.5 h-3.5" /> {order.customerPhone}
            </p>
          </div>

          <div>
            <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Адрес доставки</p>
            <p className="text-sm text-neutral-700">{order.deliveryAddress}</p>
          </div>

          <div>
            <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">Состав заказа</p>
            <div className="space-y-1">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-neutral-700 flex-1">{item.productName}</span>
                  <span className="text-neutral-500 mx-3">
                    {item.unit === 'кг' ? parseFloat(String(item.quantity)).toFixed(3) : item.quantity} {item.unit}
                  </span>
                  <span className="font-medium text-neutral-900">
                    {(parseFloat(item.price) * item.quantity).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between font-semibold text-neutral-900 pt-2 border-t border-neutral-100">
            <span>Итого</span>
            <span>{parseFloat(order.amount).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>
          </div>

          {order.paymentMethod === 'yookassa' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              Ссылка на онлайн-оплату будет отправлена вам после подтверждения заказа менеджером
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button
          variant="outline"
          onClick={() => setLocation('/web/account/orders')}
          data-testid="button-view-orders"
        >
          <Package className="w-4 h-4 mr-2" /> Мои заказы
        </Button>
        <Button
          className="bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => setLocation('/web/catalog')}
          data-testid="button-continue-shopping"
        >
          Продолжить покупки <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
