import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import CategoryCard from '@/components/CategoryCard';
import type { Category, Product } from '@shared/schema';

export default function HomePage() {
  const [, setLocation] = useLocation();

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const topLevelCategories = categories.filter(cat => !cat.parentId);

  const getCategoryProductCount = (categoryId: string): number => {
    const directProducts = products.filter(p => p.categoryId === categoryId).length;
    const subcategories = categories.filter(c => c.parentId === categoryId);
    const subcategoryProducts = subcategories.reduce((sum, subcat) => 
      sum + products.filter(p => p.categoryId === subcat.id).length, 0
    );
    return directProducts + subcategoryProducts;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4 space-y-4">
          <h1 className="text-2xl font-bold" data-testid="text-title">
            Don Giulio Select
          </h1>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск продуктов с помощью AI..."
              className="pl-9"
              onClick={() => setLocation('/search')}
              readOnly
              data-testid="input-search"
            />
          </div>
        </div>
      </div>

      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">Категории</h2>
        
        {categoriesLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : topLevelCategories.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Категории отсутствуют</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {topLevelCategories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                productCount={getCategoryProductCount(category.id)}
                onClick={() => setLocation(`/category/${category.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
