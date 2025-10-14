import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart } from 'lucide-react';
import ProductCard from '@/components/ProductCard';
import type { Product } from '@shared/schema';

type FavoriteProduct = Product & { categoryName: string };

export default function FavoritesPage() {
  const [, setLocation] = useLocation();

  const { data: favorites = [], isLoading } = useQuery<FavoriteProduct[]>({
    queryKey: ['/api/favorites'],
  });

  useTelegramBackButton(() => window.history.back(), true);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="flex items-center gap-3 p-4">
          <Button 
            size="icon" 
            variant="ghost"
            onClick={() => window.history.back()}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Избранное
          </h1>
        </div>
      </div>

      <div className="p-4">
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4" data-testid="empty-favorites">
            <Heart className="w-24 h-24 mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Нет избранных товаров</h2>
            <p className="text-muted-foreground text-center mb-6">
              Добавьте товары в избранное, нажав на иконку сердца
            </p>
            <Button
              onClick={() => setLocation('/')}
              data-testid="button-browse-products"
            >
              Смотреть каталог
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {favorites.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                category={product.categoryName || ''}
                price={parseFloat(product.price)}
                priceOld={product.priceOld ? parseFloat(product.priceOld) : undefined}
                unit={product.unit}
                image={product.images[0] || 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop'}
                onClick={() => setLocation(`/products/${product.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
