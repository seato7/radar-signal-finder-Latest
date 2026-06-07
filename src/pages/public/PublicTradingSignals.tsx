import { useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Target, TrendingUp, ArrowRight, Crosshair } from "lucide-react";
import { usePublicPreview } from "@/hooks/usePublicPreview";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { ProgressionLabel } from "@/components/conversion/ProgressionLabel";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { usePreviewEngagement, useViewportOnceEvent } from "@/hooks/useAnalytics";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { StickySignupBar } from "@/components/conversion/StickySignupBar";

const PublicTradingSignals = () => {
  const { data, isLoading } = usePublicPreview();
  const { openAuthModal } = useAuthModal();
  const sigRef = useRef<HTMLDivElement>(null);
  usePreviewEngagement();
  useViewportOnceEvent(sigRef, "demo_signal_viewed");


  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <StickySignupBar trackingLabel="public_signals_sticky" />
        <PageHeader title="Active Signals" eyebrow="Live Preview" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sig = data.demo_signal;
  const hidden = Math.max(0, data.total_active_signal_count - (sig ? 1 : 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Signals"
        eyebrow="Live Preview"
        description="Fully spec'd trade signals with entry, target, and stop-loss. Sign in for free to see all active signals."
      />

      <ProgressionLabel
        visible={sig ? 1 : 0}
        total={data.total_active_signal_count}
        noun="active signals"
        trackingLabel="public_signals"
      />

      {sig && (
        <Card
          ref={sigRef}
          className="bg-ds-surface border-ds-brand-primary/40 cursor-pointer hover:border-ds-brand-primary"
          onClick={() => track("preview_signal_clicked", { ticker: sig.ticker })}
        >
          <CardHeader className="border-b border-ds-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crosshair className="h-5 w-5 text-ds-brand-primary" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-h3 font-semibold text-ds-text-primary">{sig.ticker}</span>
                    <Badge variant="outline" className="border-ds-signal-positive/40 text-ds-signal-positive">
                      {sig.signal_type}
                    </Badge>
                  </div>
                  <p className="text-caption text-ds-text-secondary mt-1">Live demo signal</p>
                </div>
              </div>
              {sig.score_at_entry != null && (
                <span className="inline-flex items-center rounded-ds-sm border border-ds-signal-positive/40 text-ds-signal-positive px-3 py-1 text-data-sm font-mono">
                  Score {Number(sig.score_at_entry).toFixed(1)}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Entry" value={sig.entry_price} />
            <Stat label="Target" value={sig.exit_target} tone="positive" icon={<Target className="h-3 w-3" />} />
            <Stat label="Stop Loss" value={sig.stop_loss} tone="negative" />
            <Stat label="Live Price" value={sig.last_live_price ?? sig.entry_price} icon={<TrendingUp className="h-3 w-3" />} />
          </CardContent>
        </Card>
      )}

      <Card className="bg-ds-surface border-ds-border">
        <CardHeader className="border-b border-ds-border flex flex-row items-center justify-between">
          <h2 className="text-body font-semibold text-ds-text-primary">
            {hidden} Active Signal{hidden === 1 ? "" : "s"} Hidden
          </h2>
          <Badge variant="outline" className="border-ds-brand-primary/40 text-ds-brand-primary">
            <Lock className="h-3 w-3 mr-1" /> Free Access
          </Badge>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-ds-border">
          {Array.from({ length: Math.min(hidden, 5) }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <LockedPreview mode="row-cell" intensity="medium" fieldType="generic" trackingLabel="public_signal_ticker">
                <span className="font-mono font-semibold text-ds-text-primary">XXXX</span>
              </LockedPreview>
              <div className="flex-1" />
              <LockedPreview mode="row-cell" intensity="medium" fieldType="price" trackingLabel="public_signal_price">
                <span className="font-mono text-data-sm text-ds-text-primary">$000.00</span>
              </LockedPreview>
              <LockedPreview mode="row-cell" intensity="medium" fieldType="score" trackingLabel="public_signal_score">
                <span className="inline-flex items-center rounded-ds-sm border border-ds-border px-2 py-1 text-data-sm font-mono">00</span>
              </LockedPreview>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          onClick={() => { track("locked_content_cta_clicked", { surface: "footer", label: "public_signals_footer" }); openAuthModal("signup", { ref: "public_signals_footer" }); }}
          className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary"
        >
          Start Free Access to See All {data.total_active_signal_count} Active Signals
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const Stat = ({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number | null;
  tone?: "positive" | "negative";
  icon?: React.ReactNode;
}) => (
  <div>
    <div className="text-caption text-ds-text-muted mb-1 flex items-center gap-1">
      {icon}
      {label}
    </div>
    <div
      className={cn(
        "font-mono text-data text-ds-text-primary",
        tone === "positive" && "text-ds-signal-positive",
        tone === "negative" && "text-ds-signal-negative",
      )}
    >
      {value != null ? `$${Number(value).toFixed(2)}` : "—"}
    </div>
  </div>
);

export default PublicTradingSignals;
