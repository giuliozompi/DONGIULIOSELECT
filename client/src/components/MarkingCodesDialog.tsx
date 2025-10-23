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

interface MarkingCodeUnit {
  unitIndex: number;
  code: string;
  saved: boolean;
  error: string | null;
}

interface ProductWithMarkingStatus {
  product: Product;
  orderItem: Order['items'][0];
  units: MarkingCodeUnit[];
}

export function MarkingCodesDialog({
  open,
  onOpenChange,
  order,
  onComplete,
}: MarkingCodesDialogProps) {
  const { toast } = useToast();
  const [productsWithMarking, setProductsWithMarking] = useState<ProductWithMarkingStatus[]>([]);
  const [initialized, setInitialized] = useState(false);

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

  // Reset initialized flag when dialog closes
  useEffect(() => {
    if (!open) {
      setInitialized(false);
      setProductsWithMarking([]);
    }
  }, [open]);

  // Initialize products with marking ONLY ONCE when data loads
  useEffect(() => {
    if (!allProducts.length || !order || initialized) return;

    const productsNeedingMarking: ProductWithMarkingStatus[] = [];

    for (const item of order.items) {
      const product = allProducts.find(p => p.id === item.productId);
      
      // IMPORTANTE: Маркировка attiva SOLO per prodotti a pezzo (шт)
      const isUnitProduct = item.unit === 'шт';
      
      if (product?.requiresMarking && isUnitProduct) {
        // Get all existing logs for this product
        const productLogs = existingLogs.filter((log: any) => log.productId === item.productId);
        
        // Create units array based on quantity (for шт, quantity is always integer)
        const quantity = Math.ceil(item.quantity);
        const units: MarkingCodeUnit[] = [];
        
        for (let i = 0; i < quantity; i++) {
          const existingLog = productLogs[i];
          units.push({
            unitIndex: i,
            code: existingLog?.markingCode || '',
            saved: !!existingLog,
            error: null,
          });
        }
        
        productsNeedingMarking.push({
          product,
          orderItem: item,
          units,
        });
      }
    }

    setProductsWithMarking(productsNeedingMarking);
    setInitialized(true);
  }, [allProducts, order, existingLogs, initialized]);

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
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка сохранения кода',
        description: error.message || 'Failed to save marking code',
        variant: 'destructive',
      });
    },
  });

  const handleCodeChange = (productId: string, unitIndex: number, code: string) => {
    setProductsWithMarking(prev =>
      prev.map(p =>
        p.product.id === productId
          ? {
              ...p,
              units: p.units.map((u, idx) =>
                idx === unitIndex
                  ? { ...u, code, error: null }
                  : u
              ),
            }
          : p
      )
    );
  };

  const handleSaveCode = async (productId: string, unitIndex: number, code: string) => {
    if (!code.trim()) {
      setProductsWithMarking(prev =>
        prev.map(p =>
          p.product.id === productId
            ? {
                ...p,
                units: p.units.map((u, idx) =>
                  idx === unitIndex
                    ? { ...u, error: 'Код маркировки не может быть пустым' }
                    : u
                ),
              }
            : p
        )
      );
      return;
    }

    // Check for duplicates within this product
    const product = productsWithMarking.find(p => p.product.id === productId);
    if (product) {
      const isDuplicate = product.units.some(
        (u, idx) => idx !== unitIndex && u.code.trim() === code.trim() && u.code.trim() !== ''
      );
      
      if (isDuplicate) {
        setProductsWithMarking(prev =>
          prev.map(p =>
            p.product.id === productId
              ? {
                  ...p,
                  units: p.units.map((u, idx) =>
                    idx === unitIndex
                      ? { ...u, error: 'Этот код уже используется для другой единицы' }
                      : u
                  ),
                }
              : p
          )
        );
        return;
      }
    }

    try {
      await saveMarkingMutation.mutateAsync({ productId, markingCode: code.trim() });
      
      // Mark as saved on success
      setProductsWithMarking(prev =>
        prev.map(p =>
          p.product.id === productId
            ? {
                ...p,
                units: p.units.map((u, idx) =>
                  idx === unitIndex
                    ? { ...u, saved: true, error: null }
                    : u
                ),
              }
            : p
        )
      );
      
      toast({
        title: 'Код сохранён',
        description: `Код маркировки для единицы ${unitIndex + 1} сохранён успешно`,
      });
    } catch (error: any) {
      setProductsWithMarking(prev =>
        prev.map(p =>
          p.product.id === productId
            ? {
                ...p,
                units: p.units.map((u, idx) =>
                  idx === unitIndex
                    ? { ...u, error: error.message || 'Ошибка сохранения' }
                    : u
                ),
              }
            : p
        )
      );
    }
  };

  const allCodesSaved = productsWithMarking.length > 0 && 
    productsWithMarking.every(p => p.units.every(u => u.saved));

  const getTotalUnits = () => {
    return productsWithMarking.reduce((sum, p) => sum + p.units.length, 0);
  };

  const getSavedUnits = () => {
    return productsWithMarking.reduce(
      (sum, p) => sum + p.units.filter(u => u.saved).length,
      0
    );
  };

  const handleComplete = () => {
    if (!allCodesSaved) {
      toast({
        title: 'Не все коды сохранены',
        description: `Сохранено ${getSavedUnits()} из ${getTotalUnits()} кодов. Сохраните все коды маркировки перед продолжением.`,
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
            Отсканируйте или введите коды для каждой единицы товара.
            {!allCodesSaved && (
              <span className="block mt-2 font-medium text-foreground">
                Прогресс: {getSavedUnits()} / {getTotalUnits()} кодов сохранено
              </span>
            )}
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
                      Количество: {item.orderItem.quantity} {item.orderItem.unit} ({item.units.length} {item.units.length === 1 ? 'единица' : 'единиц'})
                    </p>
                    <p className="text-sm font-medium mt-1">
                      Сохранено: {item.units.filter(u => u.saved).length} / {item.units.length}
                    </p>
                  </div>
                  {item.units.every(u => u.saved) && (
                    <CheckCircle2 className="w-5 h-5 text-green-600" data-testid={`icon-all-saved-${item.product.id}`} />
                  )}
                </div>

                <div className="space-y-3">
                  {item.units.map((unit) => (
                    <div key={unit.unitIndex} className="space-y-2">
                      <Label htmlFor={`code-${item.product.id}-${unit.unitIndex}`}>
                        Единица {unit.unitIndex + 1}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={`code-${item.product.id}-${unit.unitIndex}`}
                          value={unit.code}
                          onChange={(e) => handleCodeChange(item.product.id, unit.unitIndex, e.target.value)}
                          placeholder="Отсканируйте или введите код"
                          disabled={unit.saved}
                          data-testid={`input-marking-code-${item.product.id}-${unit.unitIndex}`}
                        />
                        <Button
                          onClick={() => handleSaveCode(item.product.id, unit.unitIndex, unit.code)}
                          disabled={unit.saved || saveMarkingMutation.isPending || !unit.code.trim()}
                          data-testid={`button-save-code-${item.product.id}-${unit.unitIndex}`}
                        >
                          {saveMarkingMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : unit.saved ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Сохранено
                            </>
                          ) : (
                            'Сохранить'
                          )}
                        </Button>
                      </div>
                      {unit.error && (
                        <div className="flex items-center gap-2 text-sm text-destructive">
                          <AlertCircle className="w-4 h-4" />
                          <span>{unit.error}</span>
                        </div>
                      )}
                    </div>
                  ))}
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
            {allCodesSaved ? 'Готово' : `Готово (${getSavedUnits()}/${getTotalUnits()})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
