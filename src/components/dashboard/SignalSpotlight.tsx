import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { TickerLink } from "@/lib/tickerLink";

interface SpotlightSignal {
  ticker: string;
  type: string;
  headline: string;
  direction: string;
  magnitude: number;
}

const SignalSpotlight = () => {
  const navigate = useNavigate();
  
  const { data: spotlight, isLoading } = useQuery({
    queryKey: ['signal-spotlight'],
    queryFn: async (): Promise<SpotlightSignal | null> => {
      // Two-step lookup: signals (no embedded join, assets is RPC-only
      // since the plan-gating REVOKE landed) then asset metadata via
      // get_asset_tickers_by_ids_for_user.
      const { data: signals, error } = await supabase
        .from('signals')
        .select('signal_type, direction, magnitude, asset_id')
        .not('direction', 'eq', 'neutral')
        .order('observed_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      if (!signals || signals.length === 0) return null;

      const sorted = signals.sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0));
      const top = sorted[0];

      const assetIds = [top.asset_id].filter(Boolean) as string[];
      let ticker = 'Unknown';
      if (assetIds.length > 0) {
        const { data: assetRows } = await (supabase.rpc as any)(
          'get_asset_tickers_by_ids_for_user',
          { _ids: assetIds }
        );
        const match = (assetRows ?? []).find((r: any) => r.id === top.asset_id);
        if (match?.ticker) ticker = match.ticker;
      }
      // Free users (or any user the asset is hidden from) get the demo
      // teaser experience: bail rather than leak the real ticker.
      if (ticker === 'Unknown') return null;
      
      // Generate a compelling headline based on signal type
      const headlines: Record<string, string> = {
        'insider_trade': `Unusual insider activity detected in ${ticker}`,
        'dark_pool': `Dark pool volume spike in ${ticker}`,
        'institutional_flow': `Smart money flowing into ${ticker}`,
        'news_sentiment': `Sentiment shift detected for ${ticker}`,
        'supply_chain_indicator': `Supply chain signal for ${ticker}`,
        'economic_indicator': `Economic indicator affecting ${ticker}`,
      };
      
      return {
        ticker,
        type: top.signal_type,
        headline: headlines[top.signal_type] || `Notable signal detected for ${ticker}`,
        direction: top.direction || 'neutral',
        magnitude: top.magnitude || 0
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="bg-gradient-hero border-primary/20 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 skeleton-pulse rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 skeleton-pulse rounded" />
              <div className="h-4 w-full skeleton-pulse rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!spotlight) {
    return (
      <Card className="bg-gradient-hero border-primary/20 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Signal Spotlight</p>
              <p className="font-medium">Analyzing signals for today's highlight...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isUp = spotlight.direction === 'up';

  return (
    <Card className="bg-gradient-hero border-primary/20 overflow-hidden relative card-glow">
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-glow opacity-50" />
      
      <CardContent className="p-6 relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${isUp ? 'bg-success/20' : 'bg-destructive/20'}`}>
              <Sparkles className={`h-6 w-6 ${isUp ? 'text-success' : 'text-destructive'}`} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Signal Spotlight</span>
                <Badge variant="outline" className="text-xs border-warning/30 text-warning">
                  Today
                </Badge>
              </div>
              <p className="font-semibold text-lg text-foreground">{spotlight.headline}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge 
                  className={`text-xs ${isUp ? 'signal-badge-bull' : 'signal-badge-bear'}`}
                >
                  {spotlight.type.replace(/_/g, ' ')}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Magnitude: {(spotlight.magnitude * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TickerLink ticker={spotlight.ticker} iconOnly />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/asset/${encodeURIComponent(spotlight.ticker)}`)}
            >
              Explore <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SignalSpotlight;