import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { TickerLink } from "@/lib/tickerLink";
import { useAuth } from "@/hooks/useAuth";
import { LockedPreview } from "@/components/conversion/LockedPreview";

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
      if (ticker === 'Unknown') return null;

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
      <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 skeleton-pulse rounded-ds-md" />
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
      <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-ds-md bg-ds-surface-elevated border border-ds-border flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-ds-brand-primary" />
            </div>
            <div>
              <p className="text-overline text-ds-text-muted">Signal Spotlight</p>
              <p className="text-body text-ds-text-primary mt-1">Analyzing signals for today's highlight...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-10 w-10 rounded-ds-md bg-ds-surface-elevated border border-ds-border flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-ds-brand-primary" />
            </div>
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-overline text-ds-text-muted">Signal Spotlight</span>
                <span className="text-caption font-medium px-2 py-0.5 rounded-ds-sm border border-ds-brand-primary/40 text-ds-brand-primary">
                  Today
                </span>
              </div>
              <p className="text-h3 font-semibold text-ds-text-primary">{spotlight.headline}</p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="text-caption font-medium px-2 py-0.5 rounded-ds-sm border border-ds-brand-primary/40 text-ds-brand-primary">
                  {spotlight.type.replace(/_/g, ' ')}
                </span>
                <span className="text-data-sm font-mono text-ds-text-primary">
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
              className="h-9 border-ds-border text-ds-text-primary hover:bg-ds-surface-elevated hover:border-ds-border-strong rounded-ds-md"
              onClick={() => navigate(`/asset/${encodeURIComponent(spotlight.ticker)}`)}
            >
              Explore <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SignalSpotlight;
