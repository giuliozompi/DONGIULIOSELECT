import { useLocation } from 'wouter';
import { Home, ShoppingCart, Sparkles, Bot } from 'lucide-react';

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Главная' },
    { path: '/cart', icon: ShoppingCart, label: 'Корзина' },
    { path: '/fortune', icon: Sparkles, label: 'Призы' },
    { path: '/assistant', icon: Bot, label: 'Помощник' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50" data-testid="nav-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full hover-elevate active-elevate-2 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
              data-testid={`button-nav-${item.label}`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
