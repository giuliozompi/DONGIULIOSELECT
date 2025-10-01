import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gift, Sparkles } from 'lucide-react';

interface Prize {
  id: string;
  name: string;
  type: 'discount' | 'product_gift' | 'delivery_coupon' | 'stars_bonus';
  value: string;
}

interface FortuneWheelProps {
  spinTokens: number;
  onSpin: () => Promise<Prize>;
}

export default function FortuneWheel({ spinTokens, onSpin }: FortuneWheelProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<Prize | null>(null);

  const handleSpin = async () => {
    if (spinTokens <= 0 || isSpinning) return;

    setIsSpinning(true);
    setWonPrize(null);

    try {
      const prize = await onSpin();
      
      setTimeout(() => {
        setWonPrize(prize);
        setIsSpinning(false);
      }, 2000);
    } catch (error) {
      console.error('Spin failed:', error);
      setIsSpinning(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="section-fortune-wheel">
      <Card className="p-8">
        <div className="flex flex-col items-center space-y-6">
          <div className="relative w-64 h-64 rounded-full bg-gradient-to-br from-primary via-accent to-secondary flex items-center justify-center">
            <div
              className={`w-56 h-56 rounded-full bg-card flex items-center justify-center transition-transform duration-2000 ${
                isSpinning ? 'animate-spin' : ''
              }`}
            >
              <Gift className="w-20 h-20 text-primary" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <p className="text-lg font-semibold" data-testid="text-tokens">
                У вас {spinTokens} {spinTokens === 1 ? 'попытка' : 'попытки'}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Крутите колесо и выигрывайте призы
            </p>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleSpin}
            disabled={spinTokens <= 0 || isSpinning}
            data-testid="button-spin"
          >
            {isSpinning ? 'Вращается...' : 'Крутить колесо'}
          </Button>
        </div>
      </Card>

      {wonPrize && (
        <Card className="p-6 bg-primary/5 border-primary" data-testid="card-prize-won">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Gift className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-1">Поздравляем!</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Вы выиграли: {wonPrize.name}
              </p>
              <Badge variant="secondary" data-testid="badge-prize-type">
                {wonPrize.type === 'discount' && 'Скидка'}
                {wonPrize.type === 'product_gift' && 'Подарок'}
                {wonPrize.type === 'delivery_coupon' && 'Купон на доставку'}
                {wonPrize.type === 'stars_bonus' && 'Бонус Stars'}
              </Badge>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
