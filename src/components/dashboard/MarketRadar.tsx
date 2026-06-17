import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Activity, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TickerLink } from "@/lib/tickerLink";
import { useAuth } from "@/hooks/useAuth";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { useAnonSignupCTA } from "@/hooks/useAnonSignupCTA";

interface TopMover {
  ticker: string;
  trend: string;
  change: number;
  breakout: string;
}

const MarketRadar = () => {
  const { userPlan, isAuthenticated } = useAuth();
  const anonSignup = useAnonSignupCTA();
  const isFree = userPlan === 'free' || !userPlan;
  const { data: topMovers = [], isLoading } = useQuery({
    enabled: isAuthenticated,
    queryKey: ['market-radar-movers'],

    queryFn: async (): Promise<TopMover[]> => {
      const { data, error } = await (supabase.rpc as any)('get_market_radar_for_user');
      if (error) throw error;
      return ((data ?? []) as any[]).map((d) => ({
        ticker: d.ticker,
        trend: d.trend_strength,
        change: d.price_vs_vwap_pct == null ? 0 : Number(d.price_vs_vwap_pct),
        breakout: d.breakout_signal || 'range_bound',
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const bulls = topMovers.filter(m => m.trend === 'strong_uptrend').slice(0, 4);
  const bears = topMovers.filter(m => m.trend === 'strong_downtrend').slice(0, 4);

  const SkeletonCard = () => (
    <div className="flex items-center justify-between p-3 rounded-ds-md bg-ds-surface-elevated">
      <div className="flex items-center gap-3">
        <div className="h-5 w-16 skeleton-pulse rounded" />
      </div>
      <div className="h-5 w-14 skeleton-pulse rounded" />
    </div>
  );

  return (
    <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="flex items-center gap-2 text-h4 font-semibold text-ds-text-primary">
          <Activity className="h-5 w-5 text-ds-text-secondary" />
          Today's Market Radar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        {!isAuthenticated ? (
          <div className="space-y-4">
            {[
              { label: "Strong Momentum", Icon: TrendingUp, tone: "text-ds-signal-positive" },
              { label: "Under Pressure", Icon: TrendingDown, tone: "text-ds-signal-negative" },
            ].map(({ label, Icon, tone }) => (
              <div key={label} className="space-y-2">
                <div className={`flex items-center gap-1.5 text-overline ${tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </div>
                <div className="flex items-center justify-center gap-2 p-4 rounded-ds-md bg-ds-surface-elevated border border-ds-border text-ds-text-secondary text-body-sm">
                  <Lock className="h-4 w-4" />
                  <span>Sign up to see today's market signals.</span>
                </div>
              </div>
            ))}
            <div className="flex justify-center pt-1">
              <Button
                onClick={() => anonSignup('dashboard_market_radar_anon')}
                className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-primary/90"
              >
                Sign Up Free
              </Button>
            </div>
          </div>
        ) : (<>

        {/* Bullish */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-overline text-ds-signal-positive">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Strong Momentum</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : bulls.length === 0 ? (
              <div className="col-span-2 text-center py-4 text-ds-text-muted text-body-sm">
                No strong bullish signals detected
              </div>
            ) : (
              bulls.map((mover) => (
                <div
                  key={mover.ticker}
                  className="flex items-center justify-between p-3 rounded-ds-md bg-ds-surface-elevated border border-ds-border hover:border-ds-border-strong transition-colors duration-fast ease-ds-out cursor-pointer"
                >
                  <TickerLink ticker={mover.ticker} className="font-mono font-semibold text-ds-text-primary text-data-sm" />
                  {isFree ? (
                    <LockedPreview mode="inline" intensity="medium" targetTier="starter" trackingLabel="dashboard_market_radar">
                      <span className="text-caption font-mono px-1.5 py-0.5 rounded-ds-sm border border-ds-signal-positive/40 text-ds-signal-positive">
                        +{Math.abs(mover.change).toFixed(1)}%
                      </span>
                    </LockedPreview>
                  ) : (
                    <span className="text-caption font-mono px-1.5 py-0.5 rounded-ds-sm border border-ds-signal-positive/40 text-ds-signal-positive">
                      +{Math.abs(mover.change).toFixed(1)}%
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bearish */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-overline text-ds-signal-negative">
            <TrendingDown className="h-3.5 w-3.5" />
            <span>Under Pressure</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : bears.length === 0 ? (
              <div className="col-span-2 text-center py-4 text-ds-text-muted text-body-sm">
                No strong bearish signals detected
              </div>
            ) : (
              bears.map((mover) => (
                <div
                  key={mover.ticker}
                  className="flex items-center justify-between p-3 rounded-ds-md bg-ds-surface-elevated border border-ds-border hover:border-ds-border-strong transition-colors duration-fast ease-ds-out cursor-pointer"
                >
                  <TickerLink ticker={mover.ticker} className="font-mono font-semibold text-ds-text-primary text-data-sm" />
                  {isFree ? (
                    <LockedPreview mode="inline" intensity="medium" targetTier="starter" trackingLabel="dashboard_market_radar">
                      <span className="text-caption font-mono px-1.5 py-0.5 rounded-ds-sm border border-ds-signal-negative/40 text-ds-signal-negative">
                        {mover.change.toFixed(1)}%
                      </span>
                    </LockedPreview>
                  ) : (
                    <span className="text-caption font-mono px-1.5 py-0.5 rounded-ds-sm border border-ds-signal-negative/40 text-ds-signal-negative">
                      {mover.change.toFixed(1)}%
                    </span>
                  )}
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
