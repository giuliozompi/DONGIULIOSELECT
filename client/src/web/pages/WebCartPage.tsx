import { useLocation } from 'wouter';
import { ShoppingCart, Plus, Minus, Trash2, ArrowRight, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useWebCart } from '../hooks/useWebCart';
import { useWebAuth } from '../hooks/useWebAuth';

export default function WebCartPage() {
  const [, setLocation] = useLocation();
  const { items, subtotal, itemCount, updateQuantity, removeItem, clearCart } = useWebCart();
  const { isAuthenticated } = useWebAuth();

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <ShoppingCart className="w-16 h-16 mx-auto text-neutral-200 mb-4" />
        <h1 className="text-xl font-semibold text-neutral-900 mb-2">Корзина пуста</h1>
        <p className="text-neutral-500 text-sm mb-6">Добавьте товары из каталога, чтобы сделать заказ</p>
        <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setLocation('/web/catalog')}>
          Перейти в каталог
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-neutral-500 mb-6">
        <button onClick={() => setLocation('/web')} className="hover:text-neutral-900">Главная</button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-neutral-900">Корзина</span>
      </nav>

      <h1 className="text-2xl font-bold text-neutral-900 mb-6">
        Корзина <span className="text-neutral-400 font-normal text-lg">({itemCount})</span>
      </h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Items list */}
        <div className="flex-1 space-y-3">
          {items.map(item => {
            const isKg = item.unit === 'кг';
            const step = isKg ? 0.1 : 1;
            const minQty = isKg ? 0.2 : 1;
            const lineTotal = parseFloat(item.price) * item.quantity;

            return (
              <div key={item.productId} className="bg-white rounded-xl border border-neutral-200 p-4 flex gap-4" data-testid={`cart-item-${item.productId}`}>
                {/* Image */}
                <div className="w-20 h-20 rounded-lg bg-neutral-50 border border-neutral-100 overflow-hidden shrink-0">
                  {item.image ? (
                    <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-300">
                      <ShoppingCart className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-neutral-900 leading-tight mb-1 truncate pr-2">
                    {item.productName}
                  </p>
                  <p className="text-xs text-neutral-500 mb-3">
                    {parseFloat(item.price).toLocaleString('ru-RU')} ₽ / {item.unit}
                  </p>

                  <div className="flex items-center justify-between flex-wrap gap-3">
                    {/* Qty control */}
                    <div className="flex items-center gap-2 bg-neutral-50 rounded-lg px-2 py-1 border border-neutral-200">
                      <Button
                        size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => {
                          const newQty = parseFloat((item.quantity - step).toFixed(3));
                          if (newQty < minQty) removeItem(item.productId);
                          else updateQuantity(item.productId, newQty);
                        }}
                        data-testid={`button-decrease-${item.productId}`}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-medium min-w-[3rem] text-center">
                        {isKg ? item.quantity.toFixed(3) : item.quantity} {item.unit}
                      </span>
                      <Button
                        size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => updateQuantity(item.productId, parseFloat((item.quantity + step).toFixed(3)))}
                        data-testid={`button-increase-${item.productId}`}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-neutral-900">
                        {lineTotal.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
                      </span>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-neutral-400 hover:text-red-500"
                        onClick={() => removeItem(item.productId)}
                        data-testid={`button-remove-${item.productId}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-red-500" onClick={clearCart}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Очистить корзину
            </Button>
          </div>
        </div>

        {/* Order summary */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-xl border border-neutral-200 p-5 sticky top-24">
            <h2 className="font-semibold text-neutral-900 mb-4">Итого</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Товары ({itemCount})</span>
                <span>{subtotal.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>Доставка</span>
                <span>рассчитывается</span>
              </div>
            </div>
            <Separator className="my-3" />
            <div className="flex justify-between font-bold text-neutral-900">
              <span>Итого</span>
              <span>{subtotal.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽</span>
            </div>

            <Button
              className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => setLocation(isAuthenticated ? '/web/checkout' : '/web/checkout')}
              data-testid="button-checkout"
            >
              Оформить заказ <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <Button variant="ghost" size="sm" className="w-full mt-2 text-neutral-500" onClick={() => setLocation('/web/catalog')}>
              Продолжить покупки
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
