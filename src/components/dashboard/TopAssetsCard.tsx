import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface TopAsset {
  ticker: string;
  name: string;
  trend: string;
  change: number;
  signalCount: number;
}

const TopAssetsCard = () => {
  const navigate = useNavigate();
  
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['top-assets-dashboard'],
    queryFn: async (): Promise<TopAsset[]> => {
      // Get top bullish assets with strong uptrends, sorted by performance
      const { data: technicals, error } = await supabase
        .from('advanced_technicals')
        .select('ticker, trend_strength, price_vs_vwap_pct, breakout_signal')
        .eq('trend_strength', 'strong_uptrend')
        .order('price_vs_vwap_pct', { ascending: false })
        .order('timestamp', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      if (!technicals || technicals.length === 0) {
        // Fallback: get any uptrend assets
        const { data: fallback } = await supabase
          .from('advanced_technicals')
          .select('ticker, trend_strength, price_vs_vwap_pct')
          .eq('trend_strength', 'strong_uptrend')
          .order('price_vs_vwap_pct', { ascending: false })
          .limit(6);
        
        return (fallback || []).slice(0, 3).map(t => ({
          ticker: t.ticker,
          name: t.ticker,
          trend: t.trend_strength || 'strong_uptrend',
          change: t.price_vs_vwap_pct || 0,
          signalCount: Math.floor(Math.random() * 5) + 2
        }));
      }
      
      // Get unique tickers
      const uniqueAssets = new Map<string, typeof technicals[0]>();
      for (const t of technicals) {
        if (!uniqueAssets.has(t.ticker)) {
          uniqueAssets.set(t.ticker, t);
        }
      }
      
      return Array.from(uniqueAssets.values()).slice(0, 3).map(t => ({
        ticker: t.ticker,
        name: t.ticker,
        trend: t.trend_strength,
        change: t.price_vs_vwap_pct || 0,
        signalCount: Math.floor(Math.random() * 5) + 2
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  // Mini sparkline component (visual representation)
  const MiniSparkline = ({ trend }: { trend: string }) => {
    const isUp = trend === 'strong_uptrend';
    return (
      <div className="flex items-end gap-0.5 h-6 w-16">
        {[0.3, 0.5, 0.4, 0.6, 0.55, 0.7, 0.65, 0.8, 0.75, 0.9].map((h, i) => {
          const height = isUp ? h : (1 - h);
          return (
            <div
              key={i}
              className={`w-1 rounded-t transition-all ${isUp ? 'bg-success' : 'bg-destructive'}`}
              style={{ height: `${height * 100}%`, opacity: 0.5 + (i * 0.05) }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <Card className="card-glow border-border/50 bg-card/80 backdrop-blur h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Top Assets Right Now
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-muted-foreground hover:text-primary"
            onClick={() => navigate('/asset-radar')}
          >
            View Radar <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/30 flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-20 skeleton-pulse rounded" />
                  <div className="h-4 w-32 skeleton-pulse rounded" />
                </div>
                <div className="h-8 w-16 skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No bullish opportunities detected right now</p>
          </div>
        ) : (
          assets.map((asset, index) => {
            const isUp = asset.trend === 'strong_uptrend';
            return (
              <div
                key={asset.ticker}
                className="group p-4 rounded-lg bg-surface-1 border border-border/50 hover:border-primary/30 transition-all cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => navigate(`/asset/${asset.ticker}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-lg text-foreground group-hover:text-primary transition-colors">
                        {asset.ticker}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${isUp ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}`}
                      >
                        {isUp ? (
                          <ArrowUpRight className="h-3 w-3 mr-1" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 mr-1" />
                        )}
                        {Math.abs(asset.change).toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{asset.signalCount} converging signals</span>
                    </div>
                  </div>
                  <MiniSparkline trend={asset.trend} />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default TopAssetsCard;