import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import FortuneWheel from '@/components/FortuneWheel';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gift, ArrowLeft, Percent } from 'lucide-react';
import type { Prize, Bonus } from '@shared/schema';

interface FortuneData {
  spinTokens: number;
  prizes: Prize[];
  bonuses: Bonus[];
  totalBonusAmount: string;
}

export default function FortunePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: fortuneData, isLoading } = useQuery<FortuneData>({
    queryKey: ['/api/fortune'],
  });

  const spinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/fortune/spin', {});
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/fortune'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      
      if (data.result.type === 'bonus') {
        toast({
          title: 'Бонус получен!',
          description: `${data.result.percentage}% на следующий заказ (+${Math.round(parseFloat(data.result.amount))} ₽)`,
        });
      } else {
        toast({
          title: 'Приз получен!',
          description: data.result.name,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useTelegramBackButton(() => setLocation('/'), true);

  const handleSpin = async () => {
    const result = await spinMutation.mutateAsync();
    return result.result; // Ritorna direttamente result che contiene il bonus o prodotto
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  const prizes = fortuneData?.prizes || [];
  const bonuses = fortuneData?.bonuses || [];
  const spinTokens = fortuneData?.spinTokens || 0;
  const totalBonusAmount = parseFloat(fortuneData?.totalBonusAmount || '0');

  const getPrizeTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      discount: 'Скидка',
      delivery_coupon: 'Доставка',
      gift: 'Подарок',
    };
    return labels[type] || type;
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

        {/* Sezione Bonuses */}
        {bonuses.length > 0 && (
          <Card className="p-4 bg-primary/5 border-primary">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Ваши бонусы</h3>
              </div>
              <Badge variant="default" data-testid="badge-bonus-total">
                {Math.round(totalBonusAmount)} ₽
              </Badge>
            </div>
            <div className="space-y-2">
              {bonuses.map((bonus) => (
                <div
                  key={bonus.id}
                  className="flex items-center justify-between p-3 bg-background rounded-lg"
                  data-testid={`bonus-${bonus.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl">🎁</span>
                    </div>
                    <div>
                      <p className="font-medium">{bonus.percentage}% бонус</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(bonus.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-primary">
                    {Math.round(parseFloat(bonus.amount))} ₽
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Бонусы автоматически применяются при оформлении заказа
            </p>
          </Card>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Ваши призы</h3>
            <Badge variant="secondary" data-testid="badge-prizes-count">
              {prizes.filter(p => !p.claimed).length} активных
            </Badge>
          </div>
          
          {prizes.length === 0 ? (
            <Card className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                <Gift className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">У вас пока нет призов</p>
              <p className="text-sm text-muted-foreground mt-1">
                Крутите колесо, чтобы получить призы
              </p>
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
                      <h4 className="font-medium" data-testid="text-prize-name">
                        {prize.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {getPrizeTypeLabel(prize.type)}
                        </Badge>
                        {prize.claimed && (
                          <Badge variant="outline" className="text-xs" data-testid="badge-claimed">
                            Использован
                          </Badge>
                        )}
                      </div>
                      {prize.claimedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Использован {new Date(prize.claimedAt).toLocaleDateString('ru-RU')}
                        </p>
                      )}
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
