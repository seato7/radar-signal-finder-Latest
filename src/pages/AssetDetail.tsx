import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Star, ExternalLink, TrendingUp, TrendingDown, Info, Activity, BarChart3, Database, Clock } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAssetScore } from "@/hooks/useAssetScore";
import { formatDistanceToNow } from "date-fns";

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
  const ticker = location.pathname.replace('/asset/', '');
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<number>(0);
  const [totalAssets, setTotalAssets] = useState<number>(0);
  const { toast } = useToast();

  // Comprehensive scoring from ALL 22 data sources
  const scoreResult = useAssetScore(ticker, asset?.id || null, asset?.asset_class || null);
  const sentiment = getSentiment(scoreResult.score);

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
        
        const { count } = await supabase.from('assets').select('id', { count: 'exact', head: true });
        setTotalAssets(count || 0);
        setRanking(Math.max(1, Math.round((1 - scoreResult.score / 100) * (count || 100))));

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
  }, [ticker, scoreResult.score]);

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
            <div className="text-5xl font-bold">{scoreResult.score}</div>
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
          <CardHeader><CardTitle>Ranking</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">#{ranking}</div>
            <p className="text-muted-foreground">Out of {totalAssets} assets</p>
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
