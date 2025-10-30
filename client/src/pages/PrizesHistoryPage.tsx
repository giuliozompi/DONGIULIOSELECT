import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTelegramBackButton } from '@/hooks/useTelegramBackButton';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Gift, Package, Percent, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

type PrizeWithProducts = {
  id: string;
  userId: string;
  name: string;
  type: string;
  value: string;
  productIds: string[] | null;
  claimed: boolean;
  claimedAt: Date | null;
  orderId: string | null;
  adminUsedBy: string | null;
  createdAt: Date;
  products: Array<{
    id: string;
    name: string;
    price: string;
    images: string[];
  }>;
};

export default function PrizesHistoryPage() {
  const [, setLocation] = useLocation();
  
  useTelegramBackButton(() => {
    setLocation('/lk');
  });

  const { data: prizes = [], isLoading } = useQuery<PrizeWithProducts[]>({
    queryKey: ['/api/prizes'],
  });

  const getPrizeIcon = (type: string) => {
    switch (type) {
      case 'gift':
        return <Gift className="w-5 h-5" />;
      case 'discount':
        return <Percent className="w-5 h-5" />;
      default:
        return <Package className="w-5 h-5" />;
    }
  };

  const getPrizeTypeLabel = (type: string) => {
    switch (type) {
      case 'gift':
        return 'Подарок';
      case 'discount':
        return 'Скидка';
      case 'delivery_coupon':
        return 'Купон на доставку';
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="sticky top-0 z-40 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/profile')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold" data-testid="text-page-title">История призов</h1>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {prizes.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Gift className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">У вас пока нет призов</p>
              <p className="text-sm text-muted-foreground mt-2">
                Крутите колесо фортуны после каждого заказа!
              </p>
            </CardContent>
          </Card>
        ) : (
          prizes.map((prize) => (
            <Card key={prize.id} data-testid={`card-prize-${prize.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {getPrizeIcon(prize.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base" data-testid={`text-prize-name-${prize.id}`}>
                        {prize.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {getPrizeTypeLabel(prize.type)}
                      </CardDescription>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(prize.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    {prize.claimed ? (
                      <Badge variant="secondary" className="gap-1" data-testid={`badge-claimed-${prize.id}`}>
                        <CheckCircle className="w-3 h-3" />
                        Использован
                      </Badge>
                    ) : (
                      <Badge className="gap-1" data-testid={`badge-active-${prize.id}`}>
                        <Clock className="w-3 h-3" />
                        Активен
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {prize.type === 'gift' && prize.products.length > 0 && (
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Подарочные продукты:</p>
                    {prize.products.map((product) => (
                      <div key={product.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                        {product.images[0] && (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{product.price} ₽</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {prize.claimed && prize.claimedAt && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Добавлено в корзину: {format(new Date(prize.claimedAt), 'd MMMM yyyy, HH:mm', { locale: ru })}
                    </p>
                  )}
                  
                  {!prize.claimed && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Свяжитесь с администратором для получения приза
                    </p>
                  )}
                </CardContent>
              )}
              
              {prize.type !== 'gift' && prize.claimed && prize.claimedAt && (
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Использован: {format(new Date(prize.claimedAt), 'd MMMM yyyy, HH:mm', { locale: ru })}
                  </p>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
