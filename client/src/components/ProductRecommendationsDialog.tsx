import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Minus, ShoppingCart, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { hapticFeedback } from '@/lib/telegram';
import type { Product, ProductAssociation } from '@shared/schema';

type RecommendationWithProduct = ProductAssociation & {
  targetProduct: Product;
};

interface ProductRecommendationsDialogProps {
  productId: string | null;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProductRecommendationsDialog({
  productId,
  productName,
  open,
  onOpenChange,
}: ProductRecommendationsDialogProps) {
  const { toast } = useToast();

  const query = useQuery<RecommendationWithProduct[]>({
    queryKey: ['/api/products', productId, 'recommendations'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/products/${productId}/recommendations`);
      return res.json();
    },
    enabled: !!productId && open,
  });

  const recommendations = query.data ?? [];

  // Auto-close ONLY if fetch completed successfully with no recommendations
  // This prevents closing during initial empty state before fetch completes
  useEffect(() => {
    if (query.isSuccess && recommendations.length === 0 && open) {
      console.log('[ProductRecommendationsDialog] Fetch completed with no recommendations, auto-closing');
      onOpenChange(false);
    }
  }, [query.isSuccess, recommendations.length, open, onOpenChange]);

  // Don't render if closed
  if (!open) {
    return null;
  }

  // Show loading state while fetching
  if (query.isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl" data-testid="recommendations-dialog">
          <DialogHeader>
            <DialogTitle>Рекомендуем к {productName}</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-muted-foreground">
            Загрузка...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // If fetch completed with no recommendations, don't render (useEffect will close)
  if (query.isSuccess && recommendations.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="recommendations-dialog">
        <DialogHeader>
          <DialogTitle>Рекомендуем к {productName}</DialogTitle>
          <DialogDescription>
            Эти продукты отлично сочетаются с вашим выбором
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 mt-4">
          {recommendations.map((rec) => (
            <RecommendationCard 
              key={rec.id} 
              product={rec.targetProduct} 
              reason={rec.reason}
              onAddedToCart={() => {
                // Можно chiudere il dialog dopo l'aggiunta o lasciarlo aperto
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface RecommendationCardProps {
  product: Product;
  reason: string | null;
  onAddedToCart: () => void;
}

function RecommendationCard({ product, reason, onAddedToCart }: RecommendationCardProps) {
  const { toast } = useToast();
  const isWeightBased = product.unit === 'кг';
  const step = isWeightBased ? 0.1 : 1;
  const initialQty = isWeightBased ? 0.2 : 1;
  const minQty = initialQty;
  
  const [quantity, setQuantity] = useState(initialQty);

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/cart/items', {
        productId: product.id,
        quantity,
      });
      return await res.json();
    },
    onSuccess: () => {
      hapticFeedback('success');
      toast({
        title: 'Добавлено в корзину',
        description: `${product.name} (${formatQuantity(quantity, product.unit)})`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      setQuantity(initialQty);
      onAddedToCart();
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

  const handleIncrement = () => {
    setQuantity(prev => prev + step);
    hapticFeedback('light');
  };

  const handleDecrement = () => {
    setQuantity(prev => Math.max(minQty, prev - step));
    hapticFeedback('light');
  };

  return (
    <Card className="overflow-hidden hover-elevate" data-testid={`recommendation-card-${product.id}`}>
      <div className="flex gap-4 p-4">
        <div className="flex flex-col gap-2">
          <div className="w-16 h-16 flex-shrink-0 bg-muted rounded-md overflow-hidden">
            <img
              src={product.images[0] || 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=200&h=200&fit=crop'}
              alt={product.name}
              className="w-full h-full object-cover"
              data-testid={`img-recommendation-${product.id}`}
            />
          </div>
          
          <div className="flex flex-col gap-2 w-16">
            <div className="flex items-center gap-1 bg-muted rounded-md p-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDecrement}
                disabled={quantity <= minQty}
                className="h-7 w-7"
                data-testid={`button-recommendation-decrease-${product.id}`}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <div className="flex-1 text-center">
                <p className="text-xs font-semibold" data-testid={`text-recommendation-quantity-${product.id}`}>
                  {formatQuantity(quantity, product.unit)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleIncrement}
                className="h-7 w-7"
                data-testid={`button-recommendation-increase-${product.id}`}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <Button
              size="sm"
              onClick={() => addToCartMutation.mutate()}
              disabled={addToCartMutation.isPending}
              data-testid={`button-recommendation-add-cart-${product.id}`}
              className="w-full"
            >
              <ShoppingCart className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <h3 className="font-medium mb-1" data-testid={`text-recommendation-name-${product.id}`}>
              {product.name}
            </h3>
            {reason && (
              <p className="text-sm text-muted-foreground mb-2" data-testid={`text-recommendation-reason-${product.id}`}>
                {reason}
              </p>
            )}
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-bold" data-testid={`text-recommendation-price-${product.id}`}>
                  {Math.round(parseFloat(product.price))} ₽
                </p>
                {product.priceOld && (
                  <p className="text-sm text-muted-foreground line-through">
                    {Math.round(parseFloat(product.priceOld))} ₽
                  </p>
                )}
                <p className="text-xs text-muted-foreground">/ {product.unit}</p>
              </div>
              <p className="text-sm text-muted-foreground" data-testid={`text-recommendation-total-${product.id}`}>
                {formatQuantity(quantity, product.unit)}: <span className="font-semibold text-foreground">{Math.round(parseFloat(product.price) * quantity)} ₽</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
