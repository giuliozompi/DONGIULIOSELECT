import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { useTelegramMainButton } from '@/hooks/useTelegramMainButton';
import { hapticFeedback } from '@/lib/telegram';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import ProductGallery from '@/components/ProductGallery';
import TasteRating from '@/components/TasteRating';
import ProductAccordion from '@/components/ProductAccordion';
import RelatedProducts from '@/components/RelatedProducts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Minus } from 'lucide-react';
import type { Product } from '@shared/schema';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [quantity, setQuantity] = useState(0.1);

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ['/api/products', id],
  });

  useEffect(() => {
    if (product) {
      const initialQty = product.unit === 'кг' ? 0.2 : 1;
      setQuantity(initialQty);
    }
  }, [product]);

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/cart/items', {
        productId: id,
        quantity,
      });
      return await res.json();
    },
    onSuccess: () => {
      hapticFeedback('success');
      toast({
        title: 'Добавлено в корзину',
        description: `${product?.name} (${formatQuantity(quantity, product?.unit || '')})`,
      });
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

  useTelegramBackButton(() => window.history.back(), true);

  const isWeightBased = product?.unit === 'кг';
  const step = isWeightBased ? 0.1 : 1;
  const initialQty = isWeightBased ? 0.2 : 1;
  const minQty = initialQty; // Quantità minima = quantità iniziale

  const formatQuantity = (qty: number, unit: string) => {
    if (unit === 'кг') {
      return `${qty.toFixed(2)} кг`;
    }
    return `${qty} ${unit}`;
  };

  const totalPrice = product ? parseFloat(product.price) * quantity : 0;
  const mainButtonText = product 
    ? product.inStock 
      ? `Добавить ${formatQuantity(quantity, product.unit)} в корзину за ${Math.round(totalPrice)} ₽`
      : 'Нет в наличии'
    : 'Загрузка...';

  const isTelegramAvailable = typeof window !== 'undefined' && window.Telegram?.WebApp && (window.Telegram.WebApp as any).initData;

  useTelegramMainButton({
    text: mainButtonText,
    onClick: () => addToCartMutation.mutate(),
    show: !!product && isTelegramAvailable,
    enabled: !addToCartMutation.isPending && quantity >= minQty && (product?.inStock ?? true),
  });

  if (!product && !isLoading) {
    setLocation('/');
    return null;
  }

  const relatedProducts = allProducts
    .filter(p => p.categoryId === product?.categoryId && p.id !== id)
    .slice(0, 3)
    .map(p => ({
      id: p.id,
      name: p.name,
      price: parseFloat(p.price),
      unit: p.unit,
      image: p.images[0] || 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop',
    }));

  const handleIncrement = () => {
    setQuantity(prev => prev + step);
    hapticFeedback('light');
  };

  const handleDecrement = () => {
    setQuantity(prev => Math.max(minQty, prev - step));
    hapticFeedback('light');
  };

  if (isLoading || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="p-2">
          <Button 
            size="icon" 
            variant="ghost"
            onClick={() => window.history.back()}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      <ProductGallery 
        images={product.images.length > 0 ? product.images : ['https://images.unsplash.com/photo-1452195100486-9cc805987862?w=800&h=800&fit=crop']} 
        productId={product.id}
      />

      <div className="p-6 space-y-6">
        {!product.inStock && (
          <Badge className="bg-destructive text-destructive-foreground text-sm">
            тю-тю не в наличии
          </Badge>
        )}
        {!isTelegramAvailable && (
          <Button
            className="w-full"
            onClick={() => addToCartMutation.mutate()}
            disabled={addToCartMutation.isPending || quantity < minQty || !product.inStock}
            data-testid="button-add-to-cart"
          >
            {mainButtonText}
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold mb-4" data-testid="text-name">
            {product.name}
          </h1>

          <div className="flex items-baseline gap-3 mb-4">
            <p className="text-3xl font-bold text-primary" data-testid="text-price">
              {Math.round(parseFloat(product.price))} ₽
            </p>
            {product.priceOld && (
              <p className="text-xl text-muted-foreground line-through" data-testid="text-price-old">
                {Math.round(parseFloat(product.priceOld))} ₽
              </p>
            )}
            <p className="text-lg text-muted-foreground">/ {product.unit}</p>
          </div>

          {product.tasteVariations && product.tasteVariations.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-sm font-medium">Доступные вкусы:</p>
              <div className="flex gap-2 flex-wrap">
                {product.tasteVariations.map((taste) => (
                  <Badge
                    key={taste}
                    variant="secondary"
                    className="px-4 py-2"
                    data-testid={`badge-taste-${taste}`}
                  >
                    {taste}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <Button
              size="icon"
              variant="outline"
              onClick={handleDecrement}
              disabled={quantity <= minQty}
              data-testid="button-decrease-quantity"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <p className="text-2xl font-bold" data-testid="text-quantity">
                {formatQuantity(quantity, product.unit)}
              </p>
              <p className="text-sm text-muted-foreground">
                {isWeightBased ? 'Шаг: 100г' : 'Шаг: 1 шт'}
              </p>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={handleIncrement}
              data-testid="button-increase-quantity"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {product.descriptionShort && (
          <div>
            <p className="text-base leading-relaxed text-foreground">
              {product.descriptionShort}
            </p>
          </div>
        )}

        {product.tasteRatingStats && (
          <TasteRating
            stats={{
              tasty: product.tasteRatingStats.tasty || 0,
              very_tasty: product.tasteRatingStats.veryTasty || 0,
              super: product.tasteRatingStats.superTasty || 0,
            }}
            onRate={(rating) => console.log('Rated:', rating)}
          />
        )}

        {(product.descriptionFull || product.nutrition) && (
          <ProductAccordion
            fullDescription={product.descriptionFull || ''}
            nutrition={product.nutrition ? {
              bju: {
                proteins: parseInt(product.nutrition.proteins) || 0,
                fats: parseInt(product.nutrition.fats) || 0,
                carbs: parseInt(product.nutrition.carbs) || 0,
                calories: parseInt(product.nutrition.calories) || 0,
              },
              values: [],
              composition: product.nutrition.composition?.join(', ') || '',
            } : undefined}
            consumptionTips=""
          />
        )}

        {relatedProducts.length > 0 && (
          <RelatedProducts
            title="Похожие продукты"
            products={relatedProducts}
            onProductClick={(productId) => setLocation(`/product/${productId}`)}
          />
        )}
      </div>
    </div>
  );
}
