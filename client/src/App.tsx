import { useEffect } from 'react';
import { Switch, Route } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initTelegramApp } from '@/lib/telegram';
import BottomNav from '@/components/BottomNav';
import HomePage from '@/pages/HomePage';
import CategoryPage from '@/pages/CategoryPage';
import SearchPage from '@/pages/SearchPage';
import ProductDetailPage from '@/pages/ProductDetailPage';
import CartPage from '@/pages/CartPage';
import CheckoutPage from '@/pages/CheckoutPage';
import OrderDetailPage from '@/pages/OrderDetailPage';
import FortunePage from '@/pages/FortunePage';
import AssistantPage from '@/pages/AssistantPage';
import AdminPage from '@/pages/AdminPage';
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
        <Route path="/fortune" component={FortunePage} />
        <Route path="/assistant" component={AssistantPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
      <BottomNav />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    initTelegramApp();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
