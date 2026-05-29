import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Package, ChevronRight, Clock, CheckCircle, Truck, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { webApi } from '../lib/webApi';
import { useWebAuth } from '../hooks/useWebAuth';

interface Order {
  id: string;
  status: string;
  amount: string;
  paymentMethod: string;
  customerName: string;
  deliveryAddress: string;
  createdAt: string;
  items: Array<{ productId: string; productName: string; quantity: number; price: string; unit: string }>;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  'ОФОРМЛЕН':   { label: 'Оформлен',    color: 'bg-blue-100 text-blue-700',   icon: Clock },
  'СОБРАН':     { label: 'Собран',      color: 'bg-amber-100 text-amber-700', icon: Package },
  'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': { label: 'Ожидает оплаты', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  'ОПЛАЧЕН':    { label: 'Оплачен',     color: 'bg-green-100 text-green-700', icon: CheckCircle },
  'ВЫЗВАН КУРЬЕР': { label: 'В пути',  color: 'bg-purple-100 text-purple-700', icon: Truck },
  'ПОЛУЧЕН':    { label: 'Получен',     color: 'bg-neutral-100 text-neutral-600', icon: CheckCircle },
  'УДАЛЕНО':    { label: 'Отменён',     color: 'bg-red-100 text-red-600',     icon: AlertCircle },
};

export default function WebOrdersPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useWebAuth();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['/web-api/orders'],
    queryFn: () => webApi.get<Order[]>('/orders'),
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500 mb-4">Войдите в аккаунт для просмотра заказов</p>
        <Button className="bg-amber-600 text-white" onClick={() => setLocation('/web')}>
          На главную
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Мои заказы</h1>
        <Button variant="ghost" size="sm" onClick={() => setLocation('/web/account')}>
          <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Аккаунт
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5 animate-pulse h-32" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 mx-auto text-neutral-200 mb-3" />
          <p className="font-medium text-neutral-600">Заказов пока нет</p>
          <p className="text-sm text-neutral-400 mt-1 mb-6">Сделайте первый заказ в каталоге</p>
          <Button className="bg-amber-600 text-white" onClick={() => setLocation('/web/catalog')}>
            Перейти в каталог
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const statusInfo = STATUS_MAP[order.status] ?? { label: order.status, color: 'bg-neutral-100 text-neutral-600', icon: Clock };
            const StatusIcon = statusInfo.icon;
            const date = new Date(order.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

            return (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-neutral-200 p-5 hover-elevate cursor-pointer"
                onClick={() => setLocation(`/web/orders/${order.id}`)}
                data-testid={`card-order-${order.id}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <p className="font-medium text-neutral-900 font-mono text-sm">#{order.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{date}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </span>
                </div>

                <div className="text-sm text-neutral-600 mb-3 line-clamp-1">
                  {order.items.map(i => i.productName).join(', ')}
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-900">
                    {parseFloat(order.amount).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                  </span>
                  <span className="text-xs text-neutral-400">
                    {order.paymentMethod === 'cash_on_delivery' ? 'Наличными' : 'Онлайн-оплата'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
