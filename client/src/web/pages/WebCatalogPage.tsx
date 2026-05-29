import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WebProductCard from '../components/WebProductCard';
import { webApi } from '../lib/webApi';
import { useWebMeta } from '../hooks/useWebMeta';

interface Product {
  id: string; name: string; slug: string; price: string; priceOld?: string;
  unit: string; images: string[]; inStock: boolean; categoryId: string; sortPriority: number;
}
interface Category { id: string; name: string; slug: string; parentId?: string; }

export default function WebCatalogPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const [, setLocation] = useLocation();

  const [searchInput, setSearchInput] = useState(params.get('q') || '');
  const [activeCategory, setActiveCategory] = useState(params.get('category') || '');
  const [sortBy, setSortBy] = useState('default');
  const [page, setPage] = useState(1);

  useWebMeta({
    title: searchInput ? `Поиск: ${searchInput}` : 'Каталог товаров',
    description: 'Весь ассортимент итальянских деликатесов Don Giulio Select: сыры, мясные деликатесы, паста, соусы с доставкой по России.',
    type: 'website',
  });

  const { data: categories } = useQuery({
    queryKey: ['/web-api/categories'],
    queryFn: () => webApi.get<Category[]>('/categories'),
  });

  const queryParams = new URLSearchParams();
  if (activeCategory) queryParams.set('category', activeCategory);
  if (searchInput.trim()) queryParams.set('search', searchInput.trim());
  queryParams.set('page', String(page));
  queryParams.set('limit', '24');

  const { data, isLoading } = useQuery({
    queryKey: ['/web-api/products', activeCategory, searchInput, page],
    queryFn: () => webApi.get<{ products: Product[]; pagination: any }>(`/products?${queryParams}`),
  });

  const rootCategories = categories?.filter(c => !c.parentId) ?? [];

  let products = data?.products ?? [];
  if (sortBy === 'price-asc') products = [...products].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  if (sortBy === 'price-desc') products = [...products].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  if (sortBy === 'name') products = [...products].sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); };
  const clearSearch = () => { setSearchInput(''); setPage(1); };
  const selectCategory = (id: string) => { setActiveCategory(id === activeCategory ? '' : id); setPage(1); };

  const selectedCategoryName = rootCategories.find(c => c.id === activeCategory)?.name;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-neutral-500 mb-6">
        <button onClick={() => setLocation('/web')} className="hover:text-neutral-900">Главная</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-neutral-900">Каталог</span>
        {selectedCategoryName && (
          <><ChevronRight className="w-3 h-3" /><span className="text-neutral-900">{selectedCategoryName}</span></>
        )}
      </nav>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar filters */}
        <aside className="w-full lg:w-56 shrink-0">
          <div className="sticky top-24">
            <h2 className="font-semibold text-sm text-neutral-900 mb-3">Категории</h2>
            <div className="space-y-1">
              <button
                onClick={() => selectCategory('')}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${!activeCategory ? 'bg-amber-50 text-amber-800 font-medium' : 'text-neutral-600 hover:bg-neutral-50'}`}
              >
                Все товары
              </button>
              {rootCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.id)}
                  className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${activeCategory === cat.id ? 'bg-amber-50 text-amber-800 font-medium' : 'text-neutral-600 hover:bg-neutral-50'}`}
                  data-testid={`filter-category-${cat.id}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Search + sort bar */}
          <div className="flex flex-wrap gap-3 mb-6">
            <form onSubmit={handleSearch} className="flex-1 min-w-48 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <Input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Поиск товаров..."
                  className="pl-9 pr-8"
                  data-testid="input-catalog-search"
                />
                {searchInput && (
                  <button type="button" onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button type="submit" variant="outline" size="icon">
                <Search className="w-4 h-4" />
              </Button>
            </form>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44" data-testid="select-sort">
                <SlidersHorizontal className="w-4 h-4 mr-2 text-neutral-400" />
                <SelectValue placeholder="Сортировка" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">По умолчанию</SelectItem>
                <SelectItem value="price-asc">Цена: по возрастанию</SelectItem>
                <SelectItem value="price-desc">Цена: по убыванию</SelectItem>
                <SelectItem value="name">По названию</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active filters */}
          {(activeCategory || searchInput) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCategoryName && (
                <Badge variant="secondary" className="gap-1">
                  {selectedCategoryName}
                  <button onClick={() => selectCategory('')}><X className="w-3 h-3" /></button>
                </Badge>
              )}
              {searchInput && (
                <Badge variant="secondary" className="gap-1">
                  «{searchInput}»
                  <button onClick={clearSearch}><X className="w-3 h-3" /></button>
                </Badge>
              )}
            </div>
          )}

          {/* Results count */}
          {!isLoading && (
            <p className="text-sm text-neutral-500 mb-4">
              {products.length > 0 ? `Найдено товаров: ${data?.pagination?.total ?? products.length}` : 'Товары не найдены'}
            </p>
          )}

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-neutral-100 animate-pulse aspect-[3/4]" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {products.map(p => <WebProductCard key={p.id} product={p} />)}
              </div>
              {/* Pagination */}
              {data?.pagination && data.pagination.pages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Назад</Button>
                  <span className="flex items-center text-sm text-neutral-600">
                    {page} / {data.pagination.pages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= data.pagination.pages} onClick={() => setPage(p => p + 1)}>Вперёд</Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-neutral-500">
              <Search className="w-10 h-10 mx-auto mb-3 text-neutral-300" />
              <p className="font-medium">Ничего не найдено</p>
              <p className="text-sm mt-1">Попробуйте изменить фильтры или запрос</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
