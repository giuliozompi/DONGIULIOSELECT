import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ShoppingBag, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { Product } from '@shared/schema';

export default function PurchasedProductsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['/api/user/purchased-products']
  });

  useTelegramBackButton(() => {
    setLocation('/lk');
  });

  const addToCartMutation = useMutation({
    mutationFn: async (productId: string) => {
      const cartResult = await fetch('/api/cart');
      const currentCart = await cartResult.json();
      
      const existingItem = currentCart.items?.find((item: any) => item.productId === productId);
      const newQuantity = existingItem ? existingItem.quantity + 1 : 1;
      
      const updatedItems = existingItem
        ? currentCart.items.map((item: any) =>
            item.productId === productId ? { ...item, quantity: newQuantity } : item
          )
        : [...(currentCart.items || []), { productId, quantity: 1 }];
      
      return await apiRequest('POST', '/api/cart', { items: updatedItems });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      toast({
        title: 'Добавлено в корзину',
        description: 'Товар успешно добавлен в корзину'
      });
    },
    onError: () => {
      toast({
        title: 'Ошибка',
        description: 'Не удалось добавить товар в корзину',
        variant: 'destructive'
      });
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/lk')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Покупки</h1>
        </div>
      </div>

      <div className="p-4">
        {!products || products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-6 rounded-full bg-muted mb-4">
              <ShoppingBag className="w-12 h-12 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2" data-testid="text-empty-title">
              Нет покупок
            </h2>
            <p className="text-muted-foreground mb-6" data-testid="text-empty-description">
              Вы еще не совершили ни одного заказа
            </p>
            <Button onClick={() => setLocation('/')} data-testid="button-shop-now">
              Начать покупки
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-products-count">
              Вы купили {products.length} {products.length === 1 ? 'товар' : products.length < 5 ? 'товара' : 'товаров'}
            </p>
            {products.map((product) => (
              <Card key={product.id} data-testid={`card-product-${product.id}`}>
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {product.images && product.images.length > 0 && (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-20 h-20 object-cover rounded-md"
                        data-testid={`img-product-${product.id}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold mb-1 truncate" data-testid={`text-product-name-${product.id}`}>
                        {product.name}
                      </h3>
                      {product.descriptionShort && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2" data-testid={`text-product-description-${product.id}`}>
                          {product.descriptionShort}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-bold text-lg" data-testid={`text-product-price-${product.id}`}>
                          {product.price} ₽
                        </span>
                        {product.unit && (
                          <span className="text-sm text-muted-foreground" data-testid={`text-product-unit-${product.id}`}>
                            / {product.unit}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => addToCartMutation.mutate(product.id)}
                          disabled={!product.inStock || addToCartMutation.isPending}
                          data-testid={`button-add-to-cart-${product.id}`}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Купить снова
                        </Button>
                        {!product.inStock && (
                          <Badge variant="secondary" data-testid={`badge-out-of-stock-${product.id}`}>
                            Нет в наличии
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
