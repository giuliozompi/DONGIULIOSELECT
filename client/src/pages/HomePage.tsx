import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import CategoryCard from '@/components/CategoryCard';
import type { Category, Product } from '@shared/schema';

export default function HomePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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

  const setupAdminMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/setup-admin');
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Admin Setup Completato!',
        description: `User ID ${data.userId} è ora amministratore`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: '❌ Errore Setup Admin',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="p-4">
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
          
          {/* TEMPORARY SETUP BUTTON - REMOVE AFTER USE */}
          <Button
            onClick={() => setupAdminMutation.mutate()}
            disabled={setupAdminMutation.isPending}
            className="w-full mt-3 bg-orange-500 hover:bg-orange-600"
            data-testid="button-setup-admin"
          >
            <Shield className="w-4 h-4 mr-2" />
            {setupAdminMutation.isPending ? 'Setup in corso...' : '🔧 SETUP ADMIN (clicca una volta)'}
          </Button>
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
