import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, ExternalLink, TrendingUp, DollarSign, Bitcoin, Wheat, BarChart3, Clock, ArrowUpDown, ChevronLeft, ChevronRight, Zap, Crosshair, Lock, Star } from "lucide-react";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAnonSignupCTA } from "@/hooks/useAnonSignupCTA";
import { usePublicPreview } from "@/hooks/usePublicPreview";
import { getPlanLimits, isDemoModeForClass } from "@/lib/planLimits";
import { useAssetUniverseCounts, formatCount } from "@/hooks/useAssetUniverseCounts";
import { BlurredUpgradeOverlay } from "@/components/BlurredUpgradeOverlay";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { TickerLink } from "@/lib/tickerLink";
import { RequestAssetModal } from "@/components/RequestAssetModal";
import { useToast } from "@/hooks/use-toast";


type AssetClassTab = "all" | "stock" | "forex" | "crypto" | "commodity" | "etf";
type SortOption = "score-desc" | "score-asc" | "recent" | "alpha-asc" | "alpha-desc" | "gainers" | "losers";

// Asset row type with pre-computed score from database
interface AssetRow {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  asset_class: string | null;
  computed_score: number | null;
  hybrid_score: number | null;
  score_computed_at: string | null;
  score_explanation: unknown;
}

interface AssetWithScore {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  asset_class: string | null;
  score: number;
  sentiment: string;
  lastUpdated: string | null;
  priceChange: number | null;
  signalStrength: "high" | "medium" | "low" | "none";
  signalMass: number;
}

// Helper to format strings: replace underscores with spaces and title case
const formatLabel = (str: string): string => {
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Helper to format exchange labels for display
const formatExchange = (exchange: string): string => {
  if (exchange.toLowerCase() === 'synthetic') {
    return 'Altcoin';
  }
  return exchange;
};

const getSentiment = (score: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
  if (score >= 80) return { label: "Strong Bullish", variant: "default" };
  if (score >= 60) return { label: "Bullish", variant: "secondary" };
  if (score >= 40) return { label: "Neutral", variant: "outline" };
  if (score >= 20) return { label: "Bearish", variant: "destructive" };
  return { label: "Strong Bearish", variant: "destructive" };
};

// Signal strength based on mass thresholds (calibrated from actual distribution)
// M50=0.0032, M75=0.0067, M90=0.017, M95=0.020 for massy assets
const getSignalStrength = (mass: number): { level: "high" | "medium" | "low" | "none"; label: string; className: string } => {
  if (mass >= 0.017) return { level: "high", label: "High", className: "border-ds-signal-positive/40 text-ds-signal-positive" };
  if (mass >= 0.0067) return { level: "medium", label: "Med", className: "border-ds-signal-warning/40 text-ds-signal-warning" };
  if (mass >= 0.001) return { level: "low", label: "Low", className: "border-ds-border text-ds-text-muted" };
  return { level: "none", label: "None", className: "border-ds-border/50 text-ds-text-muted/60" };
};

const getScoreClasses = (score: number): string => {
  if (score >= 70) return "border-ds-signal-positive/40 text-ds-signal-positive";
  if (score >= 50) return "border-ds-signal-warning/40 text-ds-signal-warning";
  return "border-ds-border text-ds-text-muted";
};

// Extract signal mass from score_explanation jsonb array
const extractSignalMass = (scoreExplanation: unknown): number => {
  if (!scoreExplanation || !Array.isArray(scoreExplanation)) return 0;
  const massEntry = scoreExplanation.find((e: any) => e.k === 'signal_mass');
  if (!massEntry) return 0;
  return typeof massEntry.v === 'number' ? massEntry.v : parseFloat(String(massEntry.v)) || 0;
};

const PAGE_SIZE = 50;
const REFRESH_INTERVAL = 30000; // 30 seconds auto-refresh

// Full Standard tier cycle is 24 hours, add buffer for safety
const FULL_CYCLE_HOURS = 26;

// Mass threshold for "scored" assets
const SIGNAL_MASS_THRESHOLD = 0.001;

const ASSET_CLASS_TABS: { value: AssetClassTab; label: string; icon: React.ReactNode; filter: string | null }[] = [
  { value: "all", label: "All Assets", icon: <Filter className="h-4 w-4" />, filter: null },
  { value: "stock", label: "Stocks", icon: <TrendingUp className="h-4 w-4" />, filter: "stock" },
  { value: "etf", label: "ETFs", icon: <BarChart3 className="h-4 w-4" />, filter: "etf" },
  { value: "forex", label: "Forex", icon: <DollarSign className="h-4 w-4" />, filter: "forex" },
  { value: "crypto", label: "Crypto", icon: <Bitcoin className="h-4 w-4" />, filter: "crypto" },
  { value: "commodity", label: "Commodities", icon: <Wheat className="h-4 w-4" />, filter: "commodity" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "score-desc", label: "Highest Score" },
  { value: "score-asc", label: "Lowest Score" },
  { value: "recent", label: "Most Recently Updated" },
  { value: "gainers", label: "Biggest Gainers" },
  { value: "losers", label: "Biggest Losers" },
  { value: "alpha-asc", label: "A → Z" },
  { value: "alpha-desc", label: "Z → A" },
];

const AssetRadar = () => {
  const { user, userPlan, planLoading, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const anonSignup = useAnonSignupCTA();
  const planLimits = getPlanLimits(userPlan);
  const { data: universeCounts } = useAssetUniverseCounts();
  const { toast } = useToast();
  const { addTicker: addToWatchlist, adding: addingToWatchlist } = useAddToWatchlist();
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const previewQuery = usePublicPreview();
  const previewData = !isAuthenticated ? previewQuery.data : null;


  const isTabLocked = (filter: string | null): boolean => {
    if (planLimits.asset_radar_classes.length === 0) return true;
    if (filter === null) return false;
    return !planLimits.asset_radar_classes.includes(filter);
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<AssetClassTab>(() => {
    if (planLimits.asset_radar_classes.length === 0) return "all";
    return planLimits.asset_radar_classes.length > 1 ? "all" : planLimits.asset_radar_classes[0] as AssetClassTab;
  });
  const [sortBy, setSortBy] = useState<SortOption>("score-desc");
  const [assets, setAssets] = useState<AssetWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [activeSignalTickers, setActiveSignalTickers] = useState<Set<string>>(new Set());


  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchAssets = async (pageNum: number, assetClass: AssetClassTab = activeTab, currentSortBy: SortOption = sortBy) => {
    setLoading(true);

    try {
      // Use cycle-based cutoff instead of "today" - covers full Standard tier cycle
      const cutoffTime = new Date(Date.now() - FULL_CYCLE_HOURS * 60 * 60 * 1000).toISOString();
      const tabConfig = ASSET_CLASS_TABS.find(t => t.value === assetClass);

      let assetsData: any[] = [];
      let totalCount = 0;

      // ═══════════════════════════════════════════════════════════════════
      // SEARCH PATH: use relevance-ranked RPC when query length >= 2
      // ═══════════════════════════════════════════════════════════════════
      const trimmedSearch = searchTerm.trim();
      if (trimmedSearch.length >= 2) {
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('search_assets', {
          q: trimmedSearch,
          result_limit: PAGE_SIZE,
          filter_asset_class: tabConfig?.filter ?? null,
        });

        if (rpcError) throw rpcError;

        const rows = (rpcData ?? []) as AssetRow[];
        assetsData = rows;
        totalCount = rows.length;

        const tickers = rows.map((r) => r.ticker);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const changeCutoffDate = threeDaysAgo.toISOString().split('T')[0];

        const { data: recentPriceData } = tickers.length > 0
          ? await supabase
              .from('prices')
              .select('ticker, close, date, last_updated_at')
              .in('ticker', tickers)
              .gte('date', changeCutoffDate)
              .order('date', { ascending: false })
          : { data: [] as any[] };

        const priceData = recentPriceData || [];
        const priceMap = new Map<string, { lastUpdated: string; close: number }>();
        const previousPriceMap = new Map<string, number>();
        const seenDates = new Map<string, string>();

        priceData.forEach((p: any) => {
          if (!priceMap.has(p.ticker)) {
            priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || (p.date ? p.date + 'T00:00:00.000Z' : ''), close: p.close });
            seenDates.set(p.ticker, p.date);
          } else if (!previousPriceMap.has(p.ticker) && p.date !== seenDates.get(p.ticker)) {
            previousPriceMap.set(p.ticker, p.close);
          }
        });

        const priceChangeMap = new Map<string, number | null>();
        priceMap.forEach((info, ticker) => {
          const previousPrice = previousPriceMap.get(ticker);
          if (previousPrice && previousPrice !== 0) {
            priceChangeMap.set(ticker, Math.round(((info.close - previousPrice) / previousPrice) * 10000) / 100);
          } else {
            priceChangeMap.set(ticker, null);
          }
        });

        const enhancedAssets: AssetWithScore[] = rows.map((asset) => {
          const score = asset.hybrid_score ?? asset.computed_score ?? 50;
          const sentiment = getSentiment(score);
          const priceInfo = priceMap.get(asset.ticker);
          const signalMass = extractSignalMass(asset.score_explanation);
          const signalStrengthInfo = getSignalStrength(signalMass);
          return {
            id: asset.id,
            ticker: asset.ticker,
            name: asset.name,
            exchange: asset.exchange,
            asset_class: asset.asset_class,
            score,
            sentiment: sentiment.label,
            lastUpdated: priceInfo?.lastUpdated || null,
            priceChange: priceChangeMap.get(asset.ticker) ?? null,
            signalStrength: signalStrengthInfo.level,
            signalMass,
          };
        });

        setAssets(enhancedAssets);
        setTotal(totalCount);
        setLoading(false);
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // SCORE-BASED SORTING: Use pre-computed computed_score column
      // ═══════════════════════════════════════════════════════════════════
      if ((currentSortBy === "score-desc" || currentSortBy === "score-asc") && trimmedSearch.length < 2) {
        const { data: sortedAssets, error: assetError } = await (supabase.rpc as any)('get_assets_for_user', {
          _class_filter: tabConfig?.filter ?? null,
          _sort_mode: currentSortBy,
          _result_limit: PAGE_SIZE,
          _result_offset: pageNum * PAGE_SIZE,
        });

        if (assetError) throw assetError;

        const assets = (sortedAssets || []) as AssetRow[];
        totalCount = (sortedAssets?.[0] as any)?.total_count ?? 0;

        if (assets.length === 0) {
          setAssets([]);
          setTotal(totalCount || 0);
          setLoading(false);
          return;
        }

        // Fetch price data for these assets
        const tickers = assets.map(a => a.ticker);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const changeCutoffDate = threeDaysAgo.toISOString().split('T')[0];

        const { data: recentPriceData } = await supabase
          .from('prices')
          .select('ticker, close, date, last_updated_at')
          .in('ticker', tickers)
          .gte('date', changeCutoffDate)
          .order('date', { ascending: false });

        const priceData = recentPriceData || [];

        // Build price maps
        const priceMap = new Map<string, { lastUpdated: string; close: number }>();
        const previousPriceMap = new Map<string, number>();
        const seenDates = new Map<string, string>();

        priceData.forEach(p => {
          if (!priceMap.has(p.ticker)) {
            priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || (p.date ? p.date + 'T00:00:00.000Z' : ''), close: p.close });
            seenDates.set(p.ticker, p.date);
          } else if (!previousPriceMap.has(p.ticker) && p.date !== seenDates.get(p.ticker)) {
            previousPriceMap.set(p.ticker, p.close);
          }
        });

        const priceChangeMap = new Map<string, number | null>();
        priceMap.forEach((info, ticker) => {
          const previousPrice = previousPriceMap.get(ticker);
          if (previousPrice && previousPrice !== 0) {
            priceChangeMap.set(ticker, Math.round(((info.close - previousPrice) / previousPrice) * 10000) / 100);
          } else {
            priceChangeMap.set(ticker, null);
          }
        });

        // Build enhanced assets using pre-computed scores
        const enhancedAssets: AssetWithScore[] = assets.map((asset) => {
          const score = asset.hybrid_score ?? asset.computed_score ?? 50;
          const sentiment = getSentiment(score);
          const priceInfo = priceMap.get(asset.ticker);
          const signalMass = extractSignalMass(asset.score_explanation);
          const signalStrengthInfo = getSignalStrength(signalMass);

          return {
            id: asset.id,
            ticker: asset.ticker,
            name: asset.name,
            exchange: asset.exchange,
            asset_class: asset.asset_class,
            score,
            sentiment: sentiment.label,
            lastUpdated: priceInfo?.lastUpdated || null,
            priceChange: priceChangeMap.get(asset.ticker) ?? null,
            signalStrength: signalStrengthInfo.level,
            signalMass
          };
        });

        setAssets(enhancedAssets);
        setTotal(totalCount);
        setLoading(false);
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // "Most Recently Updated" mode: fetch from prices first
      // ═══════════════════════════════════════════════════════════════════
      if (currentSortBy === "recent" && trimmedSearch.length < 2) {
        let priceQuery = supabase
          .from('prices')
          .select('ticker, close, date, last_updated_at', { count: 'exact' })
          .gte('last_updated_at', cutoffTime)
          .order('last_updated_at', { ascending: false });

        const { data: recentPrices, count: priceCount, error: priceError } = await priceQuery
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        if (priceError) throw priceError;

        const recentTickers = (recentPrices || []).map(p => p.ticker);
        
        if (recentTickers.length === 0) {
          setAssets([]);
          setTotal(0);
          setLoading(false);
          return;
        }

        const { data: matchingAssets, error: assetError } = await (supabase.rpc as any)('get_assets_for_user', {
          _class_filter: tabConfig?.filter ?? null,
          _tickers: recentTickers,
          _result_limit: recentTickers.length,
        });
        if (assetError) throw assetError;

        const priceMap = new Map<string, { lastUpdated: string; close: number }>();
        (recentPrices || []).forEach(p => {
          if (!priceMap.has(p.ticker)) {
            priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || (p.date ? p.date + 'T00:00:00.000Z' : ''), close: p.close });
          }
        });

        const tickerOrder = new Map(recentTickers.map((t, i) => [t, i]));
        const sortedAssetsList = (matchingAssets || [])
          .filter(a => tickerOrder.has(a.ticker))
          .sort((a, b) => (tickerOrder.get(a.ticker) ?? 999) - (tickerOrder.get(b.ticker) ?? 999));

        assetsData = sortedAssetsList;

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const changeCutoffDate = threeDaysAgo.toISOString().split('T')[0];
        const { data: previousPriceData } = await supabase
          .from('prices')
          .select('ticker, close, date')
          .in('ticker', recentTickers)
          .gte('date', changeCutoffDate)
          .order('date', { ascending: false });

        const previousPriceMap = new Map<string, number>();
        const seenDates = new Map<string, string>();
        (previousPriceData || []).forEach(p => {
          if (!seenDates.has(p.ticker)) {
            seenDates.set(p.ticker, p.date);
          } else if (!previousPriceMap.has(p.ticker) && p.date !== seenDates.get(p.ticker)) {
            previousPriceMap.set(p.ticker, p.close);
          }
        });

        // Use database computed_score directly, prefer hybrid_score when available
        const enhancedAssets: AssetWithScore[] = assetsData.map((asset) => {
          const score = asset.hybrid_score ?? asset.computed_score ?? 50;
          const sentiment = getSentiment(score);
          const priceInfo = priceMap.get(asset.ticker);
          const previousPrice = previousPriceMap.get(asset.ticker);
          const signalMass = extractSignalMass(asset.score_explanation);
          const signalStrengthInfo = getSignalStrength(signalMass);
          
          let priceChange: number | null = null;
          if (priceInfo && previousPrice && previousPrice !== 0) {
            priceChange = Math.round(((priceInfo.close - previousPrice) / previousPrice) * 10000) / 100;
          }
          
          return {
            id: asset.id,
            ticker: asset.ticker,
            name: asset.name,
            exchange: asset.exchange,
            asset_class: asset.asset_class,
            score,
            sentiment: sentiment.label,
            lastUpdated: priceInfo?.lastUpdated || null,
            priceChange,
            signalStrength: signalStrengthInfo.level,
            signalMass
          };
        });

        setAssets(enhancedAssets);
        setTotal(priceCount || 0);
        setLoading(false);
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // GAINERS / LOSERS: use RPC to avoid 1000-row fetch limit
      // ═══════════════════════════════════════════════════════════════════
      if (currentSortBy === "gainers" || currentSortBy === "losers") {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 3);
        const cutoff = cutoffDate.toISOString().split('T')[0];

        const { data: changeData, error: changeError } = await supabase
          .rpc('get_price_changes', { cutoff_date: cutoff });

        if (changeError) throw changeError;

        const changeArr = (changeData || []) as { ticker: string; change_pct: number }[];

        changeArr.sort((a, b) =>
          currentSortBy === "gainers"
            ? b.change_pct - a.change_pct
            : a.change_pct - b.change_pct
        );

        const pageSlice = changeArr.slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE);
        const tickersInOrder = pageSlice.map(c => c.ticker);
        totalCount = changeArr.length;

        if (tickersInOrder.length === 0) {
          setAssets([]);
          setTotal(0);
          setLoading(false);
          return;
        }

        const { data: matchingAssets } = await (supabase.rpc as any)('get_assets_for_user', {
          _class_filter: tabConfig?.filter ?? null,
          _tickers: tickersInOrder,
          _result_limit: tickersInOrder.length,
        });

        // Fetch latest price date for timestamp display
        const { data: latestPriceDates } = await supabase
          .from('prices')
          .select('ticker, date')
          .in('ticker', tickersInOrder)
          .order('date', { ascending: false });

        const latestDateMap = new Map<string, string>();
        (latestPriceDates || []).forEach(p => {
          if (!latestDateMap.has(p.ticker)) {
            latestDateMap.set(p.ticker, p.date + 'T00:00:00.000Z');
          }
        });

        const tickerOrder = new Map(tickersInOrder.map((t, i) => [t, i]));
        const sortedList = (matchingAssets || [])
          .filter(a => tickerOrder.has(a.ticker))
          .sort((a, b) => (tickerOrder.get(a.ticker) ?? 999) - (tickerOrder.get(b.ticker) ?? 999));

        const priceChangeMap = new Map(
          pageSlice.map(c => [c.ticker, Math.round(c.change_pct * 100) / 100])
        );

        const enhancedAssets: AssetWithScore[] = sortedList.map((asset) => {
          const score = asset.hybrid_score ?? asset.computed_score ?? 50;
          const sentiment = getSentiment(score);
          const signalMass = extractSignalMass(asset.score_explanation);
          const signalStrengthInfo = getSignalStrength(signalMass);
          return {
            id: asset.id,
            ticker: asset.ticker,
            name: asset.name,
            exchange: asset.exchange,
            asset_class: asset.asset_class,
            score,
            sentiment: sentiment.label,
            lastUpdated: latestDateMap.get(asset.ticker) || null,
            priceChange: priceChangeMap.get(asset.ticker) ?? null,
            signalStrength: signalStrengthInfo.level,
            signalMass,
          };
        });

        setAssets(enhancedAssets);
        setTotal(totalCount);
        setLoading(false);
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // Default mode: fetch assets first, then enrich with prices
      // Search (length >= 2) is handled by the search_assets RPC at the
      // top of this function; this path runs only for empty / single-char
      // search with alpha sort.
      // ═══════════════════════════════════════════════════════════════════
      const { data, error } = await (supabase.rpc as any)('get_assets_for_user', {
        _class_filter: tabConfig?.filter ?? null,
        _sort_mode: currentSortBy === "alpha-desc" ? "alpha-desc" : "alpha-asc",
        _result_limit: PAGE_SIZE,
        _result_offset: pageNum * PAGE_SIZE,
      });

      if (error) throw error;

      const fetchedAssets = (data || []) as AssetRow[];

      assetsData = fetchedAssets;
      totalCount = (data?.[0] as any)?.total_count ?? 0;

      const tickers = assetsData.map(a => a.ticker);
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const changeCutoffDate = threeDaysAgo.toISOString().split('T')[0];
      
      const { data: recentPriceData } = await supabase
        .from('prices')
        .select('ticker, close, date, last_updated_at')
        .in('ticker', tickers)
        .gte('date', changeCutoffDate)
        .order('date', { ascending: false });

      const priceData = recentPriceData || [];

      const priceMap = new Map<string, { lastUpdated: string; close: number }>();
      const previousPriceMap = new Map<string, number>();
      const seenDates = new Map<string, string>();
      
      priceData.forEach(p => {
        if (!priceMap.has(p.ticker)) {
          priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || (p.date ? p.date + 'T00:00:00.000Z' : ''), close: p.close });
          seenDates.set(p.ticker, p.date);
        } else if (!previousPriceMap.has(p.ticker) && p.date !== seenDates.get(p.ticker)) {
          previousPriceMap.set(p.ticker, p.close);
        }
      });
      
      const priceChangeMap = new Map<string, number | null>();
      priceMap.forEach((info, ticker) => {
        const previousPrice = previousPriceMap.get(ticker);
        if (previousPrice && previousPrice !== 0) {
          priceChangeMap.set(ticker, Math.round(((info.close - previousPrice) / previousPrice) * 10000) / 100);
        } else {
          priceChangeMap.set(ticker, null);
        }
      });

      // Use database score directly, prefer hybrid_score when available
      const enhancedAssets: AssetWithScore[] = assetsData.map((asset) => {
        const score = asset.hybrid_score ?? asset.computed_score ?? 50;
        const sentiment = getSentiment(score);
        const priceInfo = priceMap.get(asset.ticker);
        const signalMass = extractSignalMass(asset.score_explanation);
        const signalStrengthInfo = getSignalStrength(signalMass);
        
        return {
          id: asset.id,
          ticker: asset.ticker,
          name: asset.name,
          exchange: asset.exchange,
          asset_class: asset.asset_class,
          score,
          sentiment: sentiment.label,
          lastUpdated: priceInfo?.lastUpdated || null,
          priceChange: priceChangeMap.get(asset.ticker) ?? null,
          signalStrength: signalStrengthInfo.level,
          signalMass
        };
      });

      setAssets(enhancedAssets);
      setTotal(totalCount);
    } catch (error) {
      console.error("Failed to fetch assets:", error);
    } finally {
      setLoading(false);
    }
  };

  // Sort assets based on selected option (for non-score modes that don't pre-sort)
  const sortedAssets = useMemo(() => {
    // When searching, preserve RPC relevance ordering
    if (searchTerm.trim().length >= 2) {
      return assets;
    }
    // For score sorting, assets are already sorted from fetch
    if (sortBy === "score-desc" || sortBy === "score-asc") {
      return assets;
    }

    const sorted = [...assets];
    switch (sortBy) {
      case "recent":
        return sorted.sort((a, b) => {
          if (!a.lastUpdated && !b.lastUpdated) return 0;
          if (!a.lastUpdated) return 1;
          if (!b.lastUpdated) return -1;
          return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
        });
      case "alpha-asc":
        return sorted.sort((a, b) => a.ticker.localeCompare(b.ticker));
      case "alpha-desc":
        return sorted.sort((a, b) => b.ticker.localeCompare(a.ticker));
      case "gainers":
      case "losers":
        return sorted; // handled server-side
      default:
        return sorted;
    }
  }, [assets, sortBy, searchTerm]);

  const activeTabConfig = ASSET_CLASS_TABS.find((t) => t.value === activeTab);
  const activeTabLocked = activeTabConfig ? isTabLocked(activeTabConfig.filter) : false;

  useEffect(() => {
    if (planLoading) return;

    // Anonymous = Free: source rows from the public preview RPC.
    if (!isAuthenticated) {
      if (previewQuery.isLoading) { setLoading(true); return; }
      const demo = previewData?.demo_assets ?? [];
      const blurred = previewData?.blurred_assets ?? [];
      const tabConfig = ASSET_CLASS_TABS.find(t => t.value === activeTab);
      const classFilter = tabConfig?.filter ?? null;
      const mapDemo = demo.map((a): AssetWithScore => ({
        id: a.id, ticker: a.ticker, name: a.name, exchange: a.exchange,
        asset_class: a.asset_class, score: Number(a.score ?? 50),
        sentiment: getSentiment(Number(a.score ?? 50)).label,
        lastUpdated: a.score_computed_at, priceChange: a.price_change_pct ?? null,
        signalStrength: "low", signalMass: 0,
      }));
      const mapBlur = blurred.map((a): AssetWithScore => ({
        id: a.id, ticker: a.ticker, name: a.name, exchange: a.exchange,
        asset_class: a.asset_class, score: 0, sentiment: "Neutral",
        lastUpdated: null, priceChange: null, signalStrength: "none", signalMass: 0,
      }));
      const combined = [...mapDemo, ...mapBlur].filter(a =>
        classFilter == null ? true : a.asset_class === classFilter
      );
      setAssets(combined);
      setTotal(previewData?.scored_asset_count ?? previewData?.total_asset_count ?? combined.length);
      setLoading(false);
      return;
    }

    if (planLimits.asset_radar_classes.length === 0) return;
    if (activeTabLocked) {
      setAssets([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setPage(0);
    const debounce = setTimeout(() => fetchAssets(0, activeTab, sortBy), 250);
    return () => clearTimeout(debounce);
  }, [searchTerm, activeTab, sortBy, userPlan, activeTabLocked, planLoading, isAuthenticated, previewData, previewQuery.isLoading]);


  // Auto-refresh every 30 seconds to pick up new scores
  useEffect(() => {
    if (planLoading || planLimits.asset_radar_classes.length === 0) return;
    if (!isAuthenticated) return; // anon uses public preview snapshot; no auto-refresh
    if (activeTabLocked) return;
    const interval = setInterval(() => {
      fetchAssets(page, activeTab, sortBy);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [page, activeTab, sortBy, userPlan, activeTabLocked, planLoading, isAuthenticated]);


  // Fetch active trade signal tickers once on mount for Signal badges
  useEffect(() => {
    if (!isAuthenticated) { setActiveSignalTickers(new Set()); return; }
    (supabase.rpc as any)('get_active_signal_tickers_for_user').then(({ data }: any) => {
      setActiveSignalTickers(new Set((data ?? []).map((r: any) => r.ticker)));
    });
  }, [isAuthenticated]);


  const handleTabChange = (value: string) => {
    setActiveTab(value as AssetClassTab);
    setPage(0);
    setAssets([]);
  };

  const goToPage = (newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      setPage(newPage);
      fetchAssets(newPage, activeTab, sortBy);
    }
  };

  const getVisiblePages = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(0, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages - 1, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(0, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const getTabDescription = () => {
    const tabLabel = ASSET_CLASS_TABS.find(t => t.value === activeTab)?.label || "assets";
    return `Browse ${total.toLocaleString()} ${activeTab === "all" ? "assets" : tabLabel.toLowerCase()}`;
  };

  if (planLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Asset Radar" description="Loading…" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-4 rounded-lg border border-border">
              <Skeleton className="h-6 w-20 mb-2" />
              <Skeleton className="h-4 w-32 mb-3" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (planLimits.asset_radar_classes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Asset Radar"
          description="Browse scored assets across all asset classes"
        />
        <BlurredUpgradeOverlay
          feature="Asset Radar"
          description={`Upgrade to Starter to unlock scores on ${formatCount(universeCounts?.stock)} stocks and the ranked Asset Radar.`}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-4 rounded-lg border border-border bg-card">
                <div className="h-6 w-20 mb-2 bg-muted rounded" />
                <div className="h-4 w-32 mb-3 bg-muted rounded" />
                <div className="h-5 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        </BlurredUpgradeOverlay>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Radar"
        description={getTabDescription()}
      />

      {userPlan === "free" && (
        <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-overline text-ds-text-muted mb-1">FREE PREVIEW</p>
            <p className="text-body-sm font-semibold text-ds-text-primary">3 sample assets shown in full.</p>
            <p className="text-caption text-ds-text-secondary mt-0.5">
              {isAuthenticated
                ? `Starter unlocks ${formatCount(universeCounts?.stock)} stock scores. Pro adds ETFs + forex (${formatCount(universeCounts?.proCoverage)} assets). Premium covers all ${formatCount(universeCounts?.premiumCoverage)} assets across every class.`
                : `Sign up free to browse all ${formatCount(universeCounts?.premiumCoverage)} ranked assets.`}
            </p>
          </div>
          {isAuthenticated ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="cta-upgrade-pulse text-xs border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent shrink-0"
            >
              <Link to="/pricing?upgrade_from=asset_radar_free_banner">Compare plans</Link>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => anonSignup('asset_radar_free_banner')}
              className="cta-upgrade-pulse text-xs border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent shrink-0"
            >
              Sign Up Free
            </Button>
          )}
        </div>
      )}

      {userPlan === "starter" && (
        <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-overline text-ds-text-muted mb-1">STARTER PLAN</p>
            <p className="text-body-sm font-semibold text-ds-text-primary">
              You have scores on {formatCount(universeCounts?.stock)} stocks.
            </p>
            <p className="text-caption text-ds-text-secondary mt-0.5">
              Upgrade to Pro to add {formatCount(universeCounts?.etf)} ETFs and {formatCount(universeCounts?.forex)} forex pairs ({formatCount(universeCounts?.proCoverage)} assets total), or Premium for the full universe of {formatCount(universeCounts?.premiumCoverage)} assets including crypto and commodities.
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="cta-upgrade-pulse text-xs border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent shrink-0"
          >
            <Link to="/pricing?upgrade_from=asset_radar_starter_banner">Upgrade</Link>
          </Button>
        </div>
      )}

      {userPlan === "pro" && (
        <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-overline text-ds-text-muted mb-1">PRO PLAN</p>
            <p className="text-body-sm font-semibold text-ds-text-primary">
              You have scores on {formatCount(universeCounts?.proCoverage)} assets (stocks, ETFs, forex).
            </p>
            <p className="text-caption text-ds-text-secondary mt-0.5">
              Upgrade to Premium to add {formatCount(universeCounts?.crypto)} crypto and {formatCount(universeCounts?.commodity)} commodities — full universe of {formatCount(universeCounts?.premiumCoverage)} assets.
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="cta-upgrade-pulse text-xs border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent shrink-0"
          >
            <Link to="/pricing?upgrade_from=asset_radar_pro_banner">Upgrade to Premium</Link>
          </Button>
        </div>
      )}


      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList
          className="grid w-full mb-4 bg-ds-surface border border-ds-border rounded-ds-md h-auto p-1"
          style={{ gridTemplateColumns: `repeat(${ASSET_CLASS_TABS.length}, minmax(0, 1fr))` }}
        >
          {ASSET_CLASS_TABS.map((tab) => {
            const locked = isTabLocked(tab.filter);
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-1.5 px-2 py-1.5 text-caption sm:text-body-sm font-medium text-ds-text-secondary data-[state=active]:bg-ds-surface-elevated data-[state=active]:text-ds-text-primary data-[state=active]:shadow-none rounded-ds-sm transition-colors duration-fast ease-ds-out"
                title={locked ? "Upgrade to unlock" : undefined}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {locked && <Lock className="h-3 w-3 text-ds-text-muted ml-0.5" aria-label="Locked" />}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ticker, name, or exchange..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm.trim().length === 1 && (
                    <p className="text-xs text-muted-foreground mt-1.5 ml-1">
                      Type at least 2 characters to search
                    </p>
                  )}
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
        <CardContent>
          {activeTabLocked ? (() => {
            const examples =
              activeTab === "crypto"
                ? [{ t: "BTC", n: "Bitcoin", c: "+2.3%" }, { t: "ETH", n: "Ethereum", c: "+1.8%" }, { t: "SOL", n: "Solana", c: "-0.6%" }]
                : activeTab === "commodity"
                ? [{ t: "XAU", n: "Gold", c: "+0.4%" }, { t: "OIL", n: "Crude Oil", c: "-1.1%" }, { t: "NG", n: "Natural Gas", c: "+3.2%" }]
                : [{ t: "—", n: activeTabConfig?.label ?? "", c: "—" }, { t: "—", n: activeTabConfig?.label ?? "", c: "—" }, { t: "—", n: activeTabConfig?.label ?? "", c: "—" }];
            return (
              <LockedPreview
                mode="section"
                intensity="medium"
                targetTier={activeTab === "crypto" || activeTab === "commodity" ? "premium" : "pro"}
                trackingLabel={`asset_radar_${activeTab}`}
                ctaText={activeTab === "crypto" || activeTab === "commodity" ? "Upgrade to Premium" : "Upgrade to Pro"}
                tooltipText={
                  activeTab === "crypto" || activeTab === "commodity"
                    ? `Unlock with Premium for full Asset Radar across ${activeTabConfig?.label?.toLowerCase()} and every other asset class`
                    : `Unlock with Pro for Asset Radar scores on ${activeTabConfig?.label?.toLowerCase()}`
                }
              >
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {examples.map((ex, i) => (
                    <div key={i} className="p-4 rounded-ds-md border border-ds-border bg-ds-surface-elevated">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-semibold text-data-lg text-ds-brand-primary">{ex.t}</span>
                        <span className="text-caption font-mono border border-ds-border rounded-ds-sm px-1.5 py-0.5 text-ds-text-secondary">
                          {ex.c}
                        </span>
                      </div>
                      <p className="text-body-sm text-ds-text-secondary">{ex.n}</p>
                    </div>
                  ))}
                </div>
              </LockedPreview>
            );
          })() : loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-4 rounded-lg border border-border">
                  <Skeleton className="h-6 w-20 mb-2" />
                  <Skeleton className="h-4 w-32 mb-3" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-muted-foreground">
                {searchTerm ? `No assets found matching "${searchTerm}"` : "No assets available"}
              </p>
              {searchTerm.trim().length >= 2 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!user) {
                      toast({
                        title: "Sign in required",
                        description: "Please sign in to request assets.",
                      });
                      return;
                    }
                    setRequestModalOpen(true);
                  }}
                >
                  Request "{searchTerm}" be added
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sortedAssets.map((asset, index) => {
                  const sentiment = getSentiment(asset.score);
                  const signalStrengthInfo = getSignalStrength(asset.signalMass);
                  const displayRank = index + 1;
                  const assetClass = asset.asset_class ?? null;
                  const demoMode = isDemoModeForClass(planLimits, assetClass);
                  const demoTickers = planLimits.demo_tickers ?? [];
                  const isDemoTicker = demoTickers.includes(asset.ticker);
                  const blurData = demoMode && !isDemoTicker;
                  return (
                    <Link
                      key={asset.id}
                      to={`/asset/${encodeURIComponent(asset.ticker)}`}
                      state={{ rank: displayRank, score: asset.score, totalLoaded: sortedAssets.length }}
                      className="block"
                    >
                      <div className="p-4 rounded-ds-md border border-ds-border bg-ds-surface-elevated hover:border-ds-border-strong transition-colors duration-fast ease-ds-out h-full">
                        <div className="flex items-start justify-between mb-1.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <h3 className="font-mono font-semibold text-data-lg text-ds-brand-primary">{asset.ticker}</h3>
                            <TickerLink ticker={asset.ticker} iconOnly />
                            {activeSignalTickers.has(asset.ticker) && (
                              <span className="inline-flex items-center gap-0.5 text-caption font-medium px-1.5 py-0.5 rounded-ds-sm border border-ds-signal-positive/40 text-ds-signal-positive">
                                <Crosshair className="h-2.5 w-2.5" />
                                Signal
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {asset.signalStrength !== "none" && (
                              <span
                                className={`inline-flex items-center text-caption font-medium px-1.5 py-0.5 rounded-ds-sm border ${signalStrengthInfo.className}`}
                                title={`Signal strength: ${signalStrengthInfo.label}`}
                              >
                                <Zap className="h-2.5 w-2.5 mr-0.5" />
                                {signalStrengthInfo.label}
                              </span>
                            )}
                            {blurData ? (
                              <LockedPreview mode="row-cell" intensity="medium" targetTier="starter" trackingLabel="asset_radar_row">
                                <span className={`text-caption font-mono font-medium px-1.5 py-0.5 rounded-ds-sm border ${getScoreClasses(asset.score)}`}>
                                  {asset.score}
                                </span>
                              </LockedPreview>
                            ) : (
                              <span className={`text-caption font-mono font-medium px-1.5 py-0.5 rounded-ds-sm border ${getScoreClasses(asset.score)}`}>
                                {asset.score}
                              </span>
                            )}
                            <button
                              type="button"
                              aria-label={`Add ${asset.ticker} to watchlist`}
                              title="Add to watchlist"
                              disabled={addingToWatchlist}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!isAuthenticated) {
                                  anonSignup('asset_radar_watchlist');
                                  return;
                                }
                                addToWatchlist(asset.ticker);
                              }}

                              className="text-ds-text-muted hover:text-ds-signal-warning transition-colors duration-fast ease-ds-out disabled:opacity-50"
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-body-sm text-ds-text-secondary mb-3 line-clamp-1">{asset.name}</p>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-caption font-medium px-1.5 py-0.5 rounded-ds-sm border border-ds-border text-ds-text-secondary">
                              {formatExchange(asset.exchange)}
                            </span>
                            {asset.priceChange !== null && typeof asset.priceChange === 'number' && (
                              blurData ? (
                                <LockedPreview mode="row-cell" intensity="medium" targetTier="starter" trackingLabel="asset_radar_row_pct">
                                  <span className={`text-caption font-mono font-medium ${asset.priceChange >= 0 ? 'text-ds-signal-positive' : 'text-ds-signal-negative'}`}>
                                    {asset.priceChange >= 0 ? '+' : ''}{asset.priceChange.toFixed(2)}%
                                  </span>
                                </LockedPreview>
                              ) : (
                                <span className={`text-caption font-mono font-medium ${asset.priceChange >= 0 ? 'text-ds-signal-positive' : 'text-ds-signal-negative'}`}>
                                  {asset.priceChange >= 0 ? '+' : ''}{asset.priceChange.toFixed(2)}%
                                </span>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-caption text-ds-text-muted shrink-0">
                            <Clock className="h-3 w-3" />
                            {asset.lastUpdated ? (
                              <span className="font-mono">{formatDistanceToNow(new Date(asset.lastUpdated), { addSuffix: true })}</span>
                            ) : (
                              <span className="text-ds-signal-negative/70">No data</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mt-6">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 0 || loading}
                    className="h-9 w-9"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  {getVisiblePages().map((pageNum) => (
                    <Button
                      key={pageNum}
                      variant={pageNum === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => goToPage(pageNum)}
                      disabled={loading}
                      className="h-9 w-9"
                    >
                      {pageNum + 1}
                    </Button>
                  ))}
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages - 1 || loading}
                    className="h-9 w-9"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  
                  <span className="text-caption font-mono text-ds-text-muted ml-3">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
                  </span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </Tabs>

      <RequestAssetModal
        open={requestModalOpen}
        onOpenChange={setRequestModalOpen}
        initialTicker={searchTerm}
        searchQuery={searchTerm}
      />
    </div>
  );
};

export default AssetRadar;
