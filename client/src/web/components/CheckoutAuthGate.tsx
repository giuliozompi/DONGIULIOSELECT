import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useWebAuth } from '../hooks/useWebAuth';
import WebAuthModal from './WebAuthModal';

export default function CheckoutAuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useWebAuth();
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'login' | 'register'>('register');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) setOpen(true);
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return <div role="status" className="px-4 py-16 text-center">Проверяем вход в аккаунт…</div>;
  }
  if (isAuthenticated) return <>{children}</>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center" data-testid="checkout-auth-gate">
      <h1 className="text-xl font-semibold mb-3">Продолжить оформление заказа</h1>
      <p className="text-neutral-600 mb-5">
        Зарегистрируйтесь или войдите. Товары останутся в корзине, и вы продолжите оформление заказа.
      </p>
      <div className="flex justify-center flex-wrap gap-3">
        <Button onClick={() => { setTab('register'); setOpen(true); }}
          className="bg-amber-600 text-white" data-testid="button-checkout-register">
          Зарегистрироваться
        </Button>
        <Button variant="outline" onClick={() => { setTab('login'); setOpen(true); }}
          data-testid="button-checkout-login">
          Уже есть аккаунт? Войти
        </Button>
      </div>
      <WebAuthModal open={open} onClose={() => setOpen(false)} defaultTab={tab} />
    </div>
  );
}
