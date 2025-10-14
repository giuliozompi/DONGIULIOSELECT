import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CategoryCard from '@/components/CategoryCard';
import ProductCard from '@/components/ProductCard';
import type { Category, Product } from '@shared/schema';

export default function CategoryPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const category = categories.find(c => c.id === id);
  const subcategories = categories.filter(c => c.parentId === id);
  const products = allProducts.filter(p => p.categoryId === id);

  const getCategoryProductCount = (categoryId: string): number => {
    return allProducts.filter(p => p.categoryId === categoryId).length;
  };

  const handleBack = () => {
    if (category?.parentId) {
      setLocation(`/category/${category.parentId}`);
    } else {
      setLocation('/');
    }
  };

  if (!category) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Категория не найдена</p>
      </div>
    );
  }

  const hasSubcategories = subcategories.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold" data-testid="text-category-title">
              {category.name}
            </h1>
          </div>
        </div>
      </div>

      <div className="p-4">
        {hasSubcategories ? (
          <>
            <h2 className="text-lg font-semibold mb-4">Подкатегории</h2>
            <div className="grid grid-cols-2 gap-4">
              {subcategories.map((subcat) => (
                <CategoryCard
                  key={subcat.id}
                  category={subcat}
                  productCount={getCategoryProductCount(subcat.id)}
                  onClick={() => setLocation(`/category/${subcat.id}`)}
                />
              ))}
            </div>
          </>
        ) : products.length > 0 ? (
          <>
            <h2 className="text-lg font-semibold mb-4">Продукты</h2>
            <div className="grid grid-cols-2 gap-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  id={product.id}
                  name={product.name}
                  category={category.name}
                  price={parseFloat(product.price)}
                  priceOld={product.priceOld ? parseFloat(product.priceOld) : undefined}
                  unit={product.unit}
                  image={product.images?.length > 0 ? product.images : ['https://images.unsplash.com/photo-1452195100486-9cc805987862?w=400&h=400&fit=crop']}
                  onClick={() => setLocation(`/product/${product.id}`)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>В этой категории пока нет продуктов</p>
          </div>
        )}
      </div>
    </div>
  );
}
