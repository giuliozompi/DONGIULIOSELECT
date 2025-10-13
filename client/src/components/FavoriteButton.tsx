import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { hapticFeedback } from '@/lib/telegram';

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
        isFavorite={isFavorite} 
        isAnimating={isAnimating}
      />
    </button>
  );
}

interface CheeseIconProps {
  isFavorite: boolean;
  isAnimating: boolean;
}

function CheeseIcon({ isFavorite, isAnimating }: CheeseIconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-300 ${isAnimating ? 'rotate-12' : ''}`}
    >
      {/* Forma del formaggio (triangolo/cuneo) */}
      <path
        d="M3 20L12 4L21 20H3Z"
        fill={isFavorite ? '#FFD700' : 'transparent'}
        stroke={isFavorite ? '#FFA500' : 'currentColor'}
        strokeWidth="2"
        strokeLinejoin="round"
        className="transition-all duration-300"
      />
      
      {/* Buchi del formaggio */}
      <circle
        cx="9"
        cy="14"
        r="1.5"
        fill={isFavorite ? '#FFA500' : 'currentColor'}
        opacity={isFavorite ? '0.6' : '0.4'}
        className="transition-all duration-300"
      />
      <circle
        cx="14"
        cy="12"
        r="1.2"
        fill={isFavorite ? '#FFA500' : 'currentColor'}
        opacity={isFavorite ? '0.6' : '0.4'}
        className="transition-all duration-300"
      />
      <circle
        cx="12"
        cy="16"
        r="1"
        fill={isFavorite ? '#FFA500' : 'currentColor'}
        opacity={isFavorite ? '0.6' : '0.4'}
        className="transition-all duration-300"
      />
    </svg>
  );
}
