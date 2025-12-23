import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, ExternalLink, TrendingUp, DollarSign, Bitcoin, Wheat, BarChart3, Clock, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchAssets = async (pageNum: number, append: boolean = false, assetClass: AssetClassTab = activeTab) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      let query = supabase
        .from('assets')
        .select('*', { count: 'exact' });

      // Filter by asset class if not "all"
      const tabConfig = ASSET_CLASS_TABS.find(t => t.value === assetClass);
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

      // Fetch latest prices for these assets (get last 2 prices per ticker to calculate change)
      const tickers = (data || []).map(a => a.ticker);
      const { data: priceData } = await supabase
        .from('prices')
        .select('ticker, close, date, last_updated_at')
        .in('ticker', tickers)
        .order('date', { ascending: false });

      // Create maps for ticker -> latest update time and price change
      const priceMap = new Map<string, { lastUpdated: string; priceChange: number | null }>();
      const tickerPrices = new Map<string, number[]>();
      
      priceData?.forEach(p => {
        const prices = tickerPrices.get(p.ticker) || [];
        if (prices.length < 2) {
          prices.push(p.close);
          tickerPrices.set(p.ticker, prices);
        }
        if (!priceMap.has(p.ticker)) {
          priceMap.set(p.ticker, { 
            lastUpdated: p.last_updated_at || '', 
            priceChange: null 
          });
        }
      });

      // Calculate price change percentage
      tickerPrices.forEach((prices, ticker) => {
        if (prices.length >= 2 && prices[1] !== 0) {
          const change = ((prices[0] - prices[1]) / prices[1]) * 100;
          const existing = priceMap.get(ticker);
          if (existing) {
            existing.priceChange = Math.round(change * 100) / 100;
          }
        }
      });

      // Compute real scores for all assets using data-driven scoring
      const assetsForScoring = (data || []).map(a => ({
        id: a.id,
        ticker: a.ticker,
        asset_class: a.asset_class
      }));
      const scoreMap = await computeAssetScoresBatch(assetsForScoring);

      // Enhance assets with computed scores, last updated, and price change
      const enhancedAssets: AssetWithScore[] = (data || []).map((asset) => {
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
          priceChange: priceInfo?.priceChange ?? null
        };
      });

      if (append) {
        setAssets(prev => [...prev, ...enhancedAssets]);
      } else {
        setAssets(enhancedAssets);
      }
      
      setTotal(count || 0);
      setHasMore((pageNum + 1) * PAGE_SIZE < (count || 0));
    } catch (error) {
      console.error("Failed to fetch assets:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
    const debounce = setTimeout(() => fetchAssets(0, false, activeTab), 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as AssetClassTab);
    setPage(0);
    setAssets([]);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAssets(nextPage, true);
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
              {hasMore && (
                <div className="flex justify-center mt-6">
                  <Button 
                    onClick={loadMore} 
                    disabled={loadingMore}
                    variant="outline"
                  >
                    {loadingMore ? "Loading..." : `Load More (${assets.length} of ${total})`}
                  </Button>
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
