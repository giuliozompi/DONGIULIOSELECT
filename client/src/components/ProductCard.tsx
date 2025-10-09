import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Minus, ShoppingCart, Info } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { hapticFeedback } from '@/lib/telegram';
import ProductRecommendationsDialog from './ProductRecommendationsDialog';

interface ProductCardProps {
  id: string;
  name: string;
  category: string;
  price: number;
  priceOld?: number;
  unit: string;
  image: string;
  onClick?: () => void;
}

export default function ProductCard({
  id,
  name,
  category,
  price,
  priceOld,
  unit,
  image,
  onClick,
}: ProductCardProps) {
  const { toast } = useToast();
  const isWeightBased = unit === 'кг';
  const step = isWeightBased ? 0.1 : 1;
  const initialQty = isWeightBased ? 0.2 : 1;
  const minQty = initialQty; // Quantità minima = quantità iniziale
  
  const [quantity, setQuantity] = useState(initialQty);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [recommendedProductId, setRecommendedProductId] = useState<string | null>(null);

  const addToCartMutation = useMutation({
    mutationFn: async (options?: { skipRecommendations?: boolean }) => {
      const res = await apiRequest('POST', '/api/cart/items', {
        productId: id,
        quantity,
      });
      return { data: await res.json(), skipRecommendations: options?.skipRecommendations };
    },
    onSuccess: async (result) => {
      hapticFeedback('success');
      toast({
        title: 'Добавлено в корзину',
        description: `${name} (${formatQuantity(quantity, unit)})`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      setQuantity(initialQty); // Reset quantity after adding
      
      // Check for recommendations - only if not skipped and dialog is not already open (prevent loop)
      if (!result.skipRecommendations && !showRecommendations) {
        // First check if there are actually recommendations before opening dialog
        try {
          console.log('[ProductCard] Checking recommendations for product:', id);
          const recRes = await apiRequest('GET', `/api/products/${id}/recommendations`);
          const recommendations = await recRes.json();
          console.log('[ProductCard] Recommendations received:', recommendations);
          
          // Only open dialog if there are recommendations
          if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
            console.log('[ProductCard] Opening recommendations dialog with', recommendations.length, 'items');
            setRecommendedProductId(id);
            setShowRecommendations(true);
          } else {
            console.log('[ProductCard] No recommendations found, not opening dialog');
          }
        } catch (error) {
          console.error('[ProductCard] Error checking recommendations:', error);
          // Don't open dialog if there's an error
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const formatQuantity = (qty: number, u: string) => {
    if (u === 'кг') {
      return `${qty.toFixed(2)} кг`;
    }
    return `${qty} ${u}`;
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuantity(prev => prev + step);
    hapticFeedback('light');
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuantity(prev => Math.max(minQty, prev - step));
    hapticFeedback('light');
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCartMutation.mutate({}); // Allow recommendations dialog
  };

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <>
      <Card
        className="overflow-hidden"
        data-testid={`card-product-${name}`}
      >
      <div className="aspect-square bg-muted relative overflow-hidden">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover"
          data-testid={`img-product-${name}`}
        />
        {priceOld && (
          <Badge className="absolute top-2 right-2 bg-destructive text-destructive-foreground">
            Скидка
          </Badge>
        )}
      </div>
      <div className="p-3 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1" data-testid="text-category">
            {category}
          </p>
          <h3 className="text-sm font-medium line-clamp-2 mb-2 min-h-[2.5rem]" data-testid="text-name">
            {name}
          </h3>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <p className="text-lg font-bold" data-testid="text-price">
                {price} ₽
              </p>
              {priceOld && (
                <p className="text-sm text-muted-foreground line-through" data-testid="text-price-old">
                  {priceOld} ₽
                </p>
              )}
              <p className="text-xs text-muted-foreground">/ {unit}</p>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-total-for-quantity">
              {formatQuantity(quantity, unit)}: <span className="font-semibold text-foreground">{Math.round(price * quantity)} ₽</span>
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={handleInfoClick}
            data-testid={`button-info-${id}`}
          >
            <Info className="h-4 w-4 mr-2" />
            Подробнее
          </Button>

          <div className="flex items-center gap-2 bg-muted rounded-md p-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleDecrement}
              disabled={quantity <= minQty}
              className="h-7 w-7"
              data-testid={`button-decrease-${id}`}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold" data-testid={`text-quantity-${id}`}>
                {formatQuantity(quantity, unit)}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleIncrement}
              className="h-7 w-7"
              data-testid={`button-increase-${id}`}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={handleAddToCart}
            disabled={addToCartMutation.isPending}
            data-testid={`button-add-cart-${id}`}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {addToCartMutation.isPending ? 'Добавление...' : 'В корзину'}
          </Button>
        </div>
      </div>
    </Card>
    
    <ProductRecommendationsDialog
      productId={recommendedProductId}
      productName={name}
      open={showRecommendations}
      onOpenChange={setShowRecommendations}
    />
    </>
  );
}
