import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Star, ExternalLink, TrendingUp, TrendingDown, Info, Activity, BarChart3, Database, Clock, Target, ShieldAlert, Crosshair } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAssetScore } from "@/hooks/useAssetScore";
import { formatDistanceToNow, differenceInDays, format } from "date-fns";

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

interface Theme { id: string; name: string; }
interface WhereToBuy { name: string; url: string; }
interface AssetData { id: string; ticker: string; exchange: string; name: string; asset_class: string | null; }
interface PriceData { close: number; last_updated_at: string | null; updated_at: string | null; }
interface ActiveTradeSignal {
  id: string;
  entry_price: number | null;
  exit_target: number | null;
  stop_loss: number | null;
  position_size_pct: number | null;
  expires_at: string | null;
  created_at: string;
}

const AU_BROKERS: WhereToBuy[] = [
  { name: "Stake", url: "https://stake.com.au" },
  { name: "SelfWealth", url: "https://selfwealth.com.au" },
  { name: "CommSec", url: "https://commsec.com.au" },
  { name: "IG Markets", url: "https://ig.com/au" },
];

const CRYPTO_BROKERS: WhereToBuy[] = [
  { name: "Binance", url: "https://binance.com" },
  { name: "Coinbase", url: "https://coinbase.com" },
  { name: "Kraken", url: "https://kraken.com" },
  { name: "CoinSpot", url: "https://coinspot.com.au" },
];

const getSentiment = (score: number) => {
  if (score >= 75) return { label: "Strong Buy", color: "text-success" };
  if (score >= 60) return { label: "Buy", color: "text-success" };
  if (score >= 45) return { label: "Neutral", color: "text-muted-foreground" };
  if (score >= 30) return { label: "Sell", color: "text-destructive" };
  return { label: "Strong Sell", color: "text-destructive" };
};

const AssetDetail = () => {
  const location = useLocation();
  const ticker = decodeURIComponent(location.pathname.replace('/asset/', ''));
  
  // Get rank passed from radar page if available
  const navState = location.state as { rank?: number; score?: number; totalLoaded?: number } | null;
  
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<number>(navState?.rank || 0);
  const [totalAssets, setTotalAssets] = useState<number>(navState?.totalLoaded || 0);
  const [batchScore, setBatchScore] = useState<number | null>(navState?.score || null);
  const [rankContext, setRankContext] = useState<string>(navState?.rank ? "in current view" : "");
  const [activeSignal, setActiveSignal] = useState<ActiveTradeSignal | null>(null);
  const { toast } = useToast();

  // Comprehensive scoring from ALL 22 data sources (for breakdown display)
  const scoreResult = useAssetScore(ticker, asset?.id || null, asset?.asset_class || null);
  // Use batch score if available (consistent with radar), otherwise fall back to useAssetScore
  const displayScore = batchScore !== null ? batchScore : scoreResult.score;
  const sentiment = getSentiment(displayScore);

  useEffect(() => {
    const fetchAssetData = async () => {
      if (!ticker) return;
      setLoading(true);
      
      try {
        const { data: assetData } = await supabase
          .from('assets')
          .select('*')
          .ilike('ticker', ticker)
          .maybeSingle();
        
        if (!assetData) { setLoading(false); return; }
        setAsset(assetData);

        // Fetch active trade signal for this ticker
        const { data: signalData } = await supabase
          .from('trade_signals')
          .select('id, entry_price, exit_target, stop_loss, position_size_pct, expires_at, created_at')
          .eq('ticker', assetData.ticker)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        setActiveSignal(signalData ?? null);

        // Fetch latest price data for "last updated" display
        const { data: latestPrice } = await supabase
          .from('prices')
          .select('close, last_updated_at, updated_at')
          .eq('ticker', assetData.ticker)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (latestPrice) {
          setPriceData(latestPrice);
        }

        // Fetch themes
        const { data: signals } = await supabase
          .from('signals')
          .select('id')
          .eq('asset_id', assetData.id)
          .limit(20);

        if (signals?.length) {
          const { data: themeMap } = await supabase
            .from('signal_theme_map')
            .select('theme_id')
            .in('signal_id', signals.map(s => s.id));

          if (themeMap?.length) {
            const { data: themesData } = await supabase
              .from('themes')
              .select('id, name')
              .in('id', [...new Set(themeMap.map(t => t.theme_id))]);
            setThemes(themesData || []);
          }
        }
      } catch (error) {
        console.error("Failed to fetch asset:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssetData();
  }, [ticker]);

  // Calculate score and ranking if not passed from navigation
  useEffect(() => {
    const calculateScoreAndRanking = async () => {
      if (!asset) return;
      
      // If we already have nav state, just compute the score to ensure consistency
      if (navState?.rank && navState?.score) {
        // Score already set from nav state, just ensure we have total count
        if (!totalAssets) {
          const { count } = await supabase
            .from('assets')
            .select('id', { count: 'exact', head: true });
          // Don't override the "in current view" context
        }
        return;
      }
      
      try {
        // Import the batch scoring function to compute scores consistently
        const { computeAssetScoresBatch } = await import('@/lib/assetScoring');
        
        // Get total count of assets
        const { count: totalCount } = await supabase
          .from('assets')
          .select('id', { count: 'exact', head: true });
        
        setTotalAssets(totalCount || 0);
        setRankContext("estimated");
        
        // Compute score for just this asset
        const scoreMap = await computeAssetScoresBatch([{
          id: asset.id,
          ticker: asset.ticker,
          asset_class: asset.asset_class
        }]);
        
        const thisAssetScore = scoreMap.get(asset.id) || 50;
        setBatchScore(thisAssetScore);
        
        // Estimate ranking based on score percentile
        if (totalCount && totalCount > 0) {
          const percentile = thisAssetScore / 100;
          const estimatedRank = Math.max(1, Math.round((1 - percentile) * totalCount + 1));
          setRanking(estimatedRank);
        }
      } catch (error) {
        console.error('Error calculating score and ranking:', error);
      }
    };
    
    calculateScoreAndRanking();
  }, [asset, navState]);

  const handleAddToWatchlist = () => {
    toast({ title: "Added to Watchlist", description: `${ticker} has been added to your watchlist` });
  };

  const getBrokers = () => {
    if (!asset) return [];
    const isCrypto = asset.asset_class === 'crypto' || ticker?.includes('USD');
    return isCrypto ? CRYPTO_BROKERS : AU_BROKERS;
  };

  if (loading || scoreResult.loading) return <div className="p-6">Loading...</div>;
  if (!asset) return <div className="p-6">Asset not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${asset.ticker} - ${asset.name}`}
        description={`Exchange: ${asset.exchange}`}
        action={
          <Button variant="outline" onClick={handleAddToWatchlist}>
            <Star className="h-4 w-4 mr-2" /> Add to Watchlist
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Score Card */}
        <Card>
          <CardHeader><CardTitle>Current Score (0-100)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-5xl font-bold">{displayScore}</div>
            <div className={`flex items-center mt-2 ${scoreResult.scoreChange >= 0 ? 'text-success' : 'text-destructive'}`}>
              {scoreResult.scoreChange >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
              {scoreResult.scoreChange >= 0 ? '+' : ''}{scoreResult.scoreChange} (24h)
            </div>
            <Badge className={`mt-2 ${sentiment.color}`}>{sentiment.label}</Badge>
            
            {/* Last Updated Display */}
            {priceData && (priceData.last_updated_at || priceData.updated_at) && (
              <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Price updated {formatDistanceToNow(new Date(priceData.last_updated_at || priceData.updated_at!), { addSuffix: true })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking */}
        <Card>
          <CardHeader><CardTitle>Ranking {rankContext && <span className="text-sm font-normal text-muted-foreground">({rankContext})</span>}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">#{ranking}</div>
            <p className="text-muted-foreground">
              {rankContext === "in current view" 
                ? `Out of ${totalAssets} assets loaded`
                : `Out of ${totalAssets.toLocaleString()} total assets`
              }
            </p>
          </CardContent>
        </Card>

        {/* Data Sources */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Data Sources</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{scoreResult.dataSourcesUsed.length}</div>
            <p className="text-muted-foreground">{scoreResult.totalSignals} signals analyzed</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {scoreResult.dataSourcesUsed.slice(0, 6).map(src => (
                <Badge key={src} variant="outline" className="text-xs">{src}</Badge>
              ))}
              {scoreResult.dataSourcesUsed.length > 6 && (
                <Badge variant="outline" className="text-xs">+{scoreResult.dataSourcesUsed.length - 6} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Trade Signal */}
      {activeSignal && (
        <Card className="border-success/40 bg-success/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-success">
              <Crosshair className="h-4 w-4" />
              Active Trade Signal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Entry Price</p>
                <p className="font-semibold tabular-nums">
                  {activeSignal.entry_price != null ? `$${activeSignal.entry_price.toFixed(2)}` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Target className="h-3 w-3" /> Target (+15%)
                </p>
                <p className="font-semibold tabular-nums text-success">
                  {activeSignal.exit_target != null ? `$${activeSignal.exit_target.toFixed(2)}` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" /> Stop Loss (-10%)
                </p>
                <p className="font-semibold tabular-nums text-destructive">
                  {activeSignal.stop_loss != null ? `$${activeSignal.stop_loss.toFixed(2)}` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Position Size</p>
                <p className="font-semibold tabular-nums">
                  {activeSignal.position_size_pct != null
                    ? `${(activeSignal.position_size_pct * 100).toFixed(1)}%`
                    : "-"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Signal entered {differenceInDays(new Date(), new Date(activeSignal.created_at))}d ago
              {activeSignal.expires_at && ` · Expires ${format(new Date(activeSignal.expires_at), 'MMM d')}`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Score Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Score Breakdown</CardTitle>
          <CardDescription>Component scores from {scoreResult.dataSourcesUsed.length} data sources</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scoreResult.componentScores.map((component) => (
            <div key={component.key} className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatLabel(component.key)}</span>
                  <Badge variant="outline" className="text-xs">Weight: {component.weight}x</Badge>
                  <Badge variant="secondary" className="text-xs">{component.signalCount} signals</Badge>
                </div>
                <span className={`font-bold ${component.value >= 60 ? 'text-success' : component.value <= 40 ? 'text-destructive' : ''}`}>
                  {component.value}
                </span>
              </div>
              <Progress value={component.value} className="h-2" />
              <p className="text-xs text-muted-foreground">{component.description}</p>
              <div className="flex flex-wrap gap-1">
                {component.dataSources.map(src => (
                  <Badge key={src} variant="outline" className="text-xs">{formatLabel(src)}</Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Themes & Where to Buy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Associated Themes</CardTitle></CardHeader>
          <CardContent>
            {themes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {themes.map(theme => (
                  <Link key={theme.id} to={`/themes/${theme.id}`}>
                    <Badge variant="secondary">{formatLabel(theme.name)}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No direct theme associations yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Where to Buy (AU)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {getBrokers().map(broker => (
                <Button key={broker.name} variant="outline" size="sm" asChild>
                  <a href={broker.url} target="_blank" rel="noopener noreferrer">
                    {broker.name} <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssetDetail;
