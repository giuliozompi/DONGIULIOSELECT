import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Heart, Package, Gift } from 'lucide-react';
import PendingOrdersDialog from '@/components/PendingOrdersDialog';
import type { Order } from '@shared/schema';

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const [showPendingDialog, setShowPendingDialog] = useState(false);
  
  // Fetch orders to check for pending ones
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ['/api/orders'],
  });
  
  // Count pending orders
  const pendingOrdersCount = orders.filter(order => 
    order.status === 'ОФОРМЛЕН' || 
    order.status === 'СОБРАН' || 
    order.status === 'ОТПРАВЛЕНА ССЫЛКА НА ОПЛАТУ'
  ).length;
  
  // Auto-open dialog if there are pending orders (once per visit)
  useEffect(() => {
    if (pendingOrdersCount > 0) {
      setShowPendingDialog(true);
    }
  }, [pendingOrdersCount]);
  
  useTelegramBackButton(() => {
    setLocation('/');
  });

  const menuItems = [
    {
      title: 'Мои данные',
      description: 'Личная информация и контакты',
      icon: User,
      path: '/my-data',
      testId: 'card-my-data'
    },
    {
      title: 'Мои избранные',
      description: 'Товары, которые вы отметили',
      icon: Heart,
      path: '/favorites',
      testId: 'card-favorites'
    },
    {
      title: 'История призов',
      description: 'Призы от колеса фортуны',
      icon: Gift,
      path: '/prizes-history',
      testId: 'card-prizes-history'
    },
    {
      title: 'Заказы',
      description: 'История ваших заказов',
      icon: Package,
      path: '/orders',
      testId: 'card-orders'
    }
  ];

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Личный кабинет</h1>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isOrders = item.path === '/orders';
          
          return (
            <Card
              key={item.path}
              className="hover-elevate active-elevate-2 cursor-pointer"
              onClick={() => {
                if (isOrders && pendingOrdersCount > 0) {
                  setShowPendingDialog(true);
                } else {
                  setLocation(item.path);
                }
              }}
              data-testid={item.testId}
            >
              <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription className="text-sm">{item.description}</CardDescription>
                  </div>
                  {isOrders && pendingOrdersCount > 0 && (
                    <Badge variant="destructive" className="ml-2" data-testid="badge-pending-orders">
                      {pendingOrdersCount}
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <PendingOrdersDialog 
        open={showPendingDialog} 
        onOpenChange={setShowPendingDialog}
      />
    </div>
  );
}
