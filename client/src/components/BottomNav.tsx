import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Home, ShoppingCart, Sparkles, Package, Shield, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  // Check if user is admin
  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
  });

  // Get fortune data for badge
  const { data: fortuneData } = useQuery<{
    spinTokens: number;
    prizes: any[];
    bonuses: any[];
    totalBonusAmount: string;
  }>({
    queryKey: ['/api/fortune'],
    retry: false,
  });

  // Get cart data for badge
  const { data: cartData } = useQuery<{
    items: Array<{ productId: string; quantity: number; priceAtAdd: string }>;
  }>({
    queryKey: ['/api/cart'],
    retry: false,
  });

  // Count number of distinct products in cart
  const cartItemCount = cartData?.items?.length || 0;

  const navItems = [
    { path: '/', icon: Home, label: 'Главная' },
    { path: '/cart', icon: ShoppingCart, label: 'Корзина' },
    { path: '/orders', icon: Package, label: 'Заказы' },
    { path: '/fortune', icon: Sparkles, label: 'Призы' },
    { path: '/assistant', icon: Bot, label: 'Помощник' },
  ];

  // Add admin link if user is admin
  if (adminCheck?.isAdmin) {
    navItems.push({ path: '/admin', icon: Shield, label: 'Админ' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50" data-testid="nav-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          const isFortune = item.path === '/fortune';
          const isCart = item.path === '/cart';
          const showFortuneBadge = isFortune && fortuneData && fortuneData.spinTokens > 0;
          const showCartBadge = isCart && cartItemCount > 0;
          
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full hover-elevate active-elevate-2 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
              data-testid={`button-nav-${item.label}`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {showFortuneBadge && (
                  <Badge 
                    className="absolute -top-2 -right-2 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] rounded-full"
                    data-testid="badge-fortune-tokens"
                  >
                    {fortuneData.spinTokens}
                  </Badge>
                )}
                {showCartBadge && (
                  <Badge 
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] rounded-full"
                    data-testid="badge-cart-count"
                  >
                    {cartItemCount}
                  </Badge>
                )}
              </div>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
