import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { ShoppingCart, Search, Heart, User, ChevronDown, Menu, X, LogOut, Package, MapPin } from 'lucide-react';
import { useWebAuth } from '../hooks/useWebAuth';
import { useWebCart } from '../hooks/useWebCart';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import WebAuthModal from './WebAuthModal';

export default function WebHeader() {
  const [location, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');
  const { user, isAuthenticated, logout } = useWebAuth();
  const { itemCount } = useWebCart();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/web/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setShowSearch(false);
    }
  };

  const openLogin = () => { setAuthModalTab('login'); setAuthModalOpen(true); };
  const openRegister = () => { setAuthModalTab('register'); setAuthModalOpen(true); };

  const navLinks = [
    { label: 'Каталог', href: '/web/catalog' },
    { label: 'О нас', href: '/web/about' },
    { label: 'Доставка', href: '/web/delivery' },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-neutral-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <Link href="/web" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center">
                <span className="text-white text-xs font-bold">DG</span>
              </div>
              <span className="font-semibold text-neutral-900 text-sm sm:text-base hidden sm:block tracking-tight">
                Don Giulio Select
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map(l => (
                <Link key={l.href} href={l.href} className={`text-sm font-medium transition-colors hover:text-amber-700 ${
                  location.startsWith(l.href) ? 'text-amber-700' : 'text-neutral-600'
                }`}>
                  {l.label}
                </Link>
              ))}
            </nav>

            {/* Search + Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Search bar (desktop) */}
              <form onSubmit={handleSearch} className={`hidden md:flex items-center transition-all duration-300 ${showSearch ? 'w-56' : 'w-0 overflow-hidden'}`}>
                <Input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="h-8 text-sm"
                  onBlur={() => { if (!searchQuery) setShowSearch(false); }}
                />
              </form>

              <Button size="icon" variant="ghost" onClick={() => setShowSearch(s => !s)} className="hidden md:flex">
                <Search className="w-4 h-4" />
              </Button>

              {isAuthenticated && (
                <Button size="icon" variant="ghost" onClick={() => setLocation('/web/wishlist')}>
                  <Heart className="w-4 h-4" />
                </Button>
              )}

              {/* Cart */}
              <Button size="icon" variant="ghost" className="relative" onClick={() => setLocation('/web/cart')}>
                <ShoppingCart className="w-4 h-4" />
                {itemCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-amber-600 border-0">
                    {itemCount > 99 ? '99+' : itemCount}
                  </Badge>
                )}
              </Button>

              {/* Auth */}
              {isAuthenticated && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user.avatar || undefined} />
                        <AvatarFallback className="bg-amber-100 text-amber-800 text-xs">
                          {user.firstName[0]}{user.lastName?.[0] || ''}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium hidden sm:block max-w-[80px] truncate">{user.firstName}</span>
                      <ChevronDown className="w-3 h-3 text-neutral-400 hidden sm:block" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-neutral-500 truncate">{user.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocation('/web/account/orders')}>
                      <Package className="w-4 h-4 mr-2" /> Мои заказы
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation('/web/account/addresses')}>
                      <MapPin className="w-4 h-4 mr-2" /> Адреса
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation('/web/account')}>
                      <User className="w-4 h-4 mr-2" /> Профиль
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="text-red-600">
                      <LogOut className="w-4 h-4 mr-2" /> Выйти
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="hidden sm:flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={openLogin}>Войти</Button>
                  <Button size="sm" onClick={openRegister} className="bg-amber-700 hover:bg-amber-800 text-white">
                    Регистрация
                  </Button>
                </div>
              )}

              {/* Mobile menu toggle */}
              <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setMobileMenuOpen(o => !o)}>
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-neutral-100 py-3 space-y-1">
              <form onSubmit={handleSearch} className="flex gap-2 mb-3">
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск товаров..."
                  className="h-9 text-sm"
                />
                <Button type="submit" size="sm" variant="outline">
                  <Search className="w-4 h-4" />
                </Button>
              </form>
              {navLinks.map(l => (
                <button
                  key={l.href}
                  onClick={() => { setLocation(l.href); setMobileMenuOpen(false); }}
                  className="block w-full text-left px-2 py-2 text-sm font-medium text-neutral-700 hover:text-amber-700 rounded-md hover-elevate"
                >
                  {l.label}
                </button>
              ))}
              {!isAuthenticated && (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { openLogin(); setMobileMenuOpen(false); }}>Войти</Button>
                  <Button size="sm" className="flex-1 bg-amber-700 text-white" onClick={() => { openRegister(); setMobileMenuOpen(false); }}>Регистрация</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <WebAuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab={authModalTab}
      />
    </>
  );
}
