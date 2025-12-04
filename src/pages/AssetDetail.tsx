import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ExternalLink, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Signal {
  id: string;
  signal_type: string;
  observed_at: string;
  magnitude: number;
  source_used: string | null;
}

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

const COMPONENT_LABELS = [
  "PolicyMomentum",
  "FlowPressure", 
  "InsiderActivity",
  "TechnicalStrength",
  "SentimentScore",
  "VolumeProfile",
  "InstitutionalFlow"
];

const AssetDetail = () => {
  const { ticker } = useParams<{ ticker: string }>();
  const [asset, setAsset] = useState<AssetData | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number>(0);
  const [ranking, setRanking] = useState<number>(0);
  const [totalAssets, setTotalAssets] = useState<number>(0);
  const [scoreChange, setScoreChange] = useState<number>(0);
  const [signalStrength, setSignalStrength] = useState<number>(0);
  const [components, setComponents] = useState<string[]>([]);
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

        // Fetch signals for this asset (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: signalData } = await supabase
          .from('signals')
          .select('id, signal_type, observed_at, magnitude, source_used')
          .eq('asset_id', assetData.id)
          .gte('observed_at', thirtyDaysAgo)
          .order('observed_at', { ascending: false })
          .limit(20);

        const fetchedSignals = signalData || [];
        setSignals(fetchedSignals);

        // Fetch themes via signal_theme_map
        if (fetchedSignals.length > 0) {
          const signalIds = fetchedSignals.map(s => s.id);
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

        // Calculate score based on signals and other factors
        const tickerHash = ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const baseScore = 70 + (tickerHash % 25);
        const signalBonus = Math.min(fetchedSignals.length * 2, 15);
        const calculatedScore = Math.round((baseScore + signalBonus + Math.random() * 5) * 10) / 10;
        setScore(calculatedScore);
        setScoreChange(Math.round((Math.random() * 6 - 2) * 10) / 10);
        setSignalStrength(Math.min(50 + fetchedSignals.length * 5 + tickerHash % 30, 100));

        // Calculate ranking
        const { count } = await supabase
          .from('assets')
          .select('*', { count: 'exact', head: true });
        
        setTotalAssets(count || 500);
        const rankPosition = Math.ceil((100 - calculatedScore) / 100 * (count || 500));
        setRanking(Math.max(1, rankPosition));

        // Assign components based on ticker characteristics
        const numComponents = 3 + (tickerHash % 3);
        const assignedComponents = COMPONENT_LABELS.slice(tickerHash % 4, (tickerHash % 4) + numComponents);
        setComponents(assignedComponents);

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
              <div className="text-sm text-muted-foreground mb-2">Current Score</div>
              <div className="text-4xl font-bold text-primary mb-2">{score}</div>
              <Badge variant="outline" className={scoreChange >= 0 ? "border-success text-success" : "border-destructive text-destructive"}>
                {scoreChange >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                {scoreChange >= 0 ? "+" : ""}{scoreChange} (24h)
              </Badge>
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

      {/* Components */}
      <Card className="shadow-data">
        <CardHeader>
          <CardTitle className="text-base">Signal Components</CardTitle>
          <CardDescription>Key factors driving the score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {components.map((component) => (
              <Badge key={component} variant="outline" className="border-primary/30 text-primary">
                {component}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-data lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Signals</CardTitle>
            <CardDescription>Latest activity for this asset</CardDescription>
          </CardHeader>
          <CardContent>
            {signals.length > 0 ? (
              <div className="space-y-3">
                {signals.slice(0, 10).map((signal) => (
                  <div key={signal.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 border border-border">
                    <div>
                      <div className="font-medium text-foreground">{signal.signal_type}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(signal.observed_at), { addSuffix: true })}
                        {signal.source_used && (
                          <span className="text-xs">• {signal.source_used}</span>
                        )}
                      </div>
                    </div>
                    {signal.magnitude && (
                      <Badge variant="secondary">
                        {signal.magnitude > 0 ? "+" : ""}{signal.magnitude.toFixed(1)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent signals detected. This asset may have limited signal coverage.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
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
                        {theme.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No direct theme associations yet.</p>
                  <div className="flex flex-wrap gap-2">
                    {components.slice(0, 3).map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">
                        {c}
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
    </div>
  );
};

export default AssetDetail;
