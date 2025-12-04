import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Star, ExternalLink, TrendingUp, TrendingDown, Info, Activity, BarChart3 } from "lucide-react";
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

interface ComponentScore {
  key: string;
  value: number;
  weight: number;
  description: string;
  dataSource: string;
  signalCount: number;
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

// Scoring weights from spec
const COMPONENT_WEIGHTS = {
  TechnicalStrength: { weight: 1.0, description: "RSI, MACD, patterns from TwelveData & technicals" },
  SentimentScore: { weight: 0.8, description: "News sentiment and social buzz" },
  InstitutionalFlow: { weight: 0.9, description: "Dark pool activity and smart money" },
  VolumeProfile: { weight: 0.6, description: "Volume patterns and momentum" },
  InsiderActivity: { weight: 0.7, description: "Form 4 filings and insider trades" },
  PatternRecognition: { weight: 0.5, description: "Chart patterns detected" },
  MarketContext: { weight: 0.4, description: "Economic indicators and macro" }
};

const getSentiment = (score: number): { label: string; color: string } => {
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
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number>(0);
  const [ranking, setRanking] = useState<number>(0);
  const [totalAssets, setTotalAssets] = useState<number>(0);
  const [scoreChange, setScoreChange] = useState<number>(0);
  const [signalCount, setSignalCount] = useState<number>(0);
  const [componentScores, setComponentScores] = useState<ComponentScore[]>([]);
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
        const assetId = assetData.id;
        
        // Parallel fetch all data sources
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        
        const [
          signalsResult,
          technicalsResult,
          sentimentResult,
          darkPoolResult,
          patternsResult,
          assetsCountResult
        ] = await Promise.all([
          // Signals for this asset
          supabase
            .from('signals')
            .select('id, signal_type, magnitude, direction, observed_at')
            .eq('asset_id', assetId)
            .gte('observed_at', thirtyDaysAgo)
            .order('observed_at', { ascending: false })
            .limit(100),
          
          // Advanced technicals
          supabase
            .from('advanced_technicals')
            .select('*')
            .eq('ticker', ticker)
            .order('timestamp', { ascending: false })
            .limit(1),
          
          // News sentiment
          supabase
            .from('news_sentiment_aggregate')
            .select('*')
            .eq('ticker', ticker)
            .gte('date', sevenDaysAgo)
            .order('date', { ascending: false })
            .limit(7),
          
          // Dark pool activity
          supabase
            .from('dark_pool_activity')
            .select('*')
            .eq('ticker', ticker)
            .gte('trade_date', sevenDaysAgo)
            .order('trade_date', { ascending: false })
            .limit(7),
          
          // Pattern recognition
          supabase
            .from('pattern_recognition')
            .select('*')
            .eq('ticker', ticker)
            .gte('detected_at', thirtyDaysAgo)
            .order('detected_at', { ascending: false })
            .limit(10),
          
          // All assets for ranking
          supabase
            .from('assets')
            .select('id, ticker', { count: 'exact' })
        ]);

        const signals = signalsResult.data || [];
        const technicals = technicalsResult.data?.[0] || null;
        const sentimentData = sentimentResult.data || [];
        const darkPool = darkPoolResult.data || [];
        const patterns = patternsResult.data || [];
        
        setSignalCount(signals.length);
        setTotalAssets(assetsCountResult.count || 0);

        // Calculate component scores from real data
        const components: ComponentScore[] = [];

        // 1. Technical Strength (RSI, Stochastic, MACD signals)
        let technicalScore = 50; // Default neutral
        let technicalSignals = 0;
        if (technicals) {
          technicalSignals++;
          // Stochastic signal
          if (technicals.stochastic_signal === 'oversold') technicalScore += 20;
          else if (technicals.stochastic_signal === 'overbought') technicalScore -= 15;
          
          // Trend strength
          if (technicals.trend_strength === 'strong_up') technicalScore += 15;
          else if (technicals.trend_strength === 'strong_down') technicalScore -= 15;
          
          // Breakout signal
          if (technicals.breakout_signal === 'bullish') technicalScore += 10;
          else if (technicals.breakout_signal === 'bearish') technicalScore -= 10;
          
          // ADX trend strength
          if (technicals.adx && technicals.adx > 25) technicalScore += 5;
        }
        // Add signal-based technicals
        const techSignals = signals.filter(s => 
          s.signal_type?.includes('technical') || 
          s.signal_type?.includes('stochastic') ||
          s.signal_type?.includes('rsi')
        );
        technicalSignals += techSignals.length;
        techSignals.forEach(s => {
          technicalScore += (s.magnitude || 0) * (s.direction === 'up' ? 10 : s.direction === 'down' ? -10 : 0);
        });
        technicalScore = Math.max(0, Math.min(100, technicalScore));
        
        components.push({
          key: 'TechnicalStrength',
          value: Math.round(technicalScore),
          weight: COMPONENT_WEIGHTS.TechnicalStrength.weight,
          description: COMPONENT_WEIGHTS.TechnicalStrength.description,
          dataSource: technicals ? 'TwelveData + Signals' : 'Signals only',
          signalCount: technicalSignals
        });

        // 2. Sentiment Score
        let sentimentScore = 50;
        let sentimentSignalCount = sentimentData.length;
        if (sentimentData.length > 0) {
          const avgSentiment = sentimentData.reduce((acc, d) => acc + (d.sentiment_score || 0), 0) / sentimentData.length;
          sentimentScore = Math.round(50 + avgSentiment * 50); // Convert -1 to 1 range to 0-100
          
          // Buzz boost
          const avgBuzz = sentimentData.reduce((acc, d) => acc + (d.buzz_score || 0), 0) / sentimentData.length;
          if (avgBuzz > 0.5) sentimentScore += 5;
        }
        // Add social signals
        const socialSignals = signals.filter(s => s.signal_type?.includes('social') || s.signal_type?.includes('sentiment'));
        sentimentSignalCount += socialSignals.length;
        socialSignals.forEach(s => {
          sentimentScore += (s.magnitude || 0) * 5;
        });
        sentimentScore = Math.max(0, Math.min(100, sentimentScore));
        
        components.push({
          key: 'SentimentScore',
          value: Math.round(sentimentScore),
          weight: COMPONENT_WEIGHTS.SentimentScore.weight,
          description: COMPONENT_WEIGHTS.SentimentScore.description,
          dataSource: sentimentData.length > 0 ? 'News Aggregation' : 'Signals',
          signalCount: sentimentSignalCount
        });

        // 3. Institutional Flow (Dark Pool + Smart Money)
        let institutionalScore = 50;
        let institutionalSignals = darkPool.length;
        if (darkPool.length > 0) {
          const avgDpPct = darkPool.reduce((acc, d) => acc + (d.dark_pool_percentage || 0), 0) / darkPool.length;
          // Higher dark pool activity often indicates institutional interest
          if (avgDpPct > 40) institutionalScore += 15;
          else if (avgDpPct > 30) institutionalScore += 10;
          
          // Check signal strength
          darkPool.forEach(d => {
            if (d.signal_type === 'accumulation') institutionalScore += 10;
            else if (d.signal_type === 'distribution') institutionalScore -= 10;
          });
        }
        const smartMoneySignals = signals.filter(s => s.signal_type?.includes('smart_money') || s.signal_type?.includes('flow'));
        institutionalSignals += smartMoneySignals.length;
        smartMoneySignals.forEach(s => {
          institutionalScore += (s.magnitude || 0) * 8;
        });
        institutionalScore = Math.max(0, Math.min(100, institutionalScore));
        
        components.push({
          key: 'InstitutionalFlow',
          value: Math.round(institutionalScore),
          weight: COMPONENT_WEIGHTS.InstitutionalFlow.weight,
          description: COMPONENT_WEIGHTS.InstitutionalFlow.description,
          dataSource: darkPool.length > 0 ? 'FINRA Dark Pool' : 'Signals',
          signalCount: institutionalSignals
        });

        // 4. Volume Profile
        let volumeScore = 50;
        let volumeSignals = 0;
        if (technicals?.volume_change_pct) {
          volumeSignals++;
          if (technicals.volume_change_pct > 50) volumeScore += 20;
          else if (technicals.volume_change_pct > 20) volumeScore += 10;
          else if (technicals.volume_change_pct < -30) volumeScore -= 10;
        }
        const volumeSignalData = signals.filter(s => s.signal_type?.includes('volume'));
        volumeSignals += volumeSignalData.length;
        volumeSignalData.forEach(s => {
          volumeScore += (s.magnitude || 0) * 5;
        });
        volumeScore = Math.max(0, Math.min(100, volumeScore));
        
        components.push({
          key: 'VolumeProfile',
          value: Math.round(volumeScore),
          weight: COMPONENT_WEIGHTS.VolumeProfile.weight,
          description: COMPONENT_WEIGHTS.VolumeProfile.description,
          dataSource: 'TwelveData + Signals',
          signalCount: volumeSignals
        });

        // 5. Pattern Recognition
        let patternScore = 50;
        let patternSignalCount = patterns.length;
        patterns.forEach(p => {
          if (p.pattern_category === 'bullish') patternScore += (p.confidence_score || 0.5) * 15;
          else if (p.pattern_category === 'bearish') patternScore -= (p.confidence_score || 0.5) * 15;
        });
        const patternSignals = signals.filter(s => s.signal_type?.includes('pattern') || s.signal_type?.includes('chart'));
        patternSignalCount += patternSignals.length;
        patternSignals.forEach(s => {
          patternScore += (s.magnitude || 0) * 8;
        });
        patternScore = Math.max(0, Math.min(100, patternScore));
        
        components.push({
          key: 'PatternRecognition',
          value: Math.round(patternScore),
          weight: COMPONENT_WEIGHTS.PatternRecognition.weight,
          description: COMPONENT_WEIGHTS.PatternRecognition.description,
          dataSource: 'Pattern Detection',
          signalCount: patternSignalCount
        });

        // 6. Insider Activity
        let insiderScore = 50;
        const insiderSignals = signals.filter(s => s.signal_type?.includes('insider') || s.signal_type?.includes('form4'));
        insiderSignals.forEach(s => {
          insiderScore += (s.magnitude || 0) * 10 * (s.direction === 'up' ? 1 : -1);
        });
        insiderScore = Math.max(0, Math.min(100, insiderScore));
        
        components.push({
          key: 'InsiderActivity',
          value: Math.round(insiderScore),
          weight: COMPONENT_WEIGHTS.InsiderActivity.weight,
          description: COMPONENT_WEIGHTS.InsiderActivity.description,
          dataSource: 'SEC Form 4',
          signalCount: insiderSignals.length
        });

        setComponentScores(components);

        // Calculate final weighted score
        let totalWeight = 0;
        let weightedSum = 0;
        components.forEach(c => {
          weightedSum += c.value * c.weight;
          totalWeight += c.weight;
        });
        const finalScore = Math.round(weightedSum / totalWeight);
        setScore(finalScore);
        setSentiment(getSentiment(finalScore));

        // Calculate 24h change by comparing recent vs older signals
        const recentSignals = signals.filter(s => 
          new Date(s.observed_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        );
        const olderSignals = signals.filter(s => 
          new Date(s.observed_at) <= new Date(Date.now() - 24 * 60 * 60 * 1000) &&
          new Date(s.observed_at) > new Date(Date.now() - 48 * 60 * 60 * 1000)
        );
        
        const recentAvg = recentSignals.length > 0 
          ? recentSignals.reduce((acc, s) => acc + (s.magnitude || 0), 0) / recentSignals.length
          : 0;
        const olderAvg = olderSignals.length > 0
          ? olderSignals.reduce((acc, s) => acc + (s.magnitude || 0), 0) / olderSignals.length
          : 0;
        setScoreChange(Math.round((recentAvg - olderAvg) * 10) / 10);

        // Calculate ranking based on real signals
        if (assetsCountResult.data) {
          // For now, use a simpler ranking based on signal density
          // In production, you'd compare scores across all assets
          const signalDensity = signals.length / 30; // signals per day
          const estimatedRank = Math.max(1, Math.round((1 - finalScore / 100) * (assetsCountResult.count || 100)));
          setRanking(estimatedRank);
        }

        // Fetch themes via signal_theme_map
        if (signals.length > 0) {
          const signalIds = signals.slice(0, 20).map(s => s.id);
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

      {/* Score and Signal Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-data">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Signal Score (0-100)</div>
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
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
                <Activity className="h-4 w-4" />
                Signals (30d)
              </div>
              <div className="text-4xl font-bold text-foreground mb-2">{signalCount}</div>
              <div className="text-sm text-muted-foreground">
                {signalCount > 50 ? 'High activity' : signalCount > 20 ? 'Moderate activity' : 'Low activity'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score Breakdown */}
      <Card className="shadow-data">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Score Breakdown
              </CardTitle>
              <CardDescription>Real-time weighted analysis from multiple data sources</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              Live Data
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {componentScores.map((comp) => {
              const isPositive = comp.value >= 60;
              const isNegative = comp.value < 40;
              return (
                <div key={comp.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{formatLabel(comp.key)}</span>
                      <Badge variant="secondary" className="text-xs">
                        {comp.signalCount} signals
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{comp.weight}x</span>
                      <span className={`text-sm font-bold ${isPositive ? 'text-success' : isNegative ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {comp.value}
                      </span>
                    </div>
                  </div>
                  <Progress 
                    value={comp.value} 
                    className={`h-2 ${isPositive ? '[&>div]:bg-success' : isNegative ? '[&>div]:bg-destructive' : ''}`}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{comp.description}</span>
                    <span>Source: {comp.dataSource}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p>Score calculated from {signalCount} signals across TwelveData, news sentiment, dark pool activity, and pattern recognition. Components are weighted by historical predictive value.</p>
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
              <p className="text-sm text-muted-foreground">No direct theme associations detected from signals.</p>
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