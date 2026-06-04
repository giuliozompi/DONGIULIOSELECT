import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ShoppingCart, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebCart } from '../hooks/useWebCart';

interface Product {
  id: string;
  name: string;
  slug: string;
  price: string;
  priceOld?: string;
  unit: string;
  images: string[];
  inStock: boolean;
  descriptionShort?: string;
}

interface Props {
  product: Product;
}

const STEP = 0.1;

export default function WebProductCard({ product }: Props) {
  const [, setLocation] = useLocation();
  const { addItem, items, updateQuantity, removeItem } = useWebCart();
  const [activeImg, setActiveImg] = useState(0);
  const [imgError, setImgError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const images = product.images?.filter(Boolean) ?? [];
  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (!hasMultiple) return;
    intervalRef.current = setInterval(() => {
      setActiveImg(i => (i + 1) % images.length);
    }, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasMultiple, images.length]);

  const cartItem = items.find(i => i.productId === product.id);
  const qty = cartItem?.quantity ?? 0;
  const isKg = product.unit === 'кг' || product.unit === 'г';
  const step = isKg ? STEP : 1;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.inStock) return;
    if (qty === 0) {
      addItem({
        productId: product.id,
        productName: product.name,
        price: product.price,
        unit: product.unit,
        image: images[0],
      }, step);
    } else {
      updateQuantity(product.id, parseFloat((qty + step).toFixed(3)));
    }
  };

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newQty = parseFloat((qty - step).toFixed(3));
    if (newQty <= 0) removeItem(product.id);
    else updateQuantity(product.id, newQty);
  };

  const price = parseFloat(product.price);
  const priceOld = product.priceOld ? parseFloat(product.priceOld) : null;
  const discountPct = priceOld ? Math.round((1 - price / priceOld) * 100) : null;

  const currentImage = !imgError && images[activeImg] ? images[activeImg] : null;

  return (
    <div
      className="group relative bg-white rounded-xl border border-neutral-200 overflow-hidden cursor-pointer hover-elevate flex flex-col"
      onClick={() => setLocation(`/web/product/${product.slug}`)}
      data-testid={`card-product-${product.id}`}
    >
      {/* Image */}
      <div className="relative aspect-square bg-neutral-50 overflow-hidden">
        {currentImage ? (
          <img
            src={currentImage}
            alt={product.name}
            className="w-full h-full object-cover transition-all duration-700"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300">
            <ShoppingCart className="w-8 h-8" />
          </div>
        )}

        {discountPct && (
          <Badge className="absolute top-2 left-2 bg-red-500 text-white border-0 text-xs">
            -{discountPct}%
          </Badge>
        )}

        {!product.inStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Badge variant="secondary">Нет в наличии</Badge>
          </div>
        )}

        {/* Dot indicators */}
        {hasMultiple && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <span
                key={i}
                className={`block rounded-full transition-all duration-300 ${
                  i === activeImg
                    ? 'w-4 h-1.5 bg-white'
                    : 'w-1.5 h-1.5 bg-white/60'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1 gap-2">
        <p className="text-sm font-medium text-neutral-900 leading-tight line-clamp-2">{product.name}</p>

        <div className="mt-auto flex items-end justify-between gap-2">
          <div>
            <span className="font-semibold text-neutral-900 text-sm">
              {price.toLocaleString('ru-RU')} ₽
            </span>
            <span className="text-xs text-neutral-400">/{product.unit}</span>
            {priceOld && (
              <div className="text-xs text-neutral-400 line-through">
                {priceOld.toLocaleString('ru-RU')} ₽
              </div>
            )}
          </div>

          {/* Cart control */}
          <div onClick={e => e.stopPropagation()}>
            {qty === 0 ? (
              <Button
                size="icon"
                className="h-8 w-8 bg-amber-600 hover:bg-amber-700 text-white rounded-full"
                onClick={handleAdd}
                disabled={!product.inStock}
                data-testid={`button-add-cart-${product.id}`}
              >
                <Plus className="w-4 h-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 bg-amber-50 rounded-full px-1.5 py-0.5 border border-amber-200">
                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={handleMinus}>
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="text-xs font-medium min-w-[2rem] text-center text-amber-800">
                  {isKg ? qty.toFixed(3) : qty} {product.unit}
                </span>
                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={handleAdd}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
