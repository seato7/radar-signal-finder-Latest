import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ArrowUpRight, ArrowDownRight, ChevronRight, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { TickerLink } from "@/lib/tickerLink";

interface TopAsset {
  ticker: string;
  name: string;
  score: number;
  expectedReturn: number;
  signalStrength: "high" | "medium" | "low";
}

// Signal strength based on mass thresholds (calibrated from actual distribution)
// M50=0.0032, M75=0.0067, M90=0.017 for massy assets
const getSignalStrength = (mass: number): { level: "high" | "medium" | "low"; label: string; className: string } => {
  if (mass >= 0.017) return { level: "high", label: "High", className: "bg-success/20 text-success border-success/30" }; // Top 10%
  if (mass >= 0.0067) return { level: "medium", label: "Med", className: "bg-primary/20 text-primary border-primary/30" }; // Top 25%
  return { level: "low", label: "Low", className: "bg-muted text-muted-foreground border-border" };
};

// Extract value from score_explanation jsonb array
const extractFromExplanation = (scoreExplanation: any, key: string): number => {
  if (!scoreExplanation || !Array.isArray(scoreExplanation)) return 0;
  const entry = scoreExplanation.find((e: any) => e.k === key);
  if (!entry) return 0;
  return typeof entry.v === 'number' ? entry.v : parseFloat(String(entry.v)) || 0;
};

const TopAssetsCard = () => {
  const navigate = useNavigate();
  const { limits } = useAuth();
  const planLimits = limits();
  
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['top-assets-dashboard-scored'],
    queryFn: async (): Promise<TopAsset[]> => {
      // Get top scored assets via plan-gated RPC, then filter by signal mass.
      const { data: scoredAssets, error } = await (supabase.rpc as any)('get_assets_for_user', {
        _sort_mode: 'score-desc',
        _result_limit: 100,
        _result_offset: 0,
      });

      if (error) throw error;
      if (!scoredAssets || scoredAssets.length === 0) {
        return [];
      }

      // Filter to only assets with meaningful signal mass and a known score
      // (free tier sees nulls — those are filtered out here so the card stays empty).
      const massyAssets = (scoredAssets as any[]).filter((a) => {
        if (a.computed_score == null && a.hybrid_score == null) return false;
        const mass = extractFromExplanation(a.score_explanation, 'signal_mass');
        return mass >= 0.001;
      });

      return massyAssets.slice(0, 3).map((a) => {
        const mass = extractFromExplanation(a.score_explanation, 'signal_mass');
        const strengthInfo = getSignalStrength(mass);
        return {
          ticker: a.ticker,
          name: a.name || a.ticker,
          score: Number(a.hybrid_score ?? a.computed_score ?? 50),
          expectedReturn: Number(a.expected_return ?? 0),
          signalStrength: strengthInfo.level,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  // Mini sparkline component (visual representation based on expected return)
  const MiniSparkline = ({ expectedReturn }: { expectedReturn: number }) => {
    const isUp = expectedReturn > 0;
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
            Scored Assets
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
            <p className="text-sm">No scored assets available yet</p>
          </div>
        ) : (
          (planLimits.full_dashboard ? assets : assets.slice(0, 1)).map((asset, index) => {
            const isUp = asset.expectedReturn > 0;
            const strengthInfo = getSignalStrength(
              asset.signalStrength === "high" ? 0.015 : 
              asset.signalStrength === "medium" ? 0.007 : 0.002
            );
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
                      <TickerLink ticker={asset.ticker} iconOnly />
                      <Badge
                        variant="outline" 
                        className={`text-[10px] px-1.5 py-0 ${strengthInfo.className}`}
                      >
                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                        {strengthInfo.label}
                      </Badge>
                      {planLimits.show_scores && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${isUp ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}`}
                        >
                          {isUp ? (
                            <ArrowUpRight className="h-3 w-3 mr-1" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3 mr-1" />
                          )}
                          {asset.score}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Expected: {isUp ? '+' : ''}{(asset.expectedReturn * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <MiniSparkline expectedReturn={asset.expectedReturn} />
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
