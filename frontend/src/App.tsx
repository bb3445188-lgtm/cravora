import React, { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from './context/StoreContext';
import { Footer, Navbar, ToastContainer } from './components/NavbarAndFooter';
import { LocationModal } from './components/LocationModal';
import { ProductCustomizeModal } from './components/ProductCustomizeModal';
import { CartDrawer } from './components/CartDrawer';
import { CravoraAIConcierge } from './components/CravoraAIConcierge';

import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { DealsPage } from './pages/DealsPage';
import { BranchesPage } from './pages/BranchesPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { AccountPage } from './pages/AccountPage';
import { SupportAndLegalPage } from './pages/SupportAndLegalPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pathname]);
  return null;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <BrowserRouter>
          <ScrollToTop />
          <div className="min-h-screen flex flex-col bg-[#FFF8EF] text-[#241D19] font-sans">
            <Navbar />
            <ToastContainer />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/menu" element={<MenuPage />} />
                <Route path="/deals" element={<DealsPage />} />
                <Route path="/branches" element={<BranchesPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/track-order" element={<OrderTrackingPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/support" element={<SupportAndLegalPage />} />
                <Route path="/admin" element={<AdminDashboardPage />} />
              </Routes>
            </main>
            <Footer />

            {/* Global Connected Modals, Drawers & Floating AI Concierge */}
            <LocationModal />
            <ProductCustomizeModal />
            <CartDrawer />
            <CravoraAIConcierge />
          </div>
        </BrowserRouter>
      </StoreProvider>
    </QueryClientProvider>
  );
};

export default App;
