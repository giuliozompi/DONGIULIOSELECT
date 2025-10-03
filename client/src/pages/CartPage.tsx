import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { useTelegramMainButton } from '@/hooks/useTelegramMainButton';
import { hapticFeedback } from '@/lib/telegram';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import CartItem from '@/components/CartItem';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, ArrowLeft, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Cart, Product, Bonus } from '@shared/schema';

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: cart, isLoading } = useQuery<Cart>({
    queryKey: ['/api/cart'],
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: fortuneData } = useQuery<{
    spinTokens: number;
    bonuses: Bonus[];
    totalBonusAmount: string;
  }>({
    queryKey: ['/api/fortune'],
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      const res = await apiRequest('PATCH', `/api/cart/items/${productId}`, { quantity });
      return await res.json();
    },
    onSuccess: () => {
      hapticFeedback('light');
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest('DELETE', `/api/cart/items/${productId}`);
      return await res.json();
    },
    onSuccess: () => {
      hapticFeedback('light');
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      toast({
        title: 'Удалено',
        description: 'Товар удален из корзины',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/orders', {});
      return await res.json();
    },
    onSuccess: (data) => {
      hapticFeedback('success');
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      setLocation(`/order/${data.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка создания заказа',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useTelegramBackButton(() => setLocation('/'), true);

  const cartItems = cart?.items || [];

  const enrichedItems = cartItems.map((item) => {
    const product = allProducts.find(p => p.id === item.productId);
    return {
      id: item.productId,
      name: product?.name || 'Загрузка...',
      image: product?.images[0] || 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=200&h=200&fit=crop',
      price: parseFloat(item.priceAtAdd),
      unit: product?.unit || 'шт',
      quantity: Number(item.quantity.toFixed(2)),
      product,
    };
  });

  const totalAmount = enrichedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalBonusAmount = parseFloat(fortuneData?.totalBonusAmount || '0');
  const finalAmount = Math.max(0, totalAmount - totalBonusAmount);

  useTelegramMainButton({
    text: totalBonusAmount > 0 
      ? `Оформить заказ на ${Math.round(finalAmount)} ₽` 
      : `Оформить заказ на ${Math.round(totalAmount)} ₽`,
    onClick: () => createOrderMutation.mutate(),
    show: enrichedItems.length > 0,
    enabled: !createOrderMutation.isPending && enrichedItems.length > 0,
  });

  const handleQuantityChange = (productId: string, quantity: number) => {
    const roundedQty = Number(quantity.toFixed(2));
    updateQuantityMutation.mutate({ productId, quantity: roundedQty });
  };

  const handleRemove = (productId: string) => {
    removeItemMutation.mutate(productId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка корзины...</p>
      </div>
    );
  }

  if (enrichedItems.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-muted mx-auto flex items-center justify-center">
            <ShoppingCart className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Корзина пуста</h2>
          <p className="text-muted-foreground">Добавьте товары из каталога</p>
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
        {enrichedItems.map((item) => (
          <CartItem
            key={item.id}
            id={item.id}
            name={item.name}
            image={item.image}
            price={item.price}
            unit={item.unit}
            quantity={item.quantity}
            onQuantityChange={(quantity) => handleQuantityChange(item.id, quantity)}
            onRemove={() => handleRemove(item.id)}
          />
        ))}

        <Card className="p-4 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-base text-muted-foreground">Сумма товаров:</p>
              <p className="text-lg font-semibold">
                {Math.round(totalAmount)} ₽
              </p>
            </div>

            {totalBonusAmount > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-primary" />
                    <p className="text-base text-muted-foreground">Бонусы:</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold text-primary">
                      -{Math.round(totalBonusAmount)} ₽
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      Автоприменение
                    </Badge>
                  </div>
                </div>
                
                <div className="h-px bg-border" />
              </>
            )}
            
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">К оплате:</p>
              <p className="text-2xl font-bold" data-testid="text-total-amount">
                {Math.round(finalAmount)} ₽
              </p>
            </div>
          </div>
          
          <Button
            className="w-full"
            size="lg"
            onClick={() => createOrderMutation.mutate()}
            disabled={createOrderMutation.isPending || enrichedItems.length === 0}
            data-testid="button-checkout"
          >
            {createOrderMutation.isPending ? 'Оформление...' : `Оформить заказ на ${Math.round(finalAmount)} ₽`}
          </Button>
        </Card>
      </div>
    </div>
  );
}
