import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Star, Truck, Shield, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import WebProductCard from '../components/WebProductCard';
import { webApi } from '../lib/webApi';
import { useWebMeta } from '../hooks/useWebMeta';
import { OrganizationJsonLd } from '../components/WebJsonLd';

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string;
  priceOld?: string;
  unit: string;
  images: string[];
  categoryId: string;
  inStock: boolean;
  descriptionShort?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  image?: string;
  parentId?: string;
}

export default function WebHomePage() {
  const [, setLocation] = useLocation();

  useWebMeta({
    title: undefined,
    description: 'Don Giulio Select — магазин премиальных итальянских деликатесов с доставкой по всей России. Сыры, мясные деликатесы, паста, трюфель и многое другое.',
    type: 'website',
  });

  const { data: productsData } = useQuery({
    queryKey: ['/web-api/products', { limit: 8 }],
    queryFn: () => webApi.get<{ products: Product[] }>('/products?limit=8'),
  });

  const { data: categories } = useQuery({
    queryKey: ['/web-api/categories'],
    queryFn: () => webApi.get<Category[]>('/categories'),
  });

  const featured = productsData?.products?.slice(0, 8) ?? [];
  const rootCategories = categories?.filter(c => !c.parentId) ?? [];

  return (
    <div className="min-h-screen">
      <OrganizationJsonLd />
      {/* HERO */}
      <section className="relative overflow-hidden bg-neutral-900 text-white">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1452195100486-9cc805987862?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-900/90 via-neutral-900/60 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="max-w-xl">
            <Badge className="mb-4 bg-amber-700/20 text-amber-400 border-amber-700/30 hover:bg-amber-700/20">
              Премиальные деликатесы
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
              Вкус Италии<br />
              <span className="text-amber-400">у вас дома</span>
            </h1>
            <p className="text-neutral-300 text-base sm:text-lg mb-8 leading-relaxed">
              Отборные итальянские сыры, колбасы и деликатесы с доставкой по всей России. Прямые поставки от проверенных производителей.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setLocation('/web/catalog')}
                data-testid="button-hero-catalog"
              >
                Перейти в каталог <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white bg-white/10 backdrop-blur-sm hover:bg-white/20"
                onClick={() => setLocation('/web/about')}
              >
                О нас
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-amber-50 border-y border-amber-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { icon: Truck, title: 'Быстрая доставка', text: 'Курьер или СДЭК по всей России' },
              { icon: Shield, title: 'Гарантия качества', text: 'Сертифицированные продукты' },
              { icon: Star, title: 'Оригинальные вкусы', text: 'Прямые поставки из Италии' },
              { icon: Clock, title: 'Свежесть', text: 'Контроль условий хранения' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-medium text-sm text-neutral-900">{title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      {rootCategories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Категории</h2>
            <Button variant="ghost" size="sm" onClick={() => setLocation('/web/catalog')}>
              Все <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {rootCategories.slice(0, 8).map(cat => (
              <button
                key={cat.id}
                onClick={() => setLocation(`/web/catalog?category=${cat.id}`)}
                className="group relative overflow-hidden rounded-xl aspect-square bg-neutral-100 hover-elevate cursor-pointer"
                data-testid={`card-category-${cat.id}`}
              >
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-100 to-amber-200" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-medium text-sm leading-tight">{cat.name}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* FEATURED PRODUCTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Популярные товары</h2>
          <Button variant="ghost" size="sm" onClick={() => setLocation('/web/catalog')}>
            Все товары <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
        {featured.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {featured.map(product => (
              <WebProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-neutral-100 animate-pulse aspect-[3/4]" />
            ))}
          </div>
        )}
      </section>

      {/* CTA BANNER */}
      <section className="bg-neutral-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Попробуйте Don Giulio Select</h2>
          <p className="text-neutral-400 mb-6 text-sm sm:text-base max-w-md mx-auto">
            Зарегистрируйтесь и получайте персональные рекомендации, отслеживайте заказы и сохраняйте любимые товары
          </p>
          <Button
            size="lg"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() => setLocation('/web/catalog')}
          >
            Начать покупки
          </Button>
        </div>
      </section>
    </div>
  );
}
