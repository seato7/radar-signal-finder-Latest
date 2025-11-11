import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Home from "./pages/Home";
import Alerts from "./pages/Alerts";
import Radar from "./pages/Radar";
import Watchlist from "./pages/Watchlist";
import Backtest from "./pages/Backtest";
import Assets from "./pages/Assets";
import AssetDetail from "./pages/AssetDetail";
import Themes from "./pages/Themes";
import ThemeDiscovery from "./pages/ThemeDiscovery";
import DataSources from "./pages/DataSources";
import Bots from "./pages/Bots";
import Pricing from "./pages/Pricing";
import Admin from "./pages/Admin";
import Help from "./pages/Help";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import Analytics from "./pages/Analytics";
import Assistant from "./pages/Assistant";
import DataIngestion from "./pages/DataIngestion";
import PipelineTests from "./pages/PipelineTests";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <div className="min-h-screen flex w-full bg-background">
                      <AppSidebar />
                      <div className="flex-1 flex flex-col">
                        <header className="h-14 border-b border-border flex items-center px-6 sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
                          <SidebarTrigger className="lg:hidden" />
                        </header>
                        <main className="flex-1 p-6">
                          <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/alerts" element={<Alerts />} />
                            <Route path="/radar" element={<Radar />} />
                            <Route path="/watchlist" element={<Watchlist />} />
                            <Route path="/backtest" element={<Backtest />} />
                            <Route path="/assets" element={<Assets />} />
                            <Route path="/asset/:ticker" element={<AssetDetail />} />
                            <Route path="/themes" element={<Themes />} />
                            <Route path="/theme-discovery" element={<ThemeDiscovery />} />
                            <Route path="/data-sources" element={<DataSources />} />
                            <Route path="/bots" element={<Bots />} />
                            <Route path="/pricing" element={<Pricing />} />
                            <Route 
                              path="/admin" 
                              element={
                                <ProtectedRoute requireAdmin>
                                  <Admin />
                                </ProtectedRoute>
                              } 
                            />
                            <Route path="/help" element={<Help />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/analytics" element={<Analytics />} />
                            <Route path="/assistant" element={<Assistant />} />
                            <Route path="/data-ingestion" element={<DataIngestion />} />
                            <Route path="/pipeline-tests" element={<PipelineTests />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </main>
                      </div>
                    </div>
                  </SidebarProvider>
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
