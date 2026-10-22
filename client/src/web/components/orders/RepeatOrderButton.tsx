import { useEffect, useRef, useState } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { ReorderPreview, ReorderPreviewItem, ReorderSkipReason, ReorderSkippedItem } from '@shared/reorder';
import { useWebAuth } from '../../hooks/useWebAuth';
import { useWebCart } from '../../hooks/useWebCart';
import { webApi } from '../../lib/webApi';
import { getOrderReference } from './order-view';
import { ReorderPriceSummary } from './ReorderPriceSummary';

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
  const [review, setReview] = useState<{ owner: string; items: ReorderPreviewItem[]; addedCount: number; skipped: ReorderSkippedItem[] } | null>(null);
  const [confirmation, setConfirmation] = useState<{ owner: string; orderId: string } | null>(null);
  const inFlightRef = useRef(false);
  const mutationKey = ['web-repeat-order', user?.id];
  const pending = useIsMutating({ mutationKey }) > 0;
  const mutation = useMutation({
    mutationKey,
    retry: false,
    mutationFn: ({ id, owner }: { id: string; owner: string; confirmed: boolean }) => {
      if (!useWebAuth.getState().isAuthenticated || useWebAuth.getState().user?.id !== owner) {
        throw new Error('Аккаунт изменился');
      }
      return webApi.get<ReorderPreview>(`/orders/${encodeURIComponent(id)}/reorder`);
    },
    onSuccess: (data, variables) => {
      const auth = useWebAuth.getState();
      if (!auth.isAuthenticated || auth.user?.id !== variables.owner) {
        toast({ title: 'Аккаунт изменился', description: 'Войдите в нужный аккаунт и повторите действие.', variant: 'destructive' });
        return;
      }
      const { addedCount, skipped, confirmationRequired } = useWebCart.getState().addReorderItems(
        data.items.map(({ priceChanged: _changed, comparison: _comparison, ...item }) => item),
        { owner: variables.owner, orderId: variables.id, confirmed: variables.confirmed },
      );
      if (confirmationRequired) {
        setConfirmation({ owner: variables.owner, orderId: variables.id });
        return;
      }
      const allSkipped = [...data.skipped, ...skipped];
      setReview({
        owner: variables.owner, addedCount, skipped: allSkipped,
        items: data.items.filter(item => !skipped.some(excluded => excluded.productId === item.productId)),
      });
    },
    onError: error => toast({
      title: 'Не удалось повторить заказ',
      description: error instanceof Error ? error.message : 'Попробуйте ещё раз.',
      variant: 'destructive',
    }),
    onSettled: () => {
      inFlightRef.current = false;
    },
  });

  useEffect(() => {
    if (confirmation && (!isAuthenticated || confirmation.owner !== user?.id)) {
      setConfirmation(null);
    }
  }, [confirmation, isAuthenticated, user?.id]);

  const startRepeat = (id: string, owner: string, confirmed: boolean) => {
    const auth = useWebAuth.getState();
    if (!auth.isAuthenticated || auth.user?.id !== owner || inFlightRef.current) return;
    if (client.getMutationCache().findAll({ mutationKey: ['web-repeat-order', owner], status: 'pending' }).length) return;
    inFlightRef.current = true;
    mutation.mutate({ id, owner, confirmed });
  };

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
          if (!user?.id) return;
          const cart = useWebCart.getState();
          const alreadyRepeated = cart.repeatedOrders[user.id]?.includes(orderId) ?? false;
          if (alreadyRepeated && cart.items.length > 0) {
            setConfirmation({ owner: user.id, orderId });
            return;
          }
          startRepeat(orderId, user.id, false);
        }}
      >
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          : <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />}
        {pending ? 'Добавляем…' : 'Повторить заказ'}
      </Button>
      <AlertDialog
        open={confirmation !== null && isAuthenticated && confirmation.owner === user?.id}
        onOpenChange={open => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent data-testid="reorder-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>Добавить товары из заказа ещё раз?</AlertDialogTitle>
            <AlertDialogDescription>
              Все доступные товары и их количества из этого заказа будут добавлены в корзину повторно. Текущие товары в корзине останутся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="reorder-confirm-cancel"
              onClick={() => setConfirmation(null)}
            >
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="reorder-confirm-add"
              onClick={event => {
                event.preventDefault();
                const captured = confirmation;
                const auth = useWebAuth.getState();
                if (!captured || captured.owner !== user?.id || !auth.isAuthenticated || auth.user?.id !== captured.owner) {
                  setConfirmation(null);
                  return;
                }
                setConfirmation(null);
                startRepeat(captured.orderId, captured.owner, true);
              }}
              disabled={pending}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              Добавить ещё раз
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={review !== null && isAuthenticated && review.owner === user?.id} onOpenChange={open => { if (!open) setReview(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="reorder-review">
          <DialogHeader>
            <DialogTitle>{review?.addedCount ? (review.skipped.length ? 'Заказ повторён частично' : 'Товары добавлены в корзину') : 'Нет товаров для повторения заказа'}</DialogTitle>
            <DialogDescription>
              {review?.addedCount
                ? 'Доступные товары добавлены в корзину по текущим ценам. Проверьте изменения перед оформлением.'
                : 'Корзина не изменена. Товары из этого заказа сейчас нельзя добавить.'}
            </DialogDescription>
          </DialogHeader>
          {!!review?.items.length && <ReorderPriceSummary items={review.items} />}
          {!!review?.skipped.length && <p className="text-sm font-medium">Не добавлены:</p>}
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
