import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { useTelegramMainButton } from '@/hooks/useTelegramMainButton';
import { hapticFeedback } from '@/lib/telegram';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import type { Order } from '@shared/schema';

const statusConfig = {
  'ОФОРМЛЕН': { label: 'Оформлен', icon: Clock, variant: 'secondary' as const },
  'СОБРАН': { label: 'Собран', icon: Clock, variant: 'default' as const },
  'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': { label: 'Ожидание оплаты', icon: Clock, variant: 'default' as const },
  'ОПЛАЧЕН': { label: 'Оплачен', icon: CheckCircle2, variant: 'default' as const },
  'ВЫЗВАН КУРЬЕР': { label: 'Вызван курьер', icon: Clock, variant: 'default' as const },
  'ПОЛУЧЕН': { label: 'Получен', icon: CheckCircle2, variant: 'default' as const },
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: ['/api/orders', id],
  });

  const createPaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/payments/yookassa/create', {
        orderId: id,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      hapticFeedback('success');
      // YooKassa restituisce confirmationUrl invece di paymentUrl
      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/orders', id] });
      toast({
        title: 'Переход к оплате',
        description: 'Сейчас откроется страница оплаты YooKassa',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка создания платежа',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useTelegramBackButton(() => setLocation('/'), true);

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatQuantity = (qty: number, unit: string) => {
    if (unit === 'кг') {
      return `${qty.toFixed(2)} кг`;
    }
    return `${qty} ${unit}`;
  };

  // Mostra pulsante pagamento solo se c'è link di pagamento e non è ancora pagato
  const canPay = order?.status === 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ';
  const isPaid = order?.status === 'ОПЛАЧЕН' || order?.status === 'ВЫЗВАН КУРЬЕР' || order?.status === 'ПОЛУЧЕН';
  const isInPreparation = order?.status === 'ОФОРМЛЕН' || order?.status === 'СОБРАН';
  const orderAmount = order ? parseFloat(order.amount) : 0;
  
  const mainButtonText = isPaid
    ? 'Заказ оплачен'
    : `Оплатить ${formatPrice(orderAmount)}`;

  useTelegramMainButton({
    text: mainButtonText,
    onClick: () => createPaymentMutation.mutate(),
    show: !!order && canPay,
    enabled: canPay && !createPaymentMutation.isPending,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка заказа...</p>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Заказ не найден</h2>
          <p className="text-muted-foreground">Возможно, заказ был удален или не существует</p>
          <Button onClick={() => setLocation('/')} data-testid="button-goto-home">
            Вернуться на главную
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[order.status as keyof typeof statusConfig] || statusConfig['ОФОРМЛЕН'];
  const StatusIcon = statusInfo.icon;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center gap-3">
          <Button 
            size="icon" 
            variant="ghost"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-title">
            Заказ #{order.id.slice(-6).toUpperCase()}
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <StatusIcon className="h-5 w-5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Статус заказа</p>
              <Badge variant={statusInfo.variant} className="mt-1" data-testid="badge-status">
                {statusInfo.label}
              </Badge>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Дата создания:</span>
              <span data-testid="text-date">
                {new Date(order.createdAt).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            {order.paymentId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID платежа:</span>
                <span className="font-mono text-xs" data-testid="text-payment-id">
                  {order.paymentId}
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Messaggio per ordini in preparazione */}
        {isInPreparation && (
          <Card className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold" data-testid="text-preparation-message">
                Твой заказ в работе!
              </p>
              <p className="text-muted-foreground">
                Мы создаём 50 оттенков твоего наслаждения
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Ссылка на оплату будет отправлена, когда заказ будет готов к отправке
              </p>
            </div>
          </Card>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-3">Состав заказа</h2>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <Card key={index} className="p-3" data-testid={`order-item-${index}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="font-medium" data-testid="text-item-name">
                      {item.productName}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid="text-item-quantity">
                      {formatQuantity(item.quantity, item.unit)} × {formatPrice(parseFloat(item.price))}
                    </p>
                  </div>
                  <p className="font-bold" data-testid="text-item-total">
                    {formatPrice(parseFloat(item.price) * item.quantity)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Dati di consegna */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Данные доставки</h2>
          <Card className="p-4 space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Получатель:</p>
              <p className="font-medium" data-testid="text-customer-name">{order.customerName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Телефон:</p>
              <p className="font-medium" data-testid="text-customer-phone">{order.customerPhone}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Адрес доставки:</p>
              <p className="font-medium" data-testid="text-delivery-address">{order.deliveryAddress}</p>
            </div>
            {order.deliveryNotes && (
              <div>
                <p className="text-sm text-muted-foreground">Комментарий:</p>
                <p className="text-sm" data-testid="text-delivery-notes">{order.deliveryNotes}</p>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">Итого к оплате:</p>
            <p className="text-2xl font-bold text-primary" data-testid="text-total-amount">
              {formatPrice(parseFloat(order.amount))}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
