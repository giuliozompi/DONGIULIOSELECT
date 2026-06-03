import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from './lib/adminApi';
import { useWebAuth } from '../hooks/useWebAuth';
import {
  LayoutDashboard, Tag, Package, ShoppingCart, Users,
  FileText, Settings, LogOut, Menu, X, Shield, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { path: '/web/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/web/admin/categories', label: 'Categorie', icon: Tag },
  { path: '/web/admin/products', label: 'Prodotti', icon: Package },
  { path: '/web/admin/orders', label: 'Ordini', icon: ShoppingCart },
  { path: '/web/admin/clients', label: 'Clienti', icon: Users },
  { path: '/web/admin/logs', label: 'Log', icon: FileText },
  { path: '/web/admin/settings', label: 'Impostazioni', icon: Settings },
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

export default function WebAdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout } = useWebAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: checkData, isLoading, isError } = useQuery({
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
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (isError || !checkData?.ok) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <Shield className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Accesso negato</h1>
          <p className="text-muted-foreground text-sm">
            Non hai i permessi per accedere al pannello di amministrazione.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" asChild><Link href="/web">Torna al sito</Link></Button>
            <Button onClick={logout}>Esci</Button>
          </div>
        </div>
      </div>
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
          Esci
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r bg-card shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-card border-r flex flex-col z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
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
