import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useWebAuth } from './useWebAuth';
import { webApi } from '../lib/webApi';

export interface WishlistProduct {
  id: string;
  name: string;
  slug: string;
  price: string;
  priceOld?: string;
  unit: string;
  images: string[];
  inStock: boolean;
}

export interface WishlistItem {
  id: string;
  productId: string;
  createdAt: string;
  product: WishlistProduct | null;
}

type WishlistChange = { id: string; inWishlist: boolean };

export function useWebWishlist(productId?: string) {
  const { user, isAuthenticated } = useWebAuth();
  const client = useQueryClient();
  const { toast } = useToast();
  // Never reuse a previous customer's selected products after an account switch.
  const queryKey = ['/web-api/wishlist', user?.id];
  const mutationKey = ['web-wishlist-set', user?.id];
  const query = useQuery({
    queryKey,
    queryFn: () => webApi.get<WishlistItem[]>('/wishlist'),
    enabled: isAuthenticated && !!user?.id,
    staleTime: 0,
    retry: false,
  });
  const pending = useIsMutating({
    mutationKey,
    predicate: mutation => productId === undefined || (mutation.state.variables as WishlistChange)?.id === productId,
  }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ id, inWishlist }: WishlistChange) => {
      const path = `/wishlist/${encodeURIComponent(id)}`;
      return inWishlist
        ? webApi.put<{ inWishlist: boolean }>(path)
        : webApi.delete<{ inWishlist: boolean }>(path);
    },
    // Retried transport requests preserve the original explicit intent.
    // Keep automatic query-library retries disabled to avoid repeated error toasts.
    retry: false,
    onSuccess: result => {
      toast({ title: result.inWishlist ? 'Добавлено в избранное' : 'Удалено из избранного' });
    },
    onError: error => {
      toast({
        title: 'Не удалось изменить избранное',
        description: error instanceof Error ? error.message : 'Попробуйте ещё раз.',
        variant: 'destructive',
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey }),
  });

  const toggle = (id: string) => {
    if (!isAuthenticated || !user?.id) return;
    const alreadyPending = client.getMutationCache()
      .findAll({ mutationKey, exact: true, status: 'pending' })
      .some(entry => (entry.state.variables as WishlistChange)?.id === id);
    if (!alreadyPending && query.isSuccess) {
      const inWishlist = !(query.data ?? []).some(item => item.productId === id);
      mutation.mutate({ id, inWishlist });
    }
  };

  return {
    ...query,
    items: isAuthenticated ? (query.data ?? []) : [],
    isFavorite: isAuthenticated && (query.data ?? []).some(item => item.productId === productId),
    isToggling: pending,
    toggle,
  };
}
