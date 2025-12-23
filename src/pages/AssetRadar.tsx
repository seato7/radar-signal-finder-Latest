import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, ExternalLink, TrendingUp, DollarSign, Bitcoin, Wheat, BarChart3, Clock, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { computeAssetScoresBatch } from "@/lib/assetScoring";

type AssetClassTab = "all" | "stock" | "forex" | "crypto" | "commodity" | "etf";
type SortOption = "score-desc" | "score-asc" | "recent" | "alpha-asc" | "alpha-desc" | "gainers" | "losers";

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

const getSentiment = (score: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
  if (score >= 80) return { label: "Strong Bullish", variant: "default" };
  if (score >= 60) return { label: "Bullish", variant: "secondary" };
  if (score >= 40) return { label: "Neutral", variant: "outline" };
  if (score >= 20) return { label: "Bearish", variant: "destructive" };
  return { label: "Strong Bearish", variant: "destructive" };
};

const PAGE_SIZE = 50;

// Full Standard tier cycle is 24 hours, add buffer for safety
const FULL_CYCLE_HOURS = 26;

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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchAssets = async (pageNum: number, assetClass: AssetClassTab = activeTab, currentSortBy: SortOption = sortBy) => {
    setLoading(true);
    
    try {
      // Use cycle-based cutoff instead of "today" - covers full Standard tier cycle
      const cutoffTime = new Date(Date.now() - FULL_CYCLE_HOURS * 60 * 60 * 1000).toISOString();
      const tabConfig = ASSET_CLASS_TABS.find(t => t.value === assetClass);

      let assetsData: any[] = [];
      let totalCount = 0;

      // For "Most Recently Updated" mode, fetch from prices first to get global ordering
      if (currentSortBy === "recent" && !searchTerm) {
        // Step 1: Get prices within the cycle window ordered by last_updated_at, paginated
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

        // Step 2: Fetch assets for these tickers
        let assetQuery = supabase
          .from('assets')
          .select('*')
          .in('ticker', recentTickers);

        // Filter by asset class if needed
        if (tabConfig?.filter) {
          assetQuery = assetQuery.eq('asset_class', tabConfig.filter);
        }

        const { data: matchingAssets, error: assetError } = await assetQuery;
        if (assetError) throw assetError;

        // Build price map from what we already fetched (dedupe to most recent per ticker)
        const priceMap = new Map<string, { lastUpdated: string; close: number }>();
        (recentPrices || []).forEach(p => {
          if (!priceMap.has(p.ticker)) {
            priceMap.set(p.ticker, { lastUpdated: p.last_updated_at || '', close: p.close });
          }
        });

        // Reorder assets to match the price recency order
        const tickerOrder = new Map(recentTickers.map((t, i) => [t, i]));
        assetsData = (matchingAssets || [])
          .filter(a => tickerOrder.has(a.ticker))
          .sort((a, b) => (tickerOrder.get(a.ticker) ?? 999) - (tickerOrder.get(b.ticker) ?? 999));

        // Get previous day's prices for change calculation (use most recent 2 days)
        const previousDayCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: previousPriceData } = await supabase
          .from('prices')
          .select('ticker, close, date')
          .in('ticker', recentTickers)
          .gte('last_updated_at', previousDayCutoff)
          .order('date', { ascending: false });

        // Build previous price map (second-most-recent price per ticker for change calc)
        const previousPriceMap = new Map<string, number>();
        const seenTickers = new Set<string>();
        (previousPriceData || []).forEach(p => {
          if (seenTickers.has(p.ticker)) {
            // This is the second occurrence = previous price
            if (!previousPriceMap.has(p.ticker)) {
              previousPriceMap.set(p.ticker, p.close);
            }
          } else {
            seenTickers.add(p.ticker);
          }
        });

        // Compute scores
        const assetsForScoring = assetsData.map(a => ({
          id: a.id,
          ticker: a.ticker,
          asset_class: a.asset_class
        }));
        const scoreMap = await computeAssetScoresBatch(assetsForScoring);

        // Build enhanced assets
        const enhancedAssets: AssetWithScore[] = assetsData.map((asset) => {
          const score = scoreMap.get(asset.id) ?? 50;
          const sentiment = getSentiment(score);
          const priceInfo = priceMap.get(asset.ticker);
          const previousPrice = previousPriceMap.get(asset.ticker);
          
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
            priceChange
          };
        });

        setAssets(enhancedAssets);
        setTotal(priceCount || 0);
        setLoading(false);
        return;
      }

      // Default mode: fetch assets first, then enrich with prices
      let query = supabase
        .from('assets')
        .select('*', { count: 'exact' });

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

      assetsData = data || [];
      totalCount = count || 0;

      // Fetch prices within cycle window for accurate last_updated_at timestamps
      const tickers = assetsData.map(a => a.ticker);
      
      const { data: recentPriceData } = await supabase
        .from('prices')
        .select('ticker, close, date, last_updated_at')
        .in('ticker', tickers)
        .gte('last_updated_at', cutoffTime)
        .order('last_updated_at', { ascending: false });

      const priceData = recentPriceData || [];

      // Build maps: most recent price per ticker and previous price for change calc
      const priceMap = new Map<string, { lastUpdated: string; close: number }>();
      const previousPriceMap = new Map<string, number>();
      const seenTickers = new Set<string>();
      
      priceData.forEach(p => {
        if (!priceMap.has(p.ticker)) {
          // First occurrence = most recent price
          priceMap.set(p.ticker, { 
            lastUpdated: p.last_updated_at || '', 
            close: p.close 
          });
          seenTickers.add(p.ticker);
        } else if (!previousPriceMap.has(p.ticker)) {
          // Second occurrence = previous price for change calculation
          previousPriceMap.set(p.ticker, p.close);
        }
      });
      
      // Calculate price changes
      const priceChangeMap = new Map<string, number | null>();
      priceMap.forEach((info, ticker) => {
        const previousPrice = previousPriceMap.get(ticker);
        if (previousPrice && previousPrice !== 0) {
          priceChangeMap.set(ticker, Math.round(((info.close - previousPrice) / previousPrice) * 10000) / 100);
        } else {
          priceChangeMap.set(ticker, null);
        }
      });

      const assetsForScoring = assetsData.map(a => ({
        id: a.id,
        ticker: a.ticker,
        asset_class: a.asset_class
      }));
      const scoreMap = await computeAssetScoresBatch(assetsForScoring);

      const enhancedAssets: AssetWithScore[] = assetsData.map((asset) => {
        const score = scoreMap.get(asset.id) ?? 50;
        const sentiment = getSentiment(score);
        const priceInfo = priceMap.get(asset.ticker);
        
        return {
          id: asset.id,
          ticker: asset.ticker,
          name: asset.name,
          exchange: asset.exchange,
          asset_class: asset.asset_class,
          score,
          sentiment: sentiment.label,
          lastUpdated: priceInfo?.lastUpdated || null,
          priceChange: priceChangeMap.get(asset.ticker) ?? null
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

  // Sort assets based on selected option
  const sortedAssets = useMemo(() => {
    const sorted = [...assets];
    switch (sortBy) {
      case "score-desc":
        return sorted.sort((a, b) => b.score - a.score);
      case "score-asc":
        return sorted.sort((a, b) => a.score - b.score);
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

  // Generate visible page numbers (show max 5 pages around current)
  const getVisiblePages = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(0, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages - 1, start + maxVisible - 1);
    
    // Adjust start if we're near the end
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
                  // Calculate rank within current sorted view (1-indexed)
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
                          <h3 className="font-bold text-lg text-primary">{asset.ticker}</h3>
                          <div className="flex items-center gap-2">
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
                              {asset.exchange}
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
