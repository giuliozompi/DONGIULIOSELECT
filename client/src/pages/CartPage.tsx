import { useState } from 'react';
import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { useTelegramMainButton } from '@/hooks/useTelegramMainButton';
import { hapticFeedback } from '@/lib/telegram';
import CartItem from '@/components/CartItem';
import { Card } from '@/components/ui/card';
import { ShoppingCart, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

//todo: remove mock functionality
interface CartItemType {
  id: string;
  name: string;
  image: string;
  price: number;
  unit: string;
  quantity: number;
}

export default function CartPage() {
  const [, setLocation] = useLocation();
  const [cartItems, setCartItems] = useState<CartItemType[]>([
    {
      id: '1',
      name: 'Сыр Моцарелла',
      image: 'https://images.unsplash.com/photo-1589881133595-39464f7aa2e4?w=200&h=200&fit=crop',
      price: 890,
      unit: 'кг',
      quantity: 2,
    },
    {
      id: '2',
      name: 'Пармезан Реджано',
      image: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=200&h=200&fit=crop',
      price: 1490,
      unit: 'кг',
      quantity: 1,
    },
  ]);

  useTelegramBackButton(() => setLocation('/'), true);

  const totalAmount = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useTelegramMainButton({
    text: `Оформить заказ на ${totalAmount} ₽`,
    onClick: () => {
      hapticFeedback('success');
      console.log('Checkout:', cartItems);
      setLocation('/checkout');
    },
    show: cartItems.length > 0,
    enabled: cartItems.length > 0,
  });

  const handleQuantityChange = (id: string, quantity: number) => {
    setCartItems((items) =>
      items.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const handleRemove = (id: string) => {
    hapticFeedback('light');
    setCartItems((items) => items.filter((item) => item.id !== id));
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-muted mx-auto flex items-center justify-center">
            <ShoppingCart className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Корзина пуста</h2>
          <p className="text-muted-foreground">Добавьте товары из каталога</p>
        </div>
      </div>
    );
  }

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
            Корзина
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {cartItems.map((item) => (
          <CartItem
            key={item.id}
            {...item}
            onQuantityChange={(quantity) => handleQuantityChange(item.id, quantity)}
            onRemove={() => handleRemove(item.id)}
          />
        ))}

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">Итого:</p>
            <p className="text-2xl font-bold" data-testid="text-total-amount">
              {totalAmount} ₽
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
