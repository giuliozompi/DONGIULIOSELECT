import { Card } from '@/components/ui/card';
import type { Category } from '@shared/schema';
import { getAbsoluteImageUrl } from '@/lib/imageUtils';

interface CategoryCardProps {
  category: Category;
  productCount: number;
  onClick: () => void;
}

export default function CategoryCard({ category, productCount, onClick }: CategoryCardProps) {
  // Fallback images for categories without uploaded images
  const categoryImages: Record<string, string> = {
    'syry': 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=300&fit=crop',
    'myasnye-delikatesy': 'https://images.unsplash.com/photo-1542843137-8791a6904d14?w=400&h=300&fit=crop',
    'bakaleya': 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=300&fit=crop',
    'deserty': 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&h=300&fit=crop',
  };

  // Use uploaded image first (convert to absolute URL), then fallback to mapping, then default
  const uploadedImage = getAbsoluteImageUrl(category.image);
  const image = uploadedImage || categoryImages[category.slug] || 'https://images.unsplash.com/photo-1484980972926-edee96e0960d?w=400&h=300&fit=crop';

  return (
    <Card
      className="overflow-hidden cursor-pointer hover-elevate active-elevate-2"
      onClick={onClick}
      data-testid={`card-category-${category.id}`}
    >
      <div className="relative h-32">
        <img
          src={image}
          alt={category.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-white font-semibold text-base" data-testid={`text-category-name-${category.id}`}>
            {category.name}
          </h3>
          {productCount > 0 && (
            <p className="text-white/80 text-xs" data-testid={`text-category-count-${category.id}`}>
              {productCount} {productCount === 1 ? 'продукт' : productCount < 5 ? 'продукта' : 'продуктов'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
