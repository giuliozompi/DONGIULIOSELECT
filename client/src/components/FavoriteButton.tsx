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

  // Verifica se è preferito
  const { data: favoriteCheck } = useQuery<{ isFavorite: boolean }>({
    queryKey: ['/api/favorites', productId, 'check'],
    queryFn: async () => {
      const response = await fetch(`/api/favorites/${productId}/check`, {
        credentials: 'include',
      });
      return response.json();
    },
  });

  const isFavorite = favoriteCheck?.isFavorite ?? false;

  // Toggle preferito
  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (isFavorite) {
        return apiRequest('DELETE', `/api/favorites/${productId}`);
      } else {
        return apiRequest('POST', `/api/favorites/${productId}`);
      }
    },
    onSuccess: () => {
      // Invalida query check
      queryClient.invalidateQueries({ queryKey: ['/api/favorites', productId, 'check'] });
      // Invalida lista preferiti
      queryClient.invalidateQueries({ queryKey: ['/api/favorites'] });
      
      // Animazione
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
      
      // Haptic feedback
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
