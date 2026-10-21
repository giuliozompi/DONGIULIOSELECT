import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { CheeseSliceIcon } from '@/components/CheeseSliceIcon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWebAuth } from '../hooks/useWebAuth';
import { useWebWishlist } from '../hooks/useWebWishlist';
import WebAuthModal from './WebAuthModal';

interface Props {
  productId: string;
  productName: string;
  className?: string;
  testId?: string;
  showLabel?: boolean;
}

export default function WebFavoriteButton({ productId, productName, className, testId, showLabel = false }: Props) {
  const { isAuthenticated, isLoading: authLoading } = useWebAuth();
  const wishlist = useWebWishlist(productId);
  const [authOpen, setAuthOpen] = useState(false);
  const addAfterAuth = useRef(false);
  const busy = wishlist.isToggling || (isAuthenticated && wishlist.isFetching);

  useEffect(() => {
    if (!addAfterAuth.current || !isAuthenticated || wishlist.isPending || wishlist.isFetching || wishlist.isError) return;
    addAfterAuth.current = false;
    setAuthOpen(false);
    // A guest's intention is to ADD, never to remove an existing favourite.
    if (!wishlist.isFavorite) wishlist.toggle(productId);
  }, [isAuthenticated, wishlist.isPending, wishlist.isFetching, wishlist.isError, wishlist.isFavorite, productId, wishlist.toggle]);

  const label = wishlist.isError
    ? 'Повторить загрузку избранного'
    : `${wishlist.isFavorite ? 'Удалить' : 'Добавить'} «${productName}» ${wishlist.isFavorite ? 'из избранного' : 'в избранное'}`;
  const hint = wishlist.isError
    ? 'Повторить загрузку избранного'
    : wishlist.isFavorite ? 'Удалить из избранного' : 'Добавить в избранное';

  return (
    // Dialog portals still bubble React events to the product card. Stop them
    // here as well, so typing or signing in never opens the product underneath.
    <div className={className} onClick={event => event.stopPropagation()}>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={label}
            aria-pressed={wishlist.isFavorite}
            aria-busy={busy}
            disabled={authLoading || busy}
            data-testid={testId ?? `button-favorite-${productId}`}
            className={`relative min-h-11 rounded-full border shadow-sm ${showLabel ? 'gap-2 px-4' : 'h-11 w-11 p-2'} ${
              wishlist.isFavorite ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-amber-200 bg-white/95 text-amber-900'
            } hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-amber-500`}
            onClick={() => {
              if (!isAuthenticated) {
                addAfterAuth.current = true;
                setAuthOpen(true);
              } else if (wishlist.isError) {
                void wishlist.refetch();
              } else {
                wishlist.toggle(productId);
              }
            }}
          >
            <CheeseSliceIcon filled={wishlist.isFavorite} className="!h-6 !w-6 shrink-0" />
            {showLabel && <span>{wishlist.isFavorite ? 'В избранном' : 'В избранное'}</span>}
            {busy && <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin rounded-full bg-white text-amber-700" aria-hidden="true" />}
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top" sideOffset={6}>{hint}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
      {authOpen && (
        <WebAuthModal open onClose={() => {
          setAuthOpen(false);
          if (!useWebAuth.getState().isAuthenticated) addAfterAuth.current = false;
        }} />
      )}
    </div>
  );
}
