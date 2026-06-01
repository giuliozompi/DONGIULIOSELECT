import { useEffect } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import WebHeader from './components/WebHeader';
import WebFooter from './components/WebFooter';
import WebHomePage from './pages/WebHomePage';
import WebCatalogPage from './pages/WebCatalogPage';
import WebProductPage from './pages/WebProductPage';
import WebCartPage from './pages/WebCartPage';
import WebCheckoutPage from './pages/WebCheckoutPage';
import WebOrderSuccessPage from './pages/WebOrderSuccessPage';
import WebOrdersPage from './pages/WebOrdersPage';
import WebWishlistPage from './pages/WebWishlistPage';
import WebAddressesPage from './pages/WebAddressesPage';
import WebAccountPage from './pages/WebAccountPage';
import WebNotFoundPage from './pages/WebNotFoundPage';
import { useWebAuth } from './hooks/useWebAuth';

function WebAuthInit() {
  const { refresh } = useWebAuth();
  useEffect(() => { refresh(); }, []);
  return null;
}

function WebRouter() {
  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      <WebHeader />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={() => { const [, navigate] = useLocation(); useEffect(() => { navigate('/web'); }, []); return null; }} />
          <Route path="/web" component={WebHomePage} />
          <Route path="/web/" component={WebHomePage} />
          <Route path="/web/catalog" component={WebCatalogPage} />
          <Route path="/web/search" component={WebCatalogPage} />
          <Route path="/web/product/:slug" component={WebProductPage} />
          <Route path="/web/cart" component={WebCartPage} />
          <Route path="/web/checkout" component={WebCheckoutPage} />
          <Route path="/web/order-success/:id" component={WebOrderSuccessPage} />
          <Route path="/web/orders/:id" component={WebOrdersPage} />
          <Route path="/web/account/orders" component={WebOrdersPage} />
          <Route path="/web/account/addresses" component={WebAddressesPage} />
          <Route path="/web/wishlist" component={WebWishlistPage} />
          <Route path="/web/account" component={WebAccountPage} />
          <Route path="/web/account/:section" component={WebAccountPage} />
          <Route component={WebNotFoundPage} />
        </Switch>
      </main>
      <WebFooter />
    </div>
  );
}

export default function WebApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WebAuthInit />
        <WebRouter />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
