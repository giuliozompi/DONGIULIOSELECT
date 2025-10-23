import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import type { Order, Product } from '@shared/schema';

interface MarkingCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  onComplete: () => void;
}

interface ProductWithMarkingStatus {
  product: Product;
  orderItem: Order['items'][0];
  markingCode: string;
  saved: boolean;
  error: string | null;
}

export function MarkingCodesDialog({
  open,
  onOpenChange,
  order,
  onComplete,
}: MarkingCodesDialogProps) {
  const { toast } = useToast();
  const [productsWithMarking, setProductsWithMarking] = useState<ProductWithMarkingStatus[]>([]);

  // Fetch all products to check which ones require marking
  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['/api/products'],
    enabled: open,
  });

  // Fetch existing marking logs for this order
  const { data: existingLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['/api/admin/marking-logs', order.id],
    enabled: open,
    queryFn: async () => {
      const response = await fetch(`/api/admin/marking-logs/${order.id}`);
      if (!response.ok) throw new Error('Failed to fetch marking logs');
      return response.json();
    },
  });

  // Initialize products with marking when data loads
  useEffect(() => {
    if (!allProducts.length || !order) return;

    const productsNeedingMarking: ProductWithMarkingStatus[] = [];

    for (const item of order.items) {
      const product = allProducts.find(p => p.id === item.productId);
      if (product?.requiresMarking) {
        // Check if code already exists
        const existingLog = existingLogs.find((log: any) => log.productId === item.productId);
        
        productsNeedingMarking.push({
          product,
          orderItem: item,
          markingCode: existingLog?.markingCode || '',
          saved: !!existingLog,
          error: null,
        });
      }
    }

    setProductsWithMarking(productsNeedingMarking);
  }, [allProducts, order, existingLogs]);

  // Save marking code mutation
  const saveMarkingMutation = useMutation({
    mutationFn: async ({ productId, markingCode }: { productId: string; markingCode: string }) => {
      return await apiRequest('POST', '/api/admin/marking-logs', {
        orderId: order.id,
        productId,
        markingCode,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/marking-logs', order.id] });
      
      // Update local state to mark as saved
      setProductsWithMarking(prev =>
        prev.map(p =>
          p.product.id === variables.productId
            ? { ...p, saved: true, error: null }
            : p
        )
      );
    },
    onError: (error: any, variables) => {
      const errorMessage = error.message || 'Failed to save marking code';
      
      // Update local state with error
      setProductsWithMarking(prev =>
        prev.map(p =>
          p.product.id === variables.productId
            ? { ...p, error: errorMessage }
            : p
        )
      );
      
      toast({
        title: 'Ошибка сохранения кода',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  const handleCodeChange = (productId: string, code: string) => {
    setProductsWithMarking(prev =>
      prev.map(p =>
        p.product.id === productId
          ? { ...p, markingCode: code, error: null }
          : p
      )
    );
  };

  const handleSaveCode = (productId: string, code: string) => {
    if (!code.trim()) {
      toast({
        title: 'Ошибка',
        description: 'Код маркировки не может быть пустым',
        variant: 'destructive',
      });
      return;
    }

    saveMarkingMutation.mutate({ productId, markingCode: code.trim() });
  };

  const allCodesSaved = productsWithMarking.length > 0 && 
    productsWithMarking.every(p => p.saved);

  const handleComplete = () => {
    if (!allCodesSaved) {
      toast({
        title: 'Не все коды сохранены',
        description: 'Сохраните все коды маркировки перед продолжением',
        variant: 'destructive',
      });
      return;
    }

    onComplete();
    onOpenChange(false);
  };

  if (productsLoading || logsLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="ml-2">Загрузка...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Маркировка товаров</DialogTitle>
          <DialogDescription>
            Заказ #{order.id.slice(0, 8)} содержит товары, требующие маркировки.
            Отсканируйте или введите коды для каждого товара.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {productsWithMarking.length === 0 ? (
            <p className="text-muted-foreground">
              В этом заказе нет товаров, требующих маркировки.
            </p>
          ) : (
            productsWithMarking.map((item) => (
              <div 
                key={item.product.id}
                className="border rounded-md p-4 space-y-3"
                data-testid={`marking-product-${item.product.id}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Количество: {item.orderItem.quantity} {item.orderItem.unit}
                    </p>
                  </div>
                  {item.saved && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" data-testid={`icon-saved-${item.product.id}`} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`code-${item.product.id}`}>
                    Код маркировки
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={`code-${item.product.id}`}
                      value={item.markingCode}
                      onChange={(e) => handleCodeChange(item.product.id, e.target.value)}
                      placeholder="Отсканируйте или введите код"
                      disabled={item.saved}
                      data-testid={`input-marking-code-${item.product.id}`}
                    />
                    <Button
                      onClick={() => handleSaveCode(item.product.id, item.markingCode)}
                      disabled={item.saved || saveMarkingMutation.isPending || !item.markingCode.trim()}
                      data-testid={`button-save-code-${item.product.id}`}
                    >
                      {saveMarkingMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : item.saved ? (
                        'Сохранено'
                      ) : (
                        'Сохранить'
                      )}
                    </Button>
                  </div>
                  {item.error && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4" />
                      <span>{item.error}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-marking"
          >
            Отмена
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!allCodesSaved}
            data-testid="button-complete-marking"
          >
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
