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

export function useWebWishlist(productId?: string) {
  const { user, isAuthenticated } = useWebAuth();
  const client = useQueryClient();
  const { toast } = useToast();
  // Never reuse a previous customer's selected products after an account switch.
  const queryKey = ['/web-api/wishlist', user?.id];
  const mutationKey = ['web-wishlist-toggle', user?.id];
  const query = useQuery({
    queryKey,
    queryFn: () => webApi.get<WishlistItem[]>('/wishlist'),
    enabled: isAuthenticated && !!user?.id,
    staleTime: 0,
    retry: false,
  });
  const pending = useIsMutating({
    mutationKey,
    predicate: mutation => productId === undefined || mutation.state.variables === productId,
  }) > 0;
  const mutation = useMutation({
    mutationKey,
    mutationFn: (id: string) => webApi.post<{ inWishlist: boolean }>(`/wishlist/${encodeURIComponent(id)}`),
    // This API toggles rather than sets membership: retrying a POST could undo it.
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
      .some(entry => entry.state.variables === id);
    if (!alreadyPending) mutation.mutate(id);
  };

  return {
    ...query,
    items: isAuthenticated ? (query.data ?? []) : [],
    isFavorite: isAuthenticated && (query.data ?? []).some(item => item.productId === productId),
    isToggling: pending,
    toggle,
  };
}
