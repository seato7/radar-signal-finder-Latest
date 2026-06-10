import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { HeaderAuthControls } from "@/components/auth/HeaderAuthControls";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BrokerKeyRotationModal } from "@/components/BrokerKeyRotationModal";
import { StickySignupBar } from "@/components/conversion/StickySignupBar";
import { initGlobalPriceSubscription } from "@/hooks/useRealtimePrices";
import { useAuth } from "@/hooks/useAuth";
import { initAnalytics } from "@/lib/analytics";
import { useRoutePageView } from "@/hooks/useAnalytics";
import Home from "./pages/Home";
import Alerts from "./pages/Alerts";
import AssetRadar from "./pages/AssetRadar";
import Watchlist from "./pages/Watchlist";
import AssetDetail from "./pages/AssetDetail";
import Themes from "./pages/Themes";

import DataSources from "./pages/DataSources";
import Bots from "./pages/Bots";
import APIUsage from "./pages/APIUsage";
import IngestionHealth from "./pages/IngestionHealth";
import Pricing from "./pages/Pricing";
import Admin from "./pages/Admin";
import Help from "./pages/Help";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import Analytics from "./pages/Analytics";
import Assistant from "./pages/Assistant";
import DataIngestion from "./pages/DataIngestion";
import PipelineTests from "./pages/PipelineTests";
import TradingSignals from "./pages/TradingSignals";
import Landing from "./pages/Landing";
import AccountDeleted from "./pages/AccountDeleted";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

initGlobalPriceSubscription();
initAnalytics();

const AnalyticsBridge = () => {
  useRoutePageView();
  return null;
};

const AppShell = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider style={{ "--sidebar-width": "240px" } as React.CSSProperties}>
    <div className="min-h-screen flex w-full bg-ds-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[52px] md:h-14 border-b border-ds-border flex items-center gap-2 px-4 md:px-6 sticky top-0 bg-ds-background/90 backdrop-blur supports-[backdrop-filter]:bg-ds-background/70 z-10">
          <SidebarTrigger className="lg:hidden text-ds-text-secondary hover:text-ds-text-primary" />
          <HeaderAuthControls />
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="max-w-screen-2xl mx-auto w-full">
            <StickySignupBar />
            {children}
          </div>
        </main>
        <footer className="border-t border-ds-border bg-ds-background/60 py-3 px-4 md:px-6">
          <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[12px] text-ds-text-muted">
            <span>InsiderPulse © 2026</span>
            <div className="flex items-center gap-4">
              <Link to="/help" className="hover:text-ds-text-primary transition-colors duration-fast">Help</Link>
              <Link to="/privacy" className="hover:text-ds-text-primary transition-colors duration-fast">Privacy</Link>
              <Link to="/terms" className="hover:text-ds-text-primary transition-colors duration-fast">Terms</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  </SidebarProvider>
);

// Anonymous visitors don't have a Settings page to configure — redirect to /asset-radar.
const SettingsRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/asset-radar" replace />;
  return <Settings />;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AuthModalProvider>
            <AnalyticsBridge />
            <BrokerKeyRotationModal />
            <AuthModal />
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/account-deleted" element={<AccountDeleted />} />
              <Route path="/help" element={<Help />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/" element={<Landing />} />

              {/* Anonymous-equals-Free: every app surface renders inside AppShell
                  for both anonymous and authenticated visitors. Self-scoped pages
                  show empty / locked states for anonymous and route interactive
                  actions through the auth modal. */}
              <Route path="/asset-radar" element={<AppShell><AssetRadar /></AppShell>} />
              <Route path="/trading-signals" element={<AppShell><TradingSignals /></AppShell>} />
              <Route path="/themes" element={<AppShell><Themes /></AppShell>} />
              <Route path="/pricing" element={<AppShell><Pricing /></AppShell>} />
              <Route path="/dashboard" element={<AppShell><Home /></AppShell>} />
              <Route path="/alerts" element={<AppShell><Alerts /></AppShell>} />
              <Route path="/watchlist" element={<AppShell><Watchlist /></AppShell>} />
              <Route path="/asset/*" element={<AppShell><AssetDetail /></AppShell>} />
              <Route path="/bots" element={<AppShell><Bots /></AppShell>} />
              <Route path="/assistant" element={<AppShell><Assistant /></AppShell>} />
              <Route path="/settings" element={<AppShell><SettingsRoute /></AppShell>} />
              <Route path="/analytics" element={<AppShell><Analytics /></AppShell>} />

              {/* Admin-only surfaces remain ProtectedRoute requireAdmin */}
              <Route path="/admin" element={<ProtectedRoute requireAdmin><AppShell><Admin /></AppShell></ProtectedRoute>} />
              <Route path="/data-sources" element={<ProtectedRoute requireAdmin><AppShell><DataSources /></AppShell></ProtectedRoute>} />
              <Route path="/data-ingestion" element={<ProtectedRoute requireAdmin><AppShell><DataIngestion /></AppShell></ProtectedRoute>} />
              <Route path="/pipeline-tests" element={<ProtectedRoute requireAdmin><AppShell><PipelineTests /></AppShell></ProtectedRoute>} />
              <Route path="/api-usage" element={<ProtectedRoute requireAdmin><AppShell><APIUsage /></AppShell></ProtectedRoute>} />
              <Route path="/ingestion-health" element={<ProtectedRoute requireAdmin><AppShell><IngestionHealth /></AppShell></ProtectedRoute>} />

              <Route path="*" element={<AppShell><NotFound /></AppShell>} />
            </Routes>
            </AuthModalProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
