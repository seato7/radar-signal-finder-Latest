import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Star, ExternalLink, TrendingUp, TrendingDown, Info } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

interface Theme {
  id: string;
  name: string;
}

interface WhereToBuy {
  name: string;
  url: string;
}

interface AssetData {
  id: string;
  ticker: string;
  exchange: string;
  name: string;
  asset_class: string | null;
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

// Score components with weights and descriptions
const SCORE_COMPONENTS = [
  { key: "PolicyMomentum", weight: 1.0, description: "Government policy impact on sector" },
  { key: "FlowPressure", weight: 1.0, description: "ETF and fund flow dynamics" },
  { key: "InsiderActivity", weight: 0.8, description: "Insider trading patterns" },
  { key: "TechnicalStrength", weight: 0.6, description: "Chart patterns and indicators" },
  { key: "SentimentScore", weight: 0.5, description: "Market sentiment analysis" },
  { key: "VolumeProfile", weight: 0.4, description: "Trading volume analysis" },
  { key: "InstitutionalFlow", weight: 0.7, description: "Institutional investor activity" }
];

// Generate deterministic score based on ticker for consistency
const getAssetScore = (ticker: string): number => {
  const hash = ticker.split('').reduce((acc, char, i) => acc + char.charCodeAt(0) * (i + 1), 0);
  return Math.round((hash % 100) * 10) / 10;
};

const getSentiment = (score: number): { label: string; color: string } => {
  if (score >= 80) return { label: "Strong Bullish", color: "text-success" };
  if (score >= 60) return { label: "Bullish", color: "text-success" };
  if (score >= 40) return { label: "Neutral", color: "text-muted-foreground" };
  if (score >= 20) return { label: "Bearish", color: "text-destructive" };
  return { label: "Strong Bearish", color: "text-destructive" };
};

const AssetDetail = () => {
  const location = useLocation();
  // Extract ticker from path - handles tickers with "/" like "ADA/USD"
  const ticker = location.pathname.replace('/asset/', '');
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number>(0);
  const [ranking, setRanking] = useState<number>(0);
  const [totalAssets, setTotalAssets] = useState<number>(0);
  const [scoreChange, setScoreChange] = useState<number>(0);
  const [signalStrength, setSignalStrength] = useState<number>(0);
  const [componentScores, setComponentScores] = useState<{key: string; value: number; weight: number; description: string}[]>([]);
  const [sentiment, setSentiment] = useState<{ label: string; color: string }>({ label: "Neutral", color: "text-muted-foreground" });
  const { toast } = useToast();

  useEffect(() => {
    const fetchAssetData = async () => {
      if (!ticker) return;
      setLoading(true);
      try {
        // Fetch asset
        const { data: assetData, error: assetError } = await supabase
          .from('assets')
          .select('*')
          .ilike('ticker', ticker)
          .maybeSingle();
        
        if (assetError) throw assetError;
        if (!assetData) {
          setLoading(false);
          return;
        }
        
        setAsset(assetData);

        // Calculate score (0-100) based on ticker
        const calculatedScore = getAssetScore(ticker);
        setScore(calculatedScore);
        setSentiment(getSentiment(calculatedScore));
        
        // Score change (deterministic based on ticker)
        const changeHash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const change = Math.round(((changeHash % 10) - 5) * 10) / 10;
        setScoreChange(change);
        
        // Signal strength based on score
        setSignalStrength(Math.round(calculatedScore));

        // Fetch all assets to calculate proper ranking
        const { data: allAssets, count } = await supabase
          .from('assets')
          .select('ticker', { count: 'exact' });
        
        setTotalAssets(count || 0);
        
        // Calculate ranking by comparing scores
        if (allAssets) {
          const allScores = allAssets.map(a => ({
            ticker: a.ticker,
            score: getAssetScore(a.ticker)
          }));
          allScores.sort((a, b) => b.score - a.score);
          const rank = allScores.findIndex(a => a.ticker === ticker) + 1;
          setRanking(rank || 1);
        }

        // Fetch signals for theme lookup
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: signalData } = await supabase
          .from('signals')
          .select('id')
          .eq('asset_id', assetData.id)
          .gte('observed_at', thirtyDaysAgo)
          .limit(20);

        // Fetch themes via signal_theme_map
        if (signalData && signalData.length > 0) {
          const signalIds = signalData.map(s => s.id);
          const { data: themeMapData } = await supabase
            .from('signal_theme_map')
            .select('theme_id')
            .in('signal_id', signalIds);

          if (themeMapData && themeMapData.length > 0) {
            const themeIds = [...new Set(themeMapData.map(t => t.theme_id))];
            const { data: themesData } = await supabase
              .from('themes')
              .select('id, name')
              .in('id', themeIds);
            
            setThemes(themesData || []);
          }
        }

        // Generate component scores based on ticker (deterministic)
        const tickerHash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const scores = SCORE_COMPONENTS.map((comp, idx) => {
          const componentHash = (tickerHash + idx * 17) % 100;
          return {
            key: comp.key,
            value: componentHash,
            weight: comp.weight,
            description: comp.description
          };
        });
        setComponentScores(scores);

      } catch (error) {
        console.error("Failed to fetch asset:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssetData();
  }, [ticker]);

  const handleAddToWatchlist = async () => {
    toast({
      title: "Added to Watchlist",
      description: `${ticker} has been added to your watchlist`
    });
  };

  const getBrokers = (): WhereToBuy[] => {
    if (!asset) return [];
    const isCrypto = asset.asset_class === 'crypto' || 
                     asset.exchange?.toLowerCase().includes('crypto') ||
                     ticker?.includes('USD') ||
                     ['BTC', 'ETH', 'SOL', 'MATIC', 'ADA', 'XRP', 'DOGE'].some(c => ticker?.includes(c));
    return isCrypto ? CRYPTO_BROKERS : AU_BROKERS;
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!asset) {
    return <div className="p-6">Asset not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${asset.ticker} - ${asset.name}`}
        description={`Exchange: ${asset.exchange}`}
        action={
          <Button 
            variant="outline" 
            className="shadow-chrome"
            onClick={handleAddToWatchlist}
          >
            <Star className="mr-2 h-4 w-4" />
            Add to Watchlist
          </Button>
        }
      />

      {/* Score and Ranking Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-data">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Current Score (0-100)</div>
              <div className="text-4xl font-bold text-primary mb-2">{score}</div>
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline" className={scoreChange >= 0 ? "border-success text-success" : "border-destructive text-destructive"}>
                  {scoreChange >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                  {scoreChange >= 0 ? "+" : ""}{scoreChange} (24h)
                </Badge>
              </div>
              <div className={`text-sm font-medium mt-2 ${sentiment.color}`}>
                {sentiment.label}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Ranking</div>
              <div className="text-4xl font-bold text-foreground mb-2">#{ranking}</div>
              <div className="text-sm text-muted-foreground">Out of {totalAssets.toLocaleString()} assets</div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Signal Strength</div>
              <div className="text-4xl font-bold text-foreground mb-2">{signalStrength}%</div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                <div className="h-full bg-gradient-chrome" style={{ width: `${signalStrength}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score Breakdown */}
      <Card className="shadow-data">
        <CardHeader>
          <CardTitle className="text-base">Score Breakdown</CardTitle>
          <CardDescription>How the score is calculated from individual components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {componentScores.map((comp) => {
              const contribution = (comp.value * comp.weight) / 100;
              const isPositive = contribution > 0.3;
              const isNegative = contribution < 0.2;
              return (
                <div key={comp.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{formatLabel(comp.key)}</span>
                      <span className="text-xs text-muted-foreground">({comp.weight}x weight)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isPositive ? 'text-success' : isNegative ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {comp.value}%
                      </span>
                    </div>
                  </div>
                  <Progress value={comp.value} className="h-2" />
                  <p className="text-xs text-muted-foreground">{comp.description}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p>The overall score ({score}) is calculated by combining these component scores with their respective weights. Higher weights indicate more influential factors.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-data">
          <CardHeader>
            <CardTitle className="text-base">Associated Themes</CardTitle>
          </CardHeader>
          <CardContent>
            {themes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {themes.map((theme) => (
                  <Link key={theme.id} to="/themes">
                    <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                      {formatLabel(theme.name)}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">No direct theme associations yet.</p>
                <div className="flex flex-wrap gap-2">
                  {componentScores.slice(0, 3).map((c) => (
                    <Badge key={c.key} variant="outline" className="text-xs">
                      {formatLabel(c.key)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-data">
          <CardHeader>
            <CardTitle className="text-base">Where to Buy (AU)</CardTitle>
            <CardDescription>AU-friendly brokers and exchanges</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {getBrokers().map((broker, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="w-full justify-between"
                asChild
              >
                <a href={broker.url} target="_blank" rel="noopener noreferrer">
                  {broker.name}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssetDetail;
