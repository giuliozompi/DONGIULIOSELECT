import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProductCardProps {
  id: string;
  name: string;
  category: string;
  price: number;
  priceOld?: number;
  unit: string;
  image: string;
  onClick?: () => void;
}

export default function ProductCard({
  name,
  category,
  price,
  priceOld,
  unit,
  image,
  onClick,
}: ProductCardProps) {
  return (
    <Card
      className="overflow-hidden cursor-pointer hover-elevate active-elevate-2"
      onClick={onClick}
      data-testid={`card-product-${name}`}
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover"
          data-testid={`img-product-${name}`}
        />
        {priceOld && (
          <Badge className="absolute top-2 right-2 bg-destructive text-destructive-foreground">
            Скидка
          </Badge>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs text-muted-foreground mb-1" data-testid="text-category">
          {category}
        </p>
        <h3 className="text-sm font-medium line-clamp-2 mb-2 min-h-[2.5rem]" data-testid="text-name">
          {name}
        </h3>
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-bold" data-testid="text-price">
            {price} ₽
          </p>
          {priceOld && (
            <p className="text-sm text-muted-foreground line-through" data-testid="text-price-old">
              {priceOld} ₽
            </p>
          )}
          <p className="text-xs text-muted-foreground">/ {unit}</p>
        </div>
      </div>
    </Card>
  );
}
