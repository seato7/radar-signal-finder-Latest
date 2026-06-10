import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaywallModal } from "@/components/PaywallModal";
import { BlurredUpgradeOverlay } from "@/components/BlurredUpgradeOverlay";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { usePublicPreview } from "@/hooks/usePublicPreview";
import { cn } from "@/lib/utils";
import { TrendingUp, Clock, Target, BarChart3, Percent, X, AlertTriangle, Circle } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TickerLink } from "@/lib/tickerLink";


const BlurStat = ({ children, isFree }: { children: React.ReactNode; isFree: boolean }) =>
  isFree ? (
    <LockedPreview mode="inline" intensity="medium" targetTier="starter" trackingLabel="active_signals_stat">
      {children}
    </LockedPreview>
  ) : <>{children}</>;

const BlurCell = ({ children, isFree }: { children: React.ReactNode; isFree: boolean }) =>
  isFree ? (
    <LockedPreview mode="row-cell" intensity="medium" targetTier="starter" trackingLabel="active_signal_row">
      {children}
    </LockedPreview>
  ) : <>{children}</>;

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
  last_live_price?: number | null;
  last_live_price_at?: string | null;
  last_live_price_source?: 'live' | 'db' | 'none' | null;
  reason: string | null;
}

const FREE_ROW_LIMIT = 3;

const ResultBadge = ({ status }: { status: string }) => {
  const base = "inline-flex items-center rounded-ds-sm border px-2 py-0.5 text-caption font-medium bg-transparent";
  if (status === 'triggered') {
    return <span className={cn(base, "border-ds-signal-positive/40 text-ds-signal-positive")}>Target Hit</span>;
  }
  if (status === 'stopped') {
    return <span className={cn(base, "border-ds-signal-negative/40 text-ds-signal-negative")}>Stop Loss</span>;
  }
  if (status === 'expired') {
    return <span className={cn(base, "border-ds-signal-warning/40 text-ds-signal-warning")}>Expired</span>;
  }
  return <span className={cn(base, "border-ds-border text-ds-text-muted")}>{status}</span>;
};

const PnlCell = ({ pnl }: { pnl: number | null }) => {
  if (pnl == null) return <span className="text-ds-text-muted font-mono">-</span>;
  const positive = pnl > 0;
  return (
    <span className={cn("font-mono text-data-sm", positive ? "text-ds-signal-positive" : "text-ds-signal-negative")}>
      {positive ? "+" : ""}{pnl.toFixed(2)}%
    </span>
  );
};

const FreshnessDot = ({ lastLivePriceAt }: { lastLivePriceAt?: string | null }) => {
  if (!lastLivePriceAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Circle className="h-2 w-2 fill-ds-text-muted text-ds-text-muted shrink-0" />
        </TooltipTrigger>
        <TooltipContent>Daily close</TooltipContent>
      </Tooltip>
    );
  }
  const ageMs = Date.now() - new Date(lastLivePriceAt).getTime();
  const ageMin = Math.floor(ageMs / 60000);
  const ageHr = Math.floor(ageMin / 60);
  let color: string;
  let label: string;
  if (ageMin < 10) {
    color = "fill-ds-signal-positive text-ds-signal-positive";
    label = `Live, updated ${ageMin}m ago`;
  } else if (ageMin < 60 * 24) {
    color = "fill-ds-signal-warning text-ds-signal-warning";
    label = ageHr >= 1 ? `Delayed, updated ${ageHr}h ago` : `Delayed, updated ${ageMin}m ago`;
  } else {
    color = "fill-ds-text-muted text-ds-text-muted";
    label = "Daily close";
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Circle className={cn("h-2 w-2 shrink-0", color)} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};

const MaskedTicker = () => (
  <span className="font-mono font-semibold tracking-widest text-ds-text-muted select-none">
    {'\u2022 \u2022 \u2022 \u2022 \u2022'}
  </span>
);

export default function TradingSignals() {
  const { planLoading, limits, userPlan, isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  const previewQuery = usePublicPreview();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false);
  const planLimits = planLoading ? null : limits();
  const signalLimit = planLimits?.active_signals ?? 0;
  const hasUnlimited = signalLimit === -1;
  const isFree = !planLoading && (userPlan === 'free' || !userPlan);
  const isFreeTeaser = !!(planLimits?.can_view_signals_teaser && signalLimit === 0) || isFree;

  const { data: signals, isLoading, error } = useQuery({
    queryKey: ['trade-signals', isAuthenticated],
    queryFn: async (): Promise<TradeSignal[]> => {
      if (!isAuthenticated) {
        const demo = previewQuery.data?.demo_signal;
        if (!demo) return [];
        return [{
          id: demo.id, ticker: demo.ticker, asset_id: null,
          signal_type: demo.signal_type, status: demo.status,
          entry_price: demo.entry_price, exit_target: demo.exit_target,
          stop_loss: demo.stop_loss, peak_price: demo.peak_price,
          position_size_pct: demo.position_size_pct,
          score_at_entry: demo.score_at_entry, ai_score_at_entry: demo.ai_score_at_entry,
          exit_price: null, exit_date: null, pnl_pct: null,
          expires_at: demo.expires_at, created_at: demo.created_at,
          last_live_price: demo.last_live_price, last_live_price_at: demo.last_live_price_at,
          last_live_price_source: null, reason: demo.reason,
        }];
      }
      const { data, error } = await (supabase.rpc as any)('get_signals_for_user');
      if (error) throw error;
      return (data ?? []) as TradeSignal[];
    },
    enabled: isAuthenticated || !previewQuery.isLoading,
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

  const visibleActive = hasUnlimited ? active : isFreeTeaser ? active : active.slice(0, signalLimit);
  const visibleExits = hasUnlimited ? exits : isFreeTeaser ? exits : exits.slice(0, signalLimit);
  const activeBlurred = !hasUnlimited && !isFreeTeaser && active.length > signalLimit;
  const exitsBlurred = !hasUnlimited && !isFreeTeaser && exits.length > signalLimit;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Signals"
        description="Highest-scored signals with entry price, target, stop loss and position sizing powered by the InsiderPulse scoring engine"
      />

      {/* Disclaimer banner */}
      {!disclaimerDismissed && (
        <div className="flex items-start gap-3 rounded-ds-lg border border-ds-border bg-ds-surface px-4 py-3 text-body-sm text-ds-text-secondary">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-ds-signal-warning" />
          <p className="flex-1">
            These are algorithmically calculated data outputs only and do not constitute financial advice
            or a recommendation to trade. Entry prices, targets and stop losses are reference points
            generated by our scoring model. They are not instructions to trade. Past performance does
            not guarantee future results. Always conduct your own research and consult a licensed
            financial adviser before making any investment decision.
          </p>
          <button
            onClick={() => setDisclaimerDismissed(true)}
            className="shrink-0 text-ds-text-muted hover:text-ds-text-primary transition-colors duration-fast"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-ds-text-secondary text-caption mb-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Active Positions
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-data-lg font-mono font-semibold text-ds-text-primary">{active.length}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-ds-text-secondary text-caption mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Avg Score at Entry
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-data-lg font-mono font-semibold text-ds-text-primary">
                <BlurStat isFree={isFree}>
                  {avgScoreAtEntry != null ? avgScoreAtEntry.toFixed(1) : "-"}
                </BlurStat>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-ds-text-secondary text-caption mb-1">
              <Percent className="h-3.5 w-3.5" />
              Avg Position Size
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-data-lg font-mono font-semibold text-ds-text-primary">
                <BlurStat isFree={isFree}>
                  {avgPositionSize != null ? `${(avgPositionSize * 100).toFixed(1)}%` : "-"}
                </BlurStat>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-ds-text-secondary text-caption mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Avg Return
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className={cn(
                "text-data-lg font-mono font-semibold",
                totalReturn == null ? "text-ds-text-primary" : totalReturn >= 0 ? "text-ds-signal-positive" : "text-ds-signal-negative"
              )}>
                <BlurStat isFree={isFree}>
                  {totalReturn == null ? "-" : `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`}
                </BlurStat>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-ds-text-secondary text-caption mb-1">
              <Percent className="h-3.5 w-3.5" />
              Total Return
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className={cn(
                "text-data-lg font-mono font-semibold",
                totalReturnSum == null ? "text-ds-text-primary" : totalReturnSum >= 0 ? "text-ds-signal-positive" : "text-ds-signal-negative"
              )}>
                <BlurStat isFree={isFree}>
                  {totalReturnSum == null ? "-" : `${totalReturnSum >= 0 ? '+' : ''}${totalReturnSum.toFixed(2)}%`}
                </BlurStat>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-ds-text-secondary text-caption mb-1">
              <Target className="h-3.5 w-3.5" />
              Win Rate
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-data-lg font-mono font-semibold text-ds-signal-positive">
                {winRate != null ? `${winRate.toFixed(1)}%` : "-"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active positions */}
      <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
        <CardHeader className="pb-3 px-5 pt-5">
          <CardTitle className="text-h4 font-semibold text-ds-text-primary flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-ds-signal-positive" />
            Active Positions
            {active.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-ds-sm border border-ds-border px-1.5 py-0.5 text-caption font-mono text-ds-text-secondary">
                {active.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : active.length === 0 ? (
            <p className="text-body-sm text-ds-text-muted py-4 text-center">No active positions</p>
          ) : (() => {
            const tableBlock = (
            <div className="relative">
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-ds-border text-overline text-ds-text-muted">
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
                        : "-";
                      const currentPrice = s.last_live_price ?? priceMap.get(s.ticker);
                      const livePnl = currentPrice != null && s.entry_price != null
                        ? ((currentPrice - s.entry_price) / s.entry_price) * 100
                        : null;
                      const tickerHidden = isFree || s.ticker == null || s.ticker === '***';
                      return (
                        <tr key={s.id} className="border-b border-ds-border hover:bg-ds-surface-elevated transition-colors duration-fast ease-ds-out">
                          <td className="py-2.5 pr-4 align-top">
                            {tickerHidden
                              ? <BlurCell isFree={isFree}><MaskedTicker /></BlurCell>
                              : <TickerLink ticker={s.ticker} className="font-mono font-semibold text-ds-brand-primary" />}
                            {s.reason && !isFree && (
                              <div className="text-caption text-ds-text-muted mt-1 leading-snug max-w-xs font-normal">
                                {s.reason}
                              </div>
                            )}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-primary">
                            <BlurCell isFree={isFree}>{s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-signal-positive">
                            <BlurCell isFree={isFree}>{s.exit_target != null ? `$${s.exit_target.toFixed(2)}` : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-signal-negative">
                            <BlurCell isFree={isFree}>{s.stop_loss != null ? `$${s.stop_loss.toFixed(2)}` : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4">
                            <BlurCell isFree={isFree}>
                              <span className="inline-flex items-center gap-1.5 justify-end">
                                <PnlCell pnl={livePnl} />
                                <FreshnessDot lastLivePriceAt={s.last_live_price_at} />
                              </span>
                            </BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-primary">
                            <BlurCell isFree={isFree}>{s.position_size_pct != null ? `${(s.position_size_pct * 100).toFixed(1)}%` : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-primary">
                            <BlurCell isFree={isFree}>{s.score_at_entry != null ? s.score_at_entry.toFixed(1) : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-primary">
                            <BlurCell isFree={isFree}>{s.ai_score_at_entry != null ? s.ai_score_at_entry.toFixed(1) : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">
                            <BlurCell isFree={isFree}>{expiresFormatted}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 pl-4 font-mono text-data-sm text-ds-text-muted">
                            <BlurCell isFree={isFree}>{daysActive}d</BlurCell>
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
                  <table className="w-full text-body-sm">
                    <tbody>
                      {active.slice(signalLimit, Math.min(signalLimit + 3, active.length)).map((s) => (
                        <tr key={s.id} className="border-b border-ds-border">
                          <td className="py-2.5 pr-4 font-mono font-semibold text-ds-brand-primary">
                            {s.ticker === '***' ? <MaskedTicker /> : s.ticker}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-primary">
                            {s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "-"}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-signal-positive">
                            {s.exit_target != null ? `$${s.exit_target.toFixed(2)}` : "-"}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-signal-negative">
                            {s.stop_loss != null ? `$${s.stop_loss.toFixed(2)}` : "-"}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 pl-4 font-mono text-data-sm text-ds-text-muted">-</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </BlurredUpgradeOverlay>
              )}
            </div>
            );
            return isFree ? (
              <LockedPreview
                mode="section"
                intensity="medium"
                targetTier="starter"
                trackingLabel="active_signals_overlay"
                tooltipText="Today's highest-conviction trade ideas, fully spec'd. Starter shows 1, Pro shows 3, Premium unlimited."
                ctaText="Upgrade to Starter"
              >
                {tableBlock}
              </LockedPreview>
            ) : tableBlock;
          })()}


        </CardContent>
      </Card>

      {/* Recent exits */}
      <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
        <CardHeader className="pb-3 px-5 pt-5">
          <CardTitle className="text-h4 font-semibold text-ds-text-primary flex items-center gap-2">
            <Clock className="h-4 w-4 text-ds-text-muted" />
            Recent Exits
            {exits.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-ds-sm border border-ds-border px-1.5 py-0.5 text-caption font-mono text-ds-text-secondary">
                {exits.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : exits.length === 0 ? (
            <p className="text-body-sm text-ds-text-muted py-4 text-center">No closed positions yet</p>
          ) : (
            <div className="relative">
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-ds-border text-overline text-ds-text-muted">
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
                      const tickerHidden = isFree || s.ticker == null || s.ticker === '***';
                      return (
                        <tr key={s.id} className="border-b border-ds-border hover:bg-ds-surface-elevated transition-colors duration-fast ease-ds-out">
                          <td className="py-2.5 pr-4">
                            {tickerHidden
                              ? <BlurCell isFree={isFree}><MaskedTicker /></BlurCell>
                              : <TickerLink ticker={s.ticker} className="font-mono font-semibold text-ds-brand-primary" />}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">
                            <BlurCell isFree={isFree}>{s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-primary">
                            <BlurCell isFree={isFree}>{s.exit_price != null ? `$${s.exit_price.toFixed(2)}` : "-"}</BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4">
                            <BlurCell isFree={isFree}><PnlCell pnl={s.pnl_pct} /></BlurCell>
                          </td>
                          <td className="text-right py-2.5 px-4">
                            <ResultBadge status={s.status} />
                          </td>
                          <td className="text-right py-2.5 pl-4 font-mono text-data-sm text-ds-text-muted">
                            <BlurCell isFree={isFree}>{daysHeld != null ? `${daysHeld}d` : "-"}</BlurCell>
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
                  <table className="w-full text-body-sm">
                    <tbody>
                      {exits.slice(signalLimit, Math.min(signalLimit + 3, exits.length)).map((s) => (
                        <tr key={s.id} className="border-b border-ds-border">
                          <td className="py-2.5 pr-4 font-mono font-semibold text-ds-brand-primary">
                            {s.ticker === '***' ? <MaskedTicker /> : s.ticker}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">
                            {s.entry_price != null ? `$${s.entry_price.toFixed(2)}` : "-"}
                          </td>
                          <td className="text-right py-2.5 px-4 font-mono text-data-sm text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 px-4 text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 px-4 text-ds-text-muted">-</td>
                          <td className="text-right py-2.5 pl-4 font-mono text-data-sm text-ds-text-muted">-</td>
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

      {isFreeTeaser && (active.length > 0 || exits.length > 0) && (
        <div className="rounded-ds-lg border border-ds-brand-primary/30 bg-ds-surface p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <p className="flex-1 text-body-sm text-ds-text-secondary">
            Tickers, prices and entry levels are hidden on the Free plan. Upgrade
            to see every active signal in full.
          </p>
          <Button
            onClick={() => isAuthenticated
              ? setPaywallOpen(true)
              : openAuthModal('signup', { ref: 'trading_signals_upgrade' })}
            variant="outline"
            className="border-ds-brand-primary/40 text-ds-brand-primary hover:bg-ds-brand-primary/10 hover:text-ds-brand-primary"
          >
            {isAuthenticated ? 'Upgrade plan' : 'Sign Up Free'}
          </Button>

        </div>
      )}

      {error && (
        <p className="text-body-sm text-ds-signal-negative text-center">
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
