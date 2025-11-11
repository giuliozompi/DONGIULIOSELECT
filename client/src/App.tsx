import { useEffect } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initTelegramApp, getTelegramStartParam } from '@/lib/telegram';
import { TelegramThemeProvider } from '@/components/TelegramThemeProvider';
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
      
      // Navigate based on start parameter
      switch (startParam) {
        case 'cart':
          console.log('[Deep Link] Navigating to cart...');
          setLocation('/cart');
          break;
        default:
          console.log('[Deep Link] Unknown start param:', startParam);
      }
    }
  }, [setLocation]);

  return null;
}

export default function App() {
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
