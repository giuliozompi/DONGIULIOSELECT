import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { hapticFeedback } from '@/lib/telegram';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Package, ShoppingCart, ChevronDown, ChevronUp, Truck } from 'lucide-react';
import type { Order } from '@shared/schema';
import { DELIVERY_METHOD_LABELS } from '@shared/schema';

export default function MyOrdersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest('POST', `/api/orders/${orderId}/reorder`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reorder');
      }
      
      return data;
    },
    onSuccess: (data) => {
      hapticFeedback('success');
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      
      if (data.unavailableCount > 0) {
        toast({
          title: 'Заказ частично добавлен',
          description: data.message,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Заказ добавлен в корзину',
          description: data.message,
        });
      }
      
      setLocation('/cart');
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useTelegramBackButton(() => setLocation('/'), true);

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('ru-RU', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ПОЛУЧЕН':
        return 'default';
      case 'ОПЛАЧЕН':
      case 'ВЫЗВАН КУРЬЕР':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrder(expandedOrder === orderId ? null : orderId);
    hapticFeedback('light');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка заказов...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-muted mx-auto flex items-center justify-center">
            <Package className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Нет заказов</h2>
          <p className="text-muted-foreground">У вас пока нет заказов</p>
          <Button 
            onClick={() => setLocation('/')}
            data-testid="button-goto-catalog"
          >
            Перейти в каталог
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-6">
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
            Мой заказы
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {orders.map((order) => {
          const isExpanded = expandedOrder === order.id;
          const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
          
          return (
            <Card key={order.id} className="overflow-hidden" data-testid={`order-card-${order.id}`}>
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">
                      {formatDate(order.createdAt)}
                    </p>
                    <p className="font-medium" data-testid={`order-total-${order.id}`}>
                      {Math.round(parseFloat(order.amount))} ₽
                    </p>
                  </div>
                  <Badge variant={getStatusBadgeVariant(order.status)} data-testid={`order-status-${order.id}`}>
                    {order.status}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{order.items.length} товаров ({totalItems.toFixed(2)} ед.)</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleOrderExpanded(order.id)}
                    data-testid={`button-toggle-${order.id}`}
                  >
                    {isExpanded ? (
                      <>
                        Скрыть <ChevronUp className="h-4 w-4 ml-1" />
                      </>
                    ) : (
                      <>
                        Показать <ChevronDown className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>

                {isExpanded && (
                  <div className="pt-3 border-t space-y-3">
                    {/* Prodotti */}
                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div 
                          key={`${item.productId}-${index}`} 
                          className="flex items-center justify-between text-sm"
                          data-testid={`order-item-${order.id}-${index}`}
                        >
                          <span className="flex-1">{item.productName}</span>
                          <span className="text-muted-foreground">
                            {item.quantity.toFixed(2)} {item.unit} × {Math.round(parseFloat(item.price))} ₽
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Metodo di spedizione */}
                    {order.deliveryMethod && (
                      <div className="flex items-start gap-2 pt-2 border-t">
                        <Truck className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">Метод доставки</p>
                          <p className="text-sm font-medium" data-testid={`order-delivery-method-${order.id}`}>
                            {DELIVERY_METHOD_LABELS[order.deliveryMethod as keyof typeof DELIVERY_METHOD_LABELS] || order.deliveryMethod}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => reorderMutation.mutate(order.id)}
                  disabled={reorderMutation.isPending}
                  data-testid={`button-reorder-${order.id}`}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {reorderMutation.isPending ? 'Добавление...' : 'Повторить заказ'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
