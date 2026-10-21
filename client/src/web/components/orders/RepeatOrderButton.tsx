import { useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { ReorderPreview, ReorderSkipReason, ReorderSkippedItem } from '@shared/reorder';
import { useWebAuth } from '../../hooks/useWebAuth';
import { useWebCart } from '../../hooks/useWebCart';
import { webApi } from '../../lib/webApi';
import { getOrderReference } from './order-view';

const reasons: Record<ReorderSkipReason, string> = {
  removed: 'Товар больше не продаётся',
  unavailable: 'Нет в наличии',
  unit_changed: 'Изменилась единица продажи',
  invalid_quantity: 'Не удалось восстановить количество',
  invalid_price: 'Не удалось определить текущую цену',
  cart_conflict: 'Сначала проверьте количество и единицу этого товара в корзине',
};

export function RepeatOrderButton({ orderId }: { orderId: string }) {
  const { user, isAuthenticated } = useWebAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const client = useQueryClient();
  const [review, setReview] = useState<{ addedCount: number; skipped: ReorderSkippedItem[] } | null>(null);
  const mutationKey = ['web-repeat-order', user?.id];
  const pending = useIsMutating({ mutationKey }) > 0;
  const mutation = useMutation({
    mutationKey,
    retry: false,
    mutationFn: ({ id }: { id: string; owner: string }) =>
      webApi.get<ReorderPreview>(`/orders/${encodeURIComponent(id)}/reorder`),
    onSuccess: (data, variables) => {
      const auth = useWebAuth.getState();
      if (!auth.isAuthenticated || auth.user?.id !== variables.owner) {
        toast({ title: 'Аккаунт изменился', description: 'Войдите в нужный аккаунт и повторите действие.', variant: 'destructive' });
        return;
      }
      const { addedCount, skipped } = useWebCart.getState().addReorderItems(
        data.items.map(({ priceChanged: _changed, ...item }) => item),
      );
      const allSkipped = [...data.skipped, ...skipped];
      if (allSkipped.length || addedCount === 0) {
        setReview({ addedCount, skipped: allSkipped });
        return;
      }
      toast({
        title: 'Товары добавлены в корзину',
        description: 'Применены текущие цены каталога. Проверьте корзину перед оформлением.',
      });
      setLocation('/web/cart');
    },
    onError: error => toast({
      title: 'Не удалось повторить заказ',
      description: error instanceof Error ? error.message : 'Попробуйте ещё раз.',
      variant: 'destructive',
    }),
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 border-[#cfc2a9] text-[#75613d] hover:bg-[#f4eee2]"
        data-testid={`repeat-order-${orderId}`}
        aria-label={`Повторить заказ № ${getOrderReference(orderId)}`}
        aria-busy={pending}
        disabled={pending || !isAuthenticated}
        onClick={() => {
          if (!user?.id || client.getMutationCache().findAll({ mutationKey, status: 'pending' }).length) return;
          mutation.mutate({ id: orderId, owner: user.id });
        }}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          : <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />}
        {pending ? 'Добавляем…' : 'Повторить заказ'}
      </Button>
      <Dialog open={review !== null} onOpenChange={open => { if (!open) setReview(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="reorder-review">
          <DialogHeader>
            <DialogTitle>{review?.addedCount ? 'Заказ повторён частично' : 'Нет товаров для повторения заказа'}</DialogTitle>
            <DialogDescription>
              {review?.addedCount
                ? 'Доступные товары добавлены в корзину по текущим ценам. Остальные позиции не добавлены:'
                : 'Корзина не изменена. Товары из этого заказа сейчас нельзя добавить.'}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 text-sm">
            {review?.skipped.map((item, index) => (
              <li key={`${item.productId}-${index}`} className="break-words">
                <p className="font-medium">{item.productName}</p>
                <p className="text-neutral-500">{reasons[item.reason]}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setReview(null)}>Закрыть</Button>
            <Button onClick={() => { setReview(null); setLocation('/web/cart'); }}
              data-testid="reorder-go-to-cart" className="bg-amber-600 text-white hover:bg-amber-700">
              Перейти в корзину
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
