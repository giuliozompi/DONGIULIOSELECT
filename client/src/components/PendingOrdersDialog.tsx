import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Clock, CheckCircle2, Package } from 'lucide-react';
import type { Order } from '@shared/schema';

interface PendingOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PendingOrdersDialog({ open, onOpenChange }: PendingOrdersDialogProps) {
  const [, setLocation] = useLocation();

  // Fetch all orders
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
    enabled: open,
  });

  // Filter pending orders (not yet completed or canceled)
  const pendingOrders = orders.filter(order => 
    order.status === 'ОФОРМЛЕН' || 
    order.status === 'СОБРАН' || 
    order.status === 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ'
  );

  const formatPrice = (amount: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(parseFloat(amount));
  };

  const getStatusIcon = (status: string) => {
    if (status === 'ОПЛАЧЕН' || status === 'ВЫЗВАН КУРЬЕР' || status === 'ПОЛУЧЕН') {
      return CheckCircle2;
    }
    if (status === 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ') {
      return ExternalLink;
    }
    return Clock;
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'ОФОРМЛЕН': 'В обработке',
      'СОБРАН': 'Готовится к отправке',
      'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ': 'Ожидает оплаты',
    };
    return statusMap[status] || status;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Заказы в работе
          </DialogTitle>
          <DialogDescription>
            У вас есть {pendingOrders.length} {pendingOrders.length === 1 ? 'заказ' : 'заказа'} в обработке
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Загрузка заказов...
          </div>
        ) : pendingOrders.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Нет заказов в обработке
          </div>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map((order) => {
              const StatusIcon = getStatusIcon(order.status);
              const hasPaymentLink = order.status === 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ';

              return (
                <Card key={order.id} className="p-4 space-y-3" data-testid={`pending-order-${order.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm font-medium">
                          Заказ #{order.id.slice(-6).toUpperCase()}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {getStatusLabel(order.status)}
                      </Badge>
                    </div>
                    <p className="font-bold text-primary">
                      {formatPrice(order.amount)}
                    </p>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>{new Date(order.createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}</p>
                    <p className="mt-1">{order.items.length} {order.items.length === 1 ? 'товар' : 'товара'}</p>
                  </div>

                  {hasPaymentLink ? (
                    <Button
                      className="w-full"
                      onClick={() => {
                        setLocation(`/order/${order.id}`);
                        onOpenChange(false);
                      }}
                      data-testid={`button-pay-${order.id}`}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Перейти к оплате
                    </Button>
                  ) : order.status === 'ОФОРМЛЕН' || order.status === 'СОБРАН' ? (
                    <div className="text-center py-2 text-sm text-muted-foreground">
                      Ссылка на оплату будет отправлена после подготовки заказа
                    </div>
                  ) : null}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setLocation(`/order/${order.id}`);
                      onOpenChange(false);
                    }}
                    data-testid={`button-view-${order.id}`}
                  >
                    Подробнее
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
