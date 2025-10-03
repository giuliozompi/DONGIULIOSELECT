import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import FortuneWheel from '@/components/FortuneWheel';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gift, ArrowLeft } from 'lucide-react';
import type { Prize } from '@shared/schema';

interface FortuneData {
  spinTokens: number;
  prizes: Prize[];
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
      toast({
        title: 'Приз получен!',
        description: data.prize.name,
      });
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
    return {
      id: result.prize.id,
      name: result.prize.name,
      type: result.prize.type,
      value: result.prize.value,
    };
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  const prizes = fortuneData?.prizes || [];
  const spinTokens = fortuneData?.spinTokens || 0;

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
