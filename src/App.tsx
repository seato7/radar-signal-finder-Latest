import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BrokerKeyRotationModal } from "@/components/BrokerKeyRotationModal";
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
import PublicAssetRadar from "./pages/public/PublicAssetRadar";
import PublicThemes from "./pages/public/PublicThemes";
import PublicTradingSignals from "./pages/public/PublicTradingSignals";

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

// Tiny wrapper so we can call route-aware hooks inside the Router tree.
const AnalyticsBridge = () => {
  useRoutePageView();
  return null;
};


// Switches between the public-preview component and the authenticated component
// based on session state, so the same URL works for both visitor types.
const AuthSwitch = ({ anon: Anon, authed: Authed }: { anon: React.ComponentType; authed: React.ComponentType }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  return isAuthenticated ? <Authed /> : <Anon />;
};

const AppShell = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider style={{ "--sidebar-width": "240px" } as React.CSSProperties}>
    <div className="min-h-screen flex w-full bg-ds-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[52px] md:h-14 border-b border-ds-border flex items-center px-4 md:px-6 sticky top-0 bg-ds-background/90 backdrop-blur supports-[backdrop-filter]:bg-ds-background/70 z-10">
          <SidebarTrigger className="lg:hidden text-ds-text-secondary hover:text-ds-text-primary" />
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="max-w-screen-2xl mx-auto w-full">{children}</div>
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

              {/* Public preview routes — render anonymous preview or the real
                  authenticated page based on session, both inside the app shell. */}
              <Route
                path="/asset-radar"
                element={
                  <AppShell>
                    <AuthSwitch anon={PublicAssetRadar} authed={AssetRadar} />
                  </AppShell>
                }
              />
              <Route
                path="/trading-signals"
                element={
                  <AppShell>
                    <AuthSwitch anon={PublicTradingSignals} authed={TradingSignals} />
                  </AppShell>
                }
              />
              <Route
                path="/themes"
                element={
                  <AppShell>
                    <AuthSwitch anon={PublicThemes} authed={Themes} />
                  </AppShell>
                }
              />
              <Route
                path="/pricing"
                element={
                  <AppShell>
                    <Pricing />
                  </AppShell>
                }
              />

              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <AppShell>
                      <Routes>
                        <Route path="/dashboard" element={<Home />} />
                        <Route path="/alerts" element={<Alerts />} />
                        <Route path="/watchlist" element={<Watchlist />} />
                        <Route path="/asset/*" element={<AssetDetail />} />
                        <Route path="/data-sources" element={<DataSources />} />
                        <Route path="/bots" element={<Bots />} />
                        <Route
                          path="/admin"
                          element={
                            <ProtectedRoute requireAdmin>
                              <Admin />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/assistant" element={<Assistant />} />
                        <Route path="/data-ingestion" element={<DataIngestion />} />
                        <Route path="/pipeline-tests" element={<PipelineTests />} />
                        <Route
                          path="/api-usage"
                          element={
                            <ProtectedRoute requireAdmin>
                              <APIUsage />
                            </ProtectedRoute>
                          }
                        />
                        <Route
                          path="/ingestion-health"
                          element={
                            <ProtectedRoute requireAdmin>
                              <IngestionHealth />
                            </ProtectedRoute>
                          }
                        />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </AppShell>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
