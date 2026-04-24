import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Activity, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TickerLink } from "@/lib/tickerLink";

interface TopMover {
  ticker: string;
  trend: string;
  change: number;
  breakout: string;
}

const MarketRadar = () => {
  const { data: topMovers = [], isLoading } = useQuery({
    queryKey: ['market-radar-movers'],
    queryFn: async (): Promise<TopMover[]> => {
      const { data, error } = await supabase
        .from('advanced_technicals')
        .select('ticker, trend_strength, price_vs_vwap_pct, breakout_signal')
        .in('trend_strength', ['strong_uptrend', 'strong_downtrend'])
        .order('timestamp', { ascending: false })
        .limit(8);
      
      if (error) throw error;
      return (data || []).map(d => ({
        ticker: d.ticker,
        trend: d.trend_strength,
        change: d.price_vs_vwap_pct || 0,
        breakout: d.breakout_signal || 'range_bound'
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const bulls = topMovers.filter(m => m.trend === 'strong_uptrend').slice(0, 4);
  const bears = topMovers.filter(m => m.trend === 'strong_downtrend').slice(0, 4);

  const SkeletonCard = () => (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-3">
        <div className="h-8 w-16 skeleton-pulse rounded" />
        <div className="h-4 w-20 skeleton-pulse rounded" />
      </div>
      <div className="h-6 w-14 skeleton-pulse rounded" />
    </div>
  );

  return (
    <Card className="card-glow border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          Today's Market Radar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bullish Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-success">
            <TrendingUp className="h-4 w-4" />
            <span>Strong Momentum</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : bulls.length === 0 ? (
              <div className="col-span-2 text-center py-4 text-muted-foreground text-sm">
                No strong bullish signals detected
              </div>
            ) : (
              bulls.map((mover) => (
                <div
                  key={mover.ticker}
                  className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/20 hover:border-success/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <TickerLink ticker={mover.ticker} className="font-mono font-bold text-foreground" />
                    {mover.breakout === 'resistance_break' && (
                      <Zap className="h-3 w-3 text-warning" />
                    )}
                  </div>
                  <Badge className="signal-badge-bull text-xs">
                    +{Math.abs(mover.change).toFixed(1)}%
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bearish Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <TrendingDown className="h-4 w-4" />
            <span>Under Pressure</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : bears.length === 0 ? (
              <div className="col-span-2 text-center py-4 text-muted-foreground text-sm">
                No strong bearish signals detected
              </div>
            ) : (
              bears.map((mover) => (
                <div
                  key={mover.ticker}
                  className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20 hover:border-destructive/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <TickerLink ticker={mover.ticker} className="font-mono font-bold text-foreground" />
                    {mover.breakout === 'support_break' && (
                      <Zap className="h-3 w-3 text-warning" />
                    )}
                  </div>
                  <Badge className="signal-badge-bear text-xs">
                    {mover.change.toFixed(1)}%
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MarketRadar;