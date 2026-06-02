import { useEffect, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initTelegramApp, getTelegramStartParam } from '@/lib/telegram';
import { TelegramThemeProvider } from '@/components/TelegramThemeProvider';

const WebApp = lazy(() => import('./web/WebApp'));

class WebAppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message ?? 'Errore sconosciuto' };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WebApp] render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
          <div className="text-center space-y-3 max-w-sm">
            <div className="w-12 h-12 rounded-full bg-amber-100 mx-auto flex items-center justify-center">
              <span className="text-amber-700 text-xl font-bold">!</span>
            </div>
            <h1 className="text-lg font-semibold text-neutral-800">Qualcosa è andato storto</h1>
            <p className="text-sm text-neutral-500">{this.state.message}</p>
            <button
              className="mt-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-md"
              onClick={() => window.location.reload()}
            >
              Ricarica la pagina
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import BottomNav from '@/components/BottomNav';
import HomePage from '@/pages/HomePage';
import CategoryPage from '@/pages/CategoryPage';
import SearchPage from '@/pages/SearchPage';
import ProductDetailPage from '@/pages/ProductDetailPage';
import CartPage from '@/pages/CartPage';
import CheckoutPage from '@/pages/CheckoutPage';
import OrderDetailPage from '@/pages/OrderDetailPage';
import MyOrdersPage from '@/pages/MyOrdersPage';
import PaymentReturnPage from '@/pages/PaymentReturnPage';
import FavoritesPage from '@/pages/FavoritesPage';
import ProfilePage from '@/pages/ProfilePage';
import MyDataPage from '@/pages/MyDataPage';
import PurchasedProductsPage from '@/pages/PurchasedProductsPage';
import PrizesHistoryPage from '@/pages/PrizesHistoryPage';
import FortunePage from '@/pages/FortunePage';
import AssistantPage from '@/pages/AssistantPage';
import AdminPage from '@/pages/AdminPage';
import EditCategoryPage from '@/pages/EditCategoryPage';
import EditProductPage from '@/pages/EditProductPage';
import NewProductPage from '@/pages/NewProductPage';
import LegalPage from '@/pages/LegalPage';
import NotFound from '@/pages/not-found';

function Router() {
  return (
    <div className="pb-16">
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/category/:id" component={CategoryPage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/product/:id" component={ProductDetailPage} />
        <Route path="/cart" component={CartPage} />
        <Route path="/checkout" component={CheckoutPage} />
        <Route path="/order/:id" component={OrderDetailPage} />
        <Route path="/orders" component={MyOrdersPage} />
        <Route path="/payment-return" component={PaymentReturnPage} />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/lk" component={ProfilePage} />
        <Route path="/my-data" component={MyDataPage} />
        <Route path="/purchased-products" component={PurchasedProductsPage} />
        <Route path="/prizes-history" component={PrizesHistoryPage} />
        <Route path="/fortune" component={FortunePage} />
        <Route path="/assistant" component={AssistantPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/categories/:id" component={EditCategoryPage} />
        <Route path="/admin/products/new" component={NewProductPage} />
        <Route path="/admin/products/:id" component={EditProductPage} />
        <Route path="/legal" component={LegalPage} />
        <Route component={NotFound} />
      </Switch>
      <BottomNav />
    </div>
  );
}

function DeepLinkHandler() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Handle deep linking from Telegram Mini App
    const startParam = getTelegramStartParam();
    
    if (startParam) {
      console.log('[Deep Link] Start param:', startParam);
      
      // Handle product deep links (format: product_{slug})
      if (startParam.startsWith('product_')) {
        const productSlug = startParam.substring(8); // Remove 'product_' prefix
        console.log('[Deep Link] Navigating to product:', productSlug);
        setLocation(`/product/${productSlug}`);
        return;
      }
      
      // Navigate based on start parameter
      switch (startParam) {
        case 'cart':
          console.log('[Deep Link] Navigating to cart...');
          setLocation('/cart');
          break;
        case 'fortune':
          console.log('[Deep Link] Navigating to fortune wheel...');
          setLocation('/fortune');
          break;
        default:
          console.log('[Deep Link] Unknown start param:', startParam);
      }
    }
  }, [setLocation]);

  return null;
}

function TelegramApp() {
  useEffect(() => {
    initTelegramApp();
  }, []);

  return (
    <TelegramThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DeepLinkHandler />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </TelegramThemeProvider>
  );
}

export default function App() {
  const isWebPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/web');
  const isInTelegram = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;
  const isWeb = isWebPath || !isInTelegram;

  if (isWeb) {
    return (
      <WebAppErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-neutral-50">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 mx-auto flex items-center justify-center">
                <span className="text-white text-sm font-bold">DG</span>
              </div>
              <p className="text-sm text-neutral-400">Загрузка...</p>
            </div>
          </div>
        }>
          <WebApp />
        </Suspense>
      </WebAppErrorBoundary>
    );
  }

  return <TelegramApp />;
}
