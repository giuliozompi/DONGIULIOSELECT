import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, User, Heart, Package } from 'lucide-react';

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  
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
          return (
            <Card
              key={item.path}
              className="hover-elevate active-elevate-2 cursor-pointer"
              onClick={() => setLocation(item.path)}
              data-testid={item.testId}
            >
              <CardHeader className="flex flex-row items-center gap-4 space-y-0">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription className="text-sm">{item.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
