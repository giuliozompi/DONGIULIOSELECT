import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from './lib/adminApi';
import { useWebAuth } from '../hooks/useWebAuth';
import {
  LayoutDashboard, Tag, Package, ShoppingCart, Users,
  FileText, Settings, LogOut, Menu, Shield, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const NAV = [
  { path: '/web/admin', label: 'Дашборд', icon: LayoutDashboard, exact: true },
  { path: '/web/admin/categories', label: 'Категории', icon: Tag },
  { path: '/web/admin/products', label: 'Товары', icon: Package },
  { path: '/web/admin/orders', label: 'Заказы', icon: ShoppingCart },
  { path: '/web/admin/clients', label: 'Клиенты', icon: Users },
  { path: '/web/admin/logs', label: 'Логи', icon: FileText },
  { path: '/web/admin/settings', label: 'Настройки', icon: Settings },
];

function NavItem({ item, active, onClick }: { item: typeof NAV[0]; active: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.path}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
      {active && <ChevronRight className="h-3 w-3 ml-auto" />}
    </Link>
  );
}

function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useWebAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Неверные учётные данные');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-sm px-4">
        <div className="bg-card border rounded-lg p-8 space-y-6">
          <div className="text-center space-y-2">
            <Shield className="h-10 w-10 text-primary mx-auto" />
            <h1 className="text-xl font-semibold">Don Giulio Admin</h1>
            <p className="text-sm text-muted-foreground">Войдите в панель управления</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                autoComplete="email"
                data-testid="input-admin-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Пароль</Label>
              <div className="relative">
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="pr-10"
                  data-testid="input-admin-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading} data-testid="button-admin-login">
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>
          <div className="text-center">
            <Link href="/web" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
              На сайт
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WebAdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout } = useWebAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: checkData, isLoading, isError, refetch } = useQuery({
    queryKey: ['/web-api/admin/check'],
    queryFn: () => adminApi.check(),
    retry: false,
  });

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (isError || !checkData?.ok) {
    return (
      <AdminLoginForm onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['/web-api/admin/check'] });
        refetch();
      }} />
    );
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <Shield className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold text-sm">Don Giulio Admin</p>
          {checkData.isMasterAdmin && (
            <p className="text-xs text-muted-foreground">Master Admin</p>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {NAV.map(item => {
          const active = item.exact ? location === item.path : location.startsWith(item.path);
          return (
            <NavItem key={item.path} item={item} active={active} onClick={() => setSidebarOpen(false)} />
          );
        })}
      </nav>
      <div className="p-3 border-t">
        <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Выйти
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="hidden md:flex flex-col w-56 border-r bg-card shrink-0">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-card border-r flex flex-col z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            {NAV.map(item => {
              const active = item.exact ? location === item.path : location.startsWith(item.path);
              if (!active) return null;
              const Icon = item.icon;
              return (
                <div key={item.path} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{item.label}</span>
                </div>
              );
            })}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
