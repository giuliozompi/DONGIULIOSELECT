import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import CategoryNav from '@/components/CategoryNav';
import ProductCard from '@/components/ProductCard';
import type { Category, Product } from '@shared/schema';

export default function HomePage() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  // Fetch products (filtrati per categoria se selezionata)
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: activeCategory ? ['/api/products', `categoryId=${activeCategory}`] : ['/api/products'],
  });

  // Trasforma categories in formato per CategoryNav
  const topLevelCategories = categories
    .filter(cat => !cat.parentId)
    .map(cat => ({
      id: cat.id,
      name: cat.name,
      count: products.filter(p => p.categoryId === cat.id).length,
    }));

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold" data-testid="text-title">
              Don Giulio Select
            </h1>
          </div>
          
          {categoriesLoading ? (
            <div className="h-10 bg-muted animate-pulse rounded-md" />
          ) : (
            <CategoryNav
              categories={topLevelCategories}
              activeId={activeCategory ?? undefined}
              onCategorySelect={(id) => setActiveCategory(id || null)}
            />
          )}
        </div>
      </div>

      <div className="p-4">
        {productsLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Нет продуктов в этой категории</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                category={categories.find(c => c.id === product.categoryId)?.name || ''}
                price={parseFloat(product.price)}
                priceOld={product.priceOld ? parseFloat(product.priceOld) : undefined}
                unit={product.unit}
                image={product.images[0] || 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop'}
                onClick={() => setLocation(`/product/${product.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
