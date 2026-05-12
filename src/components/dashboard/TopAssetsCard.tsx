import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const getSignalStrength = (mass: number): { level: "high" | "medium" | "low"; label: string } => {
  if (mass >= 0.017) return { level: "high", label: "High" };
  if (mass >= 0.0067) return { level: "medium", label: "Med" };
  return { level: "low", label: "Low" };
};

const getStrengthClasses = (level: "high" | "medium" | "low") => {
  if (level === "high") return "border-ds-signal-positive/40 text-ds-signal-positive";
  if (level === "medium") return "border-ds-signal-warning/40 text-ds-signal-warning";
  return "border-ds-border text-ds-text-muted";
};

const getScoreClasses = (score: number) => {
  if (score >= 70) return "border-ds-signal-positive/40 text-ds-signal-positive";
  if (score >= 50) return "border-ds-signal-warning/40 text-ds-signal-warning";
  return "border-ds-border text-ds-text-muted";
};

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
      const { data: scoredAssets, error } = await (supabase.rpc as any)('get_assets_for_user', {
        _sort_mode: 'score-desc',
        _result_limit: 100,
        _result_offset: 0,
      });

      if (error) throw error;
      if (!scoredAssets || scoredAssets.length === 0) return [];

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

  const MiniSparkline = ({ expectedReturn }: { expectedReturn: number }) => {
    const isUp = expectedReturn > 0;
    return (
      <div className="flex items-end gap-0.5 h-6 w-16">
        {[0.3, 0.5, 0.4, 0.6, 0.55, 0.7, 0.65, 0.8, 0.75, 0.9].map((h, i) => {
          const height = isUp ? h : (1 - h);
          return (
            <div
              key={i}
              className={`w-1 rounded-t ${isUp ? 'bg-ds-brand-primary' : 'bg-ds-signal-negative'}`}
              style={{ height: `${height * 100}%`, opacity: 0.6 }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none h-full">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-h4 font-semibold text-ds-text-primary">
            <BarChart3 className="h-5 w-5 text-ds-text-secondary" />
            Scored Assets
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
            onClick={() => navigate('/asset-radar')}
          >
            View Radar <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-ds-md bg-ds-surface-elevated flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-20 skeleton-pulse rounded" />
                  <div className="h-4 w-32 skeleton-pulse rounded" />
                </div>
                <div className="h-8 w-16 skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="text-center py-8 text-ds-text-muted text-body-sm">
            <p>No scored assets available yet</p>
          </div>
        ) : (
          (planLimits.full_dashboard ? assets : assets.slice(0, 1)).map((asset) => {
            const isUp = asset.expectedReturn > 0;
            return (
              <div
                key={asset.ticker}
                className="group p-4 rounded-ds-md bg-ds-surface-elevated border border-ds-border hover:border-ds-border-strong transition-colors duration-fast ease-ds-out cursor-pointer"
                onClick={() => navigate(`/asset/${asset.ticker}`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-data-lg text-ds-brand-primary">
                        {asset.ticker}
                      </span>
                      <TickerLink ticker={asset.ticker} iconOnly />
                      <span
                        className={`text-caption font-medium px-1.5 py-0.5 rounded-ds-sm border ${getStrengthClasses(asset.signalStrength)}`}
                      >
                        {asset.signalStrength === "high" ? "High" : asset.signalStrength === "medium" ? "Med" : "Low"}
                      </span>
                      {planLimits.show_scores && (
                        <span
                          className={`text-caption font-mono px-1.5 py-0.5 rounded-ds-sm border ${getScoreClasses(asset.score)}`}
                        >
                          {asset.score}
                        </span>
                      )}
                    </div>
                    <div className="text-caption font-mono text-ds-text-secondary">
                      Expected:{" "}
                      <span className={isUp ? "text-ds-signal-positive" : asset.expectedReturn < 0 ? "text-ds-signal-negative" : "text-ds-text-muted"}>
                        {isUp ? '+' : ''}{(asset.expectedReturn * 100).toFixed(2)}%
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
