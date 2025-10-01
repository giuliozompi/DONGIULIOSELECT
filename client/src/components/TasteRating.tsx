import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { hapticFeedback } from '@/lib/telegram';

interface TasteRatingProps {
  stats: {
    tasty: number;
    very_tasty: number;
    super: number;
  };
  userRating?: 'tasty' | 'very_tasty' | 'super' | null;
  onRate?: (rating: 'tasty' | 'very_tasty' | 'super') => void;
}

export default function TasteRating({ stats, userRating: initialRating, onRate }: TasteRatingProps) {
  const [selectedRating, setSelectedRating] = useState<'tasty' | 'very_tasty' | 'super' | null>(
    initialRating || null
  );

  const handleRate = (rating: 'tasty' | 'very_tasty' | 'super') => {
    hapticFeedback('light');
    setSelectedRating(rating);
    onRate?.(rating);
    console.log('Rated as:', rating);
  };

  const total = stats.tasty + stats.very_tasty + stats.super;
  const superPercent = total > 0 ? Math.round((stats.super / total) * 100) : 0;

  return (
    <div className="space-y-3" data-testid="section-taste-rating">
      <div className="flex gap-2 flex-wrap">
        <Badge
          variant={selectedRating === 'tasty' ? 'default' : 'outline'}
          className="cursor-pointer hover-elevate active-elevate-2 px-4 py-2"
          onClick={() => handleRate('tasty')}
          data-testid="button-rate-tasty"
        >
          Вкусное
        </Badge>
        <Badge
          variant={selectedRating === 'very_tasty' ? 'default' : 'outline'}
          className="cursor-pointer hover-elevate active-elevate-2 px-4 py-2"
          onClick={() => handleRate('very_tasty')}
          data-testid="button-rate-very-tasty"
        >
          Очень вкусное
        </Badge>
        <Badge
          variant={selectedRating === 'super' ? 'default' : 'outline'}
          className="cursor-pointer hover-elevate active-elevate-2 px-4 py-2"
          onClick={() => handleRate('super')}
          data-testid="button-rate-super"
        >
          Вообще супер
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground" data-testid="text-stats">
        {superPercent}% покупателей оценили как "Вообще супер"
      </p>
    </div>
  );
}
