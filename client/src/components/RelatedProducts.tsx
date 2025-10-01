import { Card } from '@/components/ui/card';

interface RelatedProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  image: string;
}

interface RelatedProductsProps {
  title: string;
  products: RelatedProduct[];
  onProductClick?: (id: string) => void;
}

export default function RelatedProducts({ title, products, onProductClick }: RelatedProductsProps) {
  return (
    <div className="space-y-4" data-testid="section-related">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 scrollbar-hide">
        {products.map((product) => (
          <Card
            key={product.id}
            className="min-w-[160px] flex-shrink-0 overflow-hidden cursor-pointer hover-elevate active-elevate-2"
            onClick={() => onProductClick?.(product.id)}
            data-testid={`card-related-${product.id}`}
          >
            <div className="aspect-square bg-muted">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3">
              <p className="text-sm font-medium line-clamp-2 min-h-[2.5rem] mb-1">
                {product.name}
              </p>
              <p className="text-sm font-bold">
                {product.price} ₽ <span className="text-xs font-normal text-muted-foreground">/ {product.unit}</span>
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
