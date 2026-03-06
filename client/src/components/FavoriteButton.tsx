import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { hapticFeedback } from '@/lib/telegram';
import { CheeseIcon } from '@/components/CheeseIcon';

interface FavoriteButtonProps {
  productId: string;
  className?: string;
}

export function FavoriteButton({ productId, className = '' }: FavoriteButtonProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const { data: favoriteCheck } = useQuery<{ isFavorite: boolean }>({
    queryKey: ['/api/favorites', productId, 'check'],
  });

  const isFavorite = favoriteCheck?.isFavorite ?? false;

  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (isFavorite) {
        return apiRequest('DELETE', `/api/favorites/${productId}`);
      } else {
        return apiRequest('POST', `/api/favorites/${productId}`);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['/api/favorites', productId, 'check'] });
      const previous = queryClient.getQueryData<{ isFavorite: boolean }>(['/api/favorites', productId, 'check']);
      queryClient.setQueryData(['/api/favorites', productId, 'check'], { isFavorite: !isFavorite });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['/api/favorites', productId, 'check'], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/favorites', productId, 'check'] });
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });

      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);

      hapticFeedback(isFavorite ? 'light' : 'success');
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMutation.mutate();
  };

  return (
    <button
      onClick={handleClick}
      disabled={toggleMutation.isPending}
      className={`relative transition-transform ${isAnimating ? 'scale-110' : 'scale-100'} ${className}`}
      data-testid={`button-favorite-${productId}`}
      aria-label={isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
    >
      <CheeseIcon
        filled={isFavorite}
        isAnimating={isAnimating}
      />
    </button>
  );
}
