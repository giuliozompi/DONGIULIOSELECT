import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Minus, ShoppingCart, Heart, ArrowLeft, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useWebCart } from '../hooks/useWebCart';
import { webApi } from '../lib/webApi';

interface Product {
  id: string; name: string; slug: string; price: string; priceOld?: string;
  unit: string; images: string[]; inStock: boolean; categoryId: string;
  descriptionShort?: string; descriptionFull?: string;
  nutrition?: { proteins: string; fats: string; carbs: string; calories: string; composition: string[]; additionalInfo: string[] };
  tasteVariations?: string[];
}

const STEP = 0.1;

export default function WebProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const [activeImg, setActiveImg] = useState(0);
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  const { addItem, items, updateQuantity, removeItem } = useWebCart();

  const { data: product, isLoading } = useQuery({
    queryKey: ['/web-api/products', slug],
    queryFn: () => webApi.get<Product>(`/products/${slug}`),
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
          <div className="aspect-square bg-neutral-100 rounded-xl" />
          <div className="space-y-4">
            <div className="h-8 bg-neutral-100 rounded w-3/4" />
            <div className="h-6 bg-neutral-100 rounded w-1/4" />
            <div className="h-20 bg-neutral-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <Package className="w-12 h-12 mx-auto text-neutral-300 mb-3" />
        <p className="font-medium text-neutral-600">Товар не найден</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation('/web/catalog')}>
          Вернуться в каталог
        </Button>
      </div>
    );
  }

  const cartItem = items.find(i => i.productId === product.id);
  const qty = cartItem?.quantity ?? 0;
  const isKg = product.unit === 'кг';
  const step = isKg ? STEP : 1;

  const handleAdd = () => {
    if (!product.inStock) return;
    if (qty === 0) {
      addItem({ productId: product.id, productName: product.name, price: product.price, unit: product.unit, image: product.images[0] }, step);
    } else {
      updateQuantity(product.id, parseFloat((qty + step).toFixed(3)));
    }
  };
  const handleMinus = () => {
    const newQty = parseFloat((qty - step).toFixed(3));
    if (newQty <= 0) removeItem(product.id);
    else updateQuantity(product.id, newQty);
  };

  const price = parseFloat(product.price);
  const priceOld = product.priceOld ? parseFloat(product.priceOld) : null;
  const discountPct = priceOld ? Math.round((1 - price / priceOld) * 100) : null;
  const totalPrice = qty > 0 ? (price * qty).toFixed(2) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-neutral-500 mb-6 flex-wrap">
        <button onClick={() => setLocation('/web')} className="hover:text-neutral-900">Главная</button>
        <ChevronRight className="w-3 h-3" />
        <button onClick={() => setLocation('/web/catalog')} className="hover:text-neutral-900">Каталог</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-neutral-900 truncate max-w-[200px]">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Gallery */}
        <div className="space-y-3">
          <div className="aspect-square rounded-xl overflow-hidden bg-neutral-50 border border-neutral-200">
            {product.images[activeImg] ? (
              <img src={product.images[activeImg]} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-300">
                <ShoppingCart className="w-16 h-16" />
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${i === activeImg ? 'border-amber-600' : 'border-transparent'}`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-4">
          <div>
            {!product.inStock && <Badge variant="secondary" className="mb-2">Нет в наличии</Badge>}
            {discountPct && <Badge className="mb-2 mr-2 bg-red-500 text-white border-0">-{discountPct}%</Badge>}
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 leading-tight">{product.name}</h1>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-neutral-900">{price.toLocaleString('ru-RU')} ₽</span>
            <span className="text-neutral-500 text-sm">/ {product.unit}</span>
            {priceOld && <span className="text-neutral-400 line-through text-base">{priceOld.toLocaleString('ru-RU')} ₽</span>}
          </div>

          {/* Taste variations */}
          {product.tasteVariations && product.tasteVariations.length > 0 && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">Вкус</p>
              <div className="flex flex-wrap gap-2">
                {product.tasteVariations.map(v => (
                  <button
                    key={v}
                    onClick={() => setSelectedVariation(v === selectedVariation ? null : v)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${selectedVariation === v ? 'border-amber-600 bg-amber-50 text-amber-800' : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cart control */}
          <div className="flex items-center gap-3">
            {qty === 0 ? (
              <Button
                size="lg"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={handleAdd}
                disabled={!product.inStock}
                data-testid="button-add-to-cart"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {product.inStock ? 'В корзину' : 'Нет в наличии'}
              </Button>
            ) : (
              <div className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleMinus}><Minus className="w-4 h-4" /></Button>
                  <div className="text-center min-w-[4rem]">
                    <div className="font-semibold text-amber-800">{isKg ? qty.toFixed(3) : qty}</div>
                    <div className="text-xs text-amber-600">{product.unit}</div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleAdd}><Plus className="w-4 h-4" /></Button>
                </div>
                {totalPrice && (
                  <div className="text-right">
                    <div className="font-bold text-neutral-900">{parseFloat(totalPrice).toLocaleString('ru-RU')} ₽</div>
                    <div className="text-xs text-neutral-500">итого</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {product.descriptionShort && (
            <p className="text-sm text-neutral-600 leading-relaxed">{product.descriptionShort}</p>
          )}

          <Separator />

          {/* Nutrition */}
          {product.nutrition && (
            <div>
              <h3 className="font-medium text-sm text-neutral-900 mb-3">Пищевая ценность (на 100г)</h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Белки', value: product.nutrition.proteins },
                  { label: 'Жиры', value: product.nutrition.fats },
                  { label: 'Углеводы', value: product.nutrition.carbs },
                  { label: 'Ккал', value: product.nutrition.calories },
                ].map(n => (
                  <div key={n.label} className="bg-neutral-50 rounded-lg p-2">
                    <p className="text-xs text-neutral-500">{n.label}</p>
                    <p className="font-semibold text-sm text-neutral-900">{n.value}</p>
                  </div>
                ))}
              </div>
              {product.nutrition.composition?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-neutral-700 mb-1">Состав:</p>
                  <p className="text-xs text-neutral-500 leading-relaxed">{product.nutrition.composition.join(', ')}</p>
                </div>
              )}
            </div>
          )}

          {product.descriptionFull && (
            <div>
              <h3 className="font-medium text-sm text-neutral-900 mb-2">Описание</h3>
              <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-line">{product.descriptionFull}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
