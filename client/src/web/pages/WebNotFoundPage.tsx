import { useLocation } from 'wouter';
import { Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WebNotFoundPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-8xl font-bold text-neutral-200 mb-4">404</div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Страница не найдена</h1>
      <p className="text-neutral-500 mb-8 max-w-sm">
        Страница, которую вы ищете, не существует или была перемещена.
      </p>
      <div className="flex gap-3">
        <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setLocation('/web')}>
          <Home className="w-4 h-4 mr-2" /> На главную
        </Button>
        <Button variant="outline" onClick={() => setLocation('/web/catalog')}>
          <Search className="w-4 h-4 mr-2" /> В каталог
        </Button>
      </div>
    </div>
  );
}
