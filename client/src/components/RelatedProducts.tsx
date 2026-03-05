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
    <div className="space-y-3" data-testid="section-related">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-6 px-6 scrollbar-hide">
        {products.map((product) => (
          <Card
            key={product.id}
            className="min-w-[45px] w-[45px] flex-shrink-0 overflow-hidden cursor-pointer hover-elevate active-elevate-2"
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
            <div className="p-1">
              <p className="text-[9px] font-medium line-clamp-2 min-h-[1.5rem] mb-0.5 leading-tight">
                {product.name}
              </p>
              <p className="text-[9px] font-bold leading-tight">
                {product.price} ₽
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
