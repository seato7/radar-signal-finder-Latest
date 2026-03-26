import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, Filter, ExternalLink, TrendingUp, DollarSign, Bitcoin, Wheat, BarChart3, Clock, ArrowUpDown, ChevronLeft, ChevronRight, Zap, Crosshair } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

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
  if (mass >= 0.017) return { level: "high", label: "High", className: "bg-success/20 text-success border-success/30" }; // Top 10%
  if (mass >= 0.0067) return { level: "medium", label: "Med", className: "bg-primary/20 text-primary border-primary/30" }; // Top 25%
  if (mass >= 0.001) return { level: "low", label: "Low", className: "bg-muted text-muted-foreground border-border" }; // Scored
  return { level: "none", label: "None", className: "bg-muted/50 text-muted-foreground/50 border-border/50" };
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
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<AssetClassTab>("all");
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
      // SCORE-BASED SORTING: Use pre-computed computed_score column
      // ═══════════════════════════════════════════════════════════════════
      if ((currentSortBy === "score-desc" || currentSortBy === "score-asc") && !searchTerm) {
        // Fetch assets ordered by pre-computed score from database
        let assetQuery = supabase
          .from('assets')
          .select('id, ticker, name, exchange, asset_class, computed_score, hybrid_score, score_computed_at, score_explanation', { count: 'exact' });

        if (tabConfig?.filter) {
          assetQuery = assetQuery.eq('asset_class', tabConfig.filter);
        }

        // Order by computed_score directly in database
        const sortOrder = currentSortBy === "score-desc" ? { ascending: false } : { ascending: true };
        
        const { data: sortedAssets, count, error: assetError } = await assetQuery
          .order('computed_score', { ...sortOrder, nullsFirst: false })
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        if (assetError) throw assetError;

        const assets = (sortedAssets || []) as AssetRow[];
        totalCount = count || 0;

        if (assets.length === 0) {
          setAssets([]);
          setTotal(count || 0);
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
            priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || '', close: p.close });
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
      if (currentSortBy === "recent" && !searchTerm) {
        let priceQuery = supabase
          .from('prices')
          .select('ticker, close, last_updated_at', { count: 'exact' })
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

        let assetQuery = supabase
          .from('assets')
          .select('id, ticker, name, exchange, asset_class, computed_score, hybrid_score, score_explanation')
          .in('ticker', recentTickers);

        if (tabConfig?.filter) {
          assetQuery = assetQuery.eq('asset_class', tabConfig.filter);
        }

        const { data: matchingAssets, error: assetError } = await assetQuery;
        if (assetError) throw assetError;

        const priceMap = new Map<string, { lastUpdated: string; close: number }>();
        (recentPrices || []).forEach(p => {
          if (!priceMap.has(p.ticker)) {
            priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || '', close: p.close });
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
      // Default mode: fetch assets first, then enrich with prices
      // ═══════════════════════════════════════════════════════════════════
      let query = supabase
        .from('assets')
        .select('id, ticker, name, exchange, asset_class, computed_score, hybrid_score, score_explanation', { count: 'exact' });

      if (tabConfig?.filter) {
        query = query.eq('asset_class', tabConfig.filter);
      }

      if (searchTerm) {
        query = query.or(`ticker.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,exchange.ilike.%${searchTerm}%`);
      }

      const { data, error, count } = await query
        .order('ticker')
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const fetchedAssets = (data || []) as AssetRow[];

      assetsData = fetchedAssets;
      totalCount = count || 0;

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
          priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || '', close: p.close });
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
        return sorted.sort((a, b) => {
          if (a.priceChange === null && b.priceChange === null) return 0;
          if (a.priceChange === null) return 1;
          if (b.priceChange === null) return -1;
          return b.priceChange - a.priceChange;
        });
      case "losers":
        return sorted.sort((a, b) => {
          if (a.priceChange === null && b.priceChange === null) return 0;
          if (a.priceChange === null) return 1;
          if (b.priceChange === null) return -1;
          return a.priceChange - b.priceChange;
        });
      default:
        return sorted;
    }
  }, [assets, sortBy]);

  useEffect(() => {
    setPage(0);
    const debounce = setTimeout(() => fetchAssets(0, activeTab, sortBy), 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, activeTab, sortBy]);

  // Auto-refresh every 30 seconds to pick up new scores
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAssets(page, activeTab, sortBy);
    }, REFRESH_INTERVAL);
    
    return () => clearInterval(interval);
  }, [page, activeTab, sortBy]);

  // Fetch active trade signal tickers once on mount for Top Pick badges
  useEffect(() => {
    supabase
      .from('trade_signals')
      .select('ticker')
      .eq('status', 'active')
      .then(({ data }) => {
        setActiveSignalTickers(new Set((data ?? []).map((r: any) => r.ticker)));
      });
  }, []);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Radar"
        description={getTabDescription()}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 mb-4">
          {ASSET_CLASS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1 px-2 text-xs sm:text-sm">
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <Card className="shadow-data">
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
          {loading ? (
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
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? `No assets found matching "${searchTerm}"` : "No assets available"}
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sortedAssets.map((asset, index) => {
                  const sentiment = getSentiment(asset.score);
                  const signalStrengthInfo = getSignalStrength(asset.signalMass);
                  const displayRank = index + 1;
                  return (
                    <Link
                      key={asset.id}
                      to={`/asset/${encodeURIComponent(asset.ticker)}`}
                      state={{ rank: displayRank, score: asset.score, totalLoaded: sortedAssets.length }}
                      className="block"
                    >
                      <div className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors h-full">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg text-primary">{asset.ticker}</h3>
                            {activeSignalTickers.has(asset.ticker) && (
                              <Badge className="bg-success/20 text-success border-success/30 border text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                                <Crosshair className="h-2.5 w-2.5" />
                                Top Pick
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Signal strength badge */}
                            {asset.signalStrength !== "none" && (
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] px-1.5 py-0 ${signalStrengthInfo.className}`}
                                title={`Signal strength: ${signalStrengthInfo.label}`}
                              >
                                <Zap className="h-2.5 w-2.5 mr-0.5" />
                                {signalStrengthInfo.label}
                              </Badge>
                            )}
                            <Badge variant={sentiment.variant} className="text-xs">
                              {asset.score}
                            </Badge>
                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{asset.name}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-primary text-primary-foreground">
                              {formatExchange(asset.exchange)}
                            </Badge>
                            {asset.priceChange !== null && typeof asset.priceChange === 'number' && (
                              <span className={`text-xs font-medium ${asset.priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {asset.priceChange >= 0 ? '+' : ''}{asset.priceChange.toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {asset.lastUpdated ? (
                              <span>{formatDistanceToNow(new Date(asset.lastUpdated), { addSuffix: true })}</span>
                            ) : (
                              <span className="text-destructive/70">No data</span>
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
                  
                  <span className="text-sm text-muted-foreground ml-3">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
                  </span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </Tabs>
    </div>
  );
};

export default AssetRadar;
