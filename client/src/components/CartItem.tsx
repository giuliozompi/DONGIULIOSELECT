import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface CartItemProps {
  id: string;
  name: string;
  image: string;
  price: number;
  unit: string;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

export default function CartItem({
  id,
  name,
  image,
  price,
  unit,
  quantity,
  onQuantityChange,
  onRemove,
}: CartItemProps) {
  const isWeightBased = unit === 'кг';
  const step = isWeightBased ? 0.1 : 1;
  const minQty = isWeightBased ? 0.2 : 1; // Minimo 200g per prodotti a peso

  const formatQuantity = (qty: number) => {
    if (unit === 'кг') {
      const roundedQty = Math.round(qty * 10) / 10; // Arrotonda a 1 decimale
      return roundedQty < 1 ? `${Math.round(roundedQty * 1000)}г` : `${roundedQty}кг`;
    }
    return `${qty} ${unit}`;
  };

  const handleDecrease = () => {
    const newQty = Number((Math.max(minQty, quantity - step)).toFixed(1));
    if (newQty !== quantity) {
      onQuantityChange(newQty);
    }
  };

  const handleIncrease = () => {
    const newQty = Number((quantity + step).toFixed(1));
    onQuantityChange(newQty);
  };

  return (
    <Card className="p-4" data-testid={`cart-item-${id}`}>
      <div className="flex gap-4">
        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
          <img src={image} alt={name} className="w-full h-full object-cover" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-sm font-medium line-clamp-2" data-testid="text-name">
              {name}
            </h4>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 flex-shrink-0"
              onClick={onRemove}
              data-testid="button-remove"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full"
                onClick={handleDecrease}
                data-testid="button-decrease"
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="text-sm font-medium min-w-[3rem] text-center" data-testid="text-quantity">
                {formatQuantity(quantity)}
              </span>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full"
                onClick={handleIncrease}
                data-testid="button-increase"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            
            <p className="text-base font-bold" data-testid="text-total">
              {Math.round(price * quantity)} ₽
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
