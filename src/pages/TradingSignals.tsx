import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaywallModal } from "@/components/PaywallModal";
import { BlurredUpgradeOverlay } from "@/components/BlurredUpgradeOverlay";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { TrendingUp, Clock, Target, BarChart3, Percent, X, AlertTriangle } from "lucide-react";
import { differenceInDays, format } from "date-fns";

interface TradeSignal {
  id: string;
  ticker: string;
  asset_id: string | null;
  signal_type: string;
  status: string;
  entry_price: number | null;
  exit_target: number | null;
  stop_loss: number | null;
  peak_price: number | null;
  position_size_pct: number | null;
  score_at_entry: number | null;
  ai_score_at_entry: number | null;
  exit_price: number | null;
  exit_date: string | null;
  pnl_pct: number | null;
  expires_at: string | null;
  created_at: string;
}

const FREE_ROW_LIMIT = 3;

const ResultBadge = ({ status }: { status: string }) => {
  if (status === 'triggered') {
    return <Badge className="bg-success/20 text-success border-success/30 border">Triggered</Badge>;
  }
  if (status === 'stopped') {
    return <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30 border">Stopped</Badge>;
  }
  if (status === 'expired') {
    return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 border">Expired</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
};

const PnlCell = ({ pnl }: { pnl: number | null }) => {
  if (pnl == null) return <span className="text-muted-foreground">—</span>;
  const positive = pnl > 0;
  return (
    <span className={cn("font-medium tabular-nums", positive ? "text-success" : "text-destructive")}>
      {positive ? "+" : ""}{pnl.toFixed(2)}%
    </span>
  );
};

export default function TradingSignals() {
  const { planLoading, limits } = useAuth();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);
  const signalLimit = planLoading ? 0 : limits().active_signals;
  const hasUnlimited = signalLimit === -1;

  const { data: signals, isLoading, error } = useQuery({
    queryKey: ['trade-signals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trade_signals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TradeSignal[];
    },
  });

  const active = (signals ?? []).filter((s) => s.status === 'active');
  const exits = (signals ?? []).filter((s) => ['triggered', 'stopped', 'expired'].includes(s.status));

  const activeTickers = active.map((s) => s.ticker);

  const { data: currentPrices } = useQuery({
    queryKey: ['active-signal-prices', activeTickers],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prices')
        .select('ticker, close, date')
        .in('ticker', activeTickers)
        .order('date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: activeTickers.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const priceMap = new Map<string, number>();
  currentPrices?.forEach((p) => {
    if (!priceMap.has(p.ticker)) priceMap.set(p.ticker, Number(p.close));
  });

  // Summary stats
  const avgScoreAtEntry = active.length > 0
    ? active.reduce((sum, s) => sum + (s.score_at_entry ?? 0), 0) / active.length
    : null;

  const avgPositionSize = active.length > 0
    ? active.reduce((sum, s) => sum + (s.position_size_pct ?? 0), 0) / active.length
    : null;

  const totalReturn = exits.length > 0
    ? exits.reduce((sum, s) => sum + (s.pnl_pct ?? 0), 0) / exits.length
    : null;

  const totalReturnSum = exits.length > 0
    ? exits.reduce((sum, s) => sum + (s.pnl_pct ?? 0), 0)
    : null;

  // Win rate: triggered + stopped are always conclusive; expired count as wins if pnl_pct > 0
  const conclusiveExits = exits.filter((s) =>
    s.status === 'triggered' ||
    s.status === 'stopped' ||
    (s.status === 'expired' && (s.pnl_pct ?? 0) > 0)
  );
  const winRate = conclusiveExits.length > 0
    ? (conclusiveExits.filter((s) => (s.pnl_pct ?? 0) > 0).length / conclusiveExits.length) * 100
    : null;

  const visibleActive = hasUnlimited ? active : active.slice(0, signalLimit);
  const visibleExits = hasUnlimited ? exits : exits.slice(0, signalLimit);
  const activeBlurred = !hasUnlimited && active.length > signalLimit;
  const exitsBlurred = !hasUnlimited && exits.length > signalLimit;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Signals"
        description="Highest-scored signals — entry price, target, stop loss and position sizing powered by the InsiderPulse scoring engine"
      />

      {/* Disclaimer banner */}
      {!disclaimerDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="flex-1">
            These are algorithmically calculated data outputs only and do not constitute financial advice
            or a recommendation to trade. Entry prices, targets and stop losses are reference points
            generated by our scoring model — they are not instructions to trade. Past performance does
            not guarantee future results. Always conduct your own research and consult a licensed
            financial adviser before making any investment decision.
          </p>
          <button
            onClick={() => setDisclaimerDismissed(true)}
            className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Active Positions
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-bold">{active.length}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Avg Score at Entry
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">
                {avgScoreAtEntry != null ? avgScoreAtEntry.toFixed(1) : "—"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Percent className="h-3.5 w-3.5" />
              Avg Position Size
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">
                {avgPositionSize != null ? `${(avgPositionSize * 100).toFixed(1)}%` : "—"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Avg Return
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className={`text-2xl font-bold ${totalReturn == null ? '' : totalReturn >= 0 ? 'text-success' : 'text-destructive'}`}>
                {totalReturn == null ? "—" : `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Percent className="h-3.5 w-3.5" />
              Total Return
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className={`text-2xl font-bold ${totalReturnSum == null ? '' : totalReturnSum >= 0 ? 'text-success' : 'text-destructive'}`}>
                {totalReturnSum == null ? "—" : `${totalReturnSum >= 0 ? '+' : ''}${totalReturnSum.toFixed(2)}%`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Target className="h-3.5 w-3.5" />
              Win Rate
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-bold">
                {winRate != null ? `${winRate.toFixed(1)}%` : "—"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active positions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            Active Positions
            {active.length > 0 && (
              <Badge variant="secondary" className="ml-1">{active.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No active positions</p>
          ) : (
            <div className="relative">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4 font-medium">Ticker</th>
                      <th className="text-right py-2 px-4 font-medium">Entry Price</th>
                      <th className="text-right py-2 px-4 font-medium">Target</th>
                      <th className="text-right py-2 px-4 font-medium">Stop Loss</th>
                      <th className="text-right py-2 px-4 font-medium">Live P&amp;L</th>
                      <th className="text-right py-2 px-4 font-medium">Size %</th>
                      <th className="text-right py-2 px-4 font-medium">Score</th>
                      <th className="text-right py-2 px-4 font-medium">AI Score</th>
                      <th className="text-right py-2 px-4 font-medium">Expires</th>
                      <th className="text-right py-2 pl-4 font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleActive.map((s) => {
                      const daysActive = differenceInDays(new Date(), new Date(s.created_at));
                      const expiresFormatted = s.expires_at
                        ? format(new Date(s.expires_at), 'MMM d')
                        : "—";
                      const currentPrice = priceMap.get(s.ticker);
                      const livePnl = currentPrice != null && s.entry_price != null
                        ? ((currentPrice - s.entry_price) / s.entry_price) * 100
                        : null;
                      return (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-4">
                            <span className="font-semibold">{s.ticker}</span>
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums">
                            {s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-success">
                            {s.exit_target != null ? `$${s.exit_target.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-destructive">
                            {s.stop_loss != null ? `$${s.stop_loss.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4">
                            <PnlCell pnl={livePnl} />
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums">
                            {s.position_size_pct != null ? `${(s.position_size_pct * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums">
                            {s.score_at_entry != null ? s.score_at_entry.toFixed(1) : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums">
                            {s.ai_score_at_entry != null ? s.ai_score_at_entry.toFixed(1) : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-muted-foreground">
                            {expiresFormatted}
                          </td>
                          <td className="text-right py-2.5 pl-4 tabular-nums text-muted-foreground">
                            {daysActive}d
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {activeBlurred && (
                <BlurredUpgradeOverlay
                  feature={`${active.length - visibleActive.length} more active signals`}
                  description="Upgrade your plan to unlock all active signals."
                >
                  <table className="w-full text-sm">
                    <tbody>
                      {active.slice(signalLimit, Math.min(signalLimit + 3, active.length)).map((s) => (
                        <tr key={s.id} className="border-b border-border/50">
                          <td className="py-2.5 pr-4 font-semibold">{s.ticker}</td>
                          <td className="text-right py-2.5 px-4 tabular-nums">
                            {s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-success">
                            {s.exit_target != null ? `$${s.exit_target.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-destructive">
                            {s.stop_loss != null ? `$${s.stop_loss.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums">—</td>
                          <td className="text-right py-2.5 px-4 tabular-nums">—</td>
                          <td className="text-right py-2.5 px-4 tabular-nums">—</td>
                          <td className="text-right py-2.5 px-4 tabular-nums">—</td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-muted-foreground">—</td>
                          <td className="text-right py-2.5 pl-4 tabular-nums text-muted-foreground">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </BlurredUpgradeOverlay>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent exits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Recent Exits
            {exits.length > 0 && (
              <Badge variant="secondary" className="ml-1">{exits.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : exits.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No closed positions yet</p>
          ) : (
            <div className="relative">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4 font-medium">Ticker</th>
                      <th className="text-right py-2 px-4 font-medium">Entry</th>
                      <th className="text-right py-2 px-4 font-medium">Exit Price</th>
                      <th className="text-right py-2 px-4 font-medium">P&amp;L %</th>
                      <th className="text-right py-2 px-4 font-medium">Result</th>
                      <th className="text-right py-2 pl-4 font-medium">Days Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExits.map((s) => {
                      const daysHeld = s.exit_date
                        ? differenceInDays(new Date(s.exit_date), new Date(s.created_at))
                        : null;
                      const rowClass = cn(
                        "border-b border-border/50 transition-colors",
                        s.status === 'triggered' && "bg-success/5 hover:bg-success/10",
                        s.status === 'stopped' && "bg-destructive/5 hover:bg-destructive/10",
                        s.status === 'expired' && "bg-amber-500/5 hover:bg-amber-500/10",
                      );
                      return (
                        <tr key={s.id} className={rowClass}>
                          <td className="py-2.5 pr-4">
                            <span className="font-semibold">{s.ticker}</span>
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-muted-foreground">
                            {s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums">
                            {s.exit_price != null ? `$${s.exit_price.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4">
                            <PnlCell pnl={s.pnl_pct} />
                          </td>
                          <td className="text-right py-2.5 px-4">
                            <ResultBadge status={s.status} />
                          </td>
                          <td className="text-right py-2.5 pl-4 tabular-nums text-muted-foreground">
                            {daysHeld != null ? `${daysHeld}d` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {exitsBlurred && (
                <BlurredUpgradeOverlay
                  feature={`${exits.length - visibleExits.length} more closed signals`}
                  description="Upgrade your plan to unlock the full trade history."
                >
                  <table className="w-full text-sm">
                    <tbody>
                      {exits.slice(signalLimit, Math.min(signalLimit + 3, exits.length)).map((s) => (
                        <tr key={s.id} className="border-b border-border/50">
                          <td className="py-2.5 pr-4 font-semibold">{s.ticker}</td>
                          <td className="text-right py-2.5 px-4 tabular-nums text-muted-foreground">
                            {s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "—"}
                          </td>
                          <td className="text-right py-2.5 px-4 tabular-nums">—</td>
                          <td className="text-right py-2.5 px-4">—</td>
                          <td className="text-right py-2.5 px-4">—</td>
                          <td className="text-right py-2.5 pl-4 tabular-nums text-muted-foreground">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </BlurredUpgradeOverlay>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive text-center">
          Failed to load signals: {(error as Error).message}
        </p>
      )}

      <PaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        feature="Full Active Signals History"
        requiredPlan="Pro"
      />
    </div>
  );
}
