import { useState } from 'react';
import { useLocation } from 'wouter';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import FortuneWheel from '@/components/FortuneWheel';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gift, ArrowLeft } from 'lucide-react';

//todo: remove mock functionality
const mockPrizes = [
  { id: '1', name: 'Скидка 10%', type: 'discount' as const, value: '10', claimed: false },
  { id: '2', name: 'Бесплатная доставка', type: 'delivery_coupon' as const, value: '1', claimed: true },
];

export default function FortunePage() {
  const [, setLocation] = useLocation();
  const [spinTokens, setSpinTokens] = useState(3);
  const [prizes, setPrizes] = useState(mockPrizes);

  useTelegramBackButton(() => setLocation('/'), true);

  const handleSpin = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    setSpinTokens((prev) => prev - 1);
    
    const wonPrize = {
      id: Date.now().toString(),
      name: 'Скидка 15% на следующий заказ',
      type: 'discount' as const,
      value: '15',
    };

    const newPrize = { ...wonPrize, claimed: false };
    setPrizes((prev) => [...prev, newPrize]);

    return wonPrize;
  };

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="sticky top-0 z-50 bg-background border-b p-4">
        <div className="flex items-center gap-3">
          <Button 
            size="icon" 
            variant="ghost"
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-title">
            Колесо Фортуны
          </h1>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <FortuneWheel spinTokens={spinTokens} onSpin={handleSpin} />

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Ваши призы</h3>
          {prizes.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground">У вас пока нет призов</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {prizes.map((prize) => (
                <Card
                  key={prize.id}
                  className={`p-4 ${prize.claimed ? 'opacity-50' : ''}`}
                  data-testid={`card-prize-${prize.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Gift className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{prize.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {prize.type === 'discount' && 'Скидка'}
                          {prize.type === 'delivery_coupon' && 'Купон'}
                        </Badge>
                        {prize.claimed && (
                          <Badge variant="outline" className="text-xs">
                            Использован
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
