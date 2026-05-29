import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebAuth } from '../hooks/useWebAuth';
import { useWebCart } from '../hooks/useWebCart';
import { webApi } from '../lib/webApi';

interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: {
    id: string; name: string; slug: string; price: string; priceOld?: string;
    unit: string; images: string[]; inStock: boolean;
  };
}

export default function WebWishlistPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useWebAuth();
  const { addItem } = useWebCart();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['/web-api/wishlist'],
    queryFn: () => webApi.get<WishlistItem[]>('/wishlist'),
    enabled: isAuthenticated,
  });

  const toggleMutation = useMutation({
    mutationFn: (productId: string) =>
      webApi.post<{ inWishlist: boolean }>(`/wishlist/${productId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/web-api/wishlist'] }),
  });

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Heart className="w-12 h-12 mx-auto text-neutral-200 mb-3" />
        <p className="text-neutral-500 mb-4">Войдите, чтобы видеть избранные товары</p>
        <Button className="bg-amber-600 text-white" onClick={() => setLocation('/web')}>На главную</Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">
        Избранное {items.length > 0 && <span className="text-neutral-400 font-normal">({items.length})</span>}
      </h1>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-xl bg-neutral-100 animate-pulse aspect-[3/4]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <Heart className="w-12 h-12 mx-auto text-neutral-200 mb-3" />
          <p className="font-medium text-neutral-600">Нет избранных товаров</p>
          <p className="text-sm text-neutral-400 mt-1 mb-6">Добавляйте товары в избранное, чтобы не потерять</p>
          <Button className="bg-amber-600 text-white" onClick={() => setLocation('/web/catalog')}>
            Перейти в каталог
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.filter(i => i.product).map(item => {
            const p = item.product;
            const price = parseFloat(p.price);
            const priceOld = p.priceOld ? parseFloat(p.priceOld) : null;
            const discount = priceOld ? Math.round((1 - price / priceOld) * 100) : null;

            return (
              <div
                key={item.id}
                className="group bg-white rounded-xl border border-neutral-200 overflow-hidden flex flex-col hover-elevate"
                data-testid={`wishlist-item-${item.productId}`}
              >
                {/* Image */}
                <div
                  className="relative aspect-square bg-neutral-50 overflow-hidden cursor-pointer"
                  onClick={() => setLocation(`/web/product/${p.slug}`)}
                >
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-300">
                      <ShoppingCart className="w-8 h-8" />
                    </div>
                  )}
                  {discount && (
                    <Badge className="absolute top-2 left-2 bg-red-500 text-white border-0 text-xs">
                      -{discount}%
                    </Badge>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); toggleMutation.mutate(item.productId); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-red-500 hover:bg-red-50"
                    data-testid={`button-remove-wishlist-${item.productId}`}
                  >
                    <Heart className="w-3.5 h-3.5 fill-red-500" />
                  </button>
                </div>

                {/* Info */}
                <div className="p-3 flex flex-col flex-1 gap-2">
                  <p
                    className="text-sm font-medium text-neutral-900 leading-tight line-clamp-2 cursor-pointer hover:text-amber-700"
                    onClick={() => setLocation(`/web/product/${p.slug}`)}
                  >
                    {p.name}
                  </p>
                  <div className="mt-auto flex items-end justify-between gap-1">
                    <div>
                      <span className="font-semibold text-sm">{price.toLocaleString('ru-RU')} ₽</span>
                      <span className="text-xs text-neutral-400">/{p.unit}</span>
                    </div>
                    <Button
                      size="icon"
                      className="h-8 w-8 rounded-full bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                      onClick={() => addItem({ productId: p.id, productName: p.name, price: p.price, unit: p.unit, image: p.images?.[0] })}
                      disabled={!p.inStock}
                      data-testid={`button-add-wishlist-item-${item.productId}`}
                    >
                      <ShoppingCart className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
