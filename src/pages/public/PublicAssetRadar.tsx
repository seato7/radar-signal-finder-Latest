import { useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { usePublicPreview } from "@/hooks/usePublicPreview";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { ProgressionLabel } from "@/components/conversion/ProgressionLabel";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { usePreviewEngagement, useViewportOnceEvent } from "@/hooks/useAnalytics";
import { useAuthModal } from "@/contexts/AuthModalContext";

const scoreClasses = (s: number) =>
  s >= 70
    ? "border-ds-signal-positive/40 text-ds-signal-positive"
    : s >= 50
      ? "border-ds-signal-warning/40 text-ds-signal-warning"
      : "border-ds-border text-ds-text-muted";

const PublicAssetRadar = () => {
  const { data, isLoading } = usePublicPreview();
  const { openAuthModal } = useAuthModal();
  const demoCardRef = useRef<HTMLDivElement>(null);
  usePreviewEngagement();
  useViewportOnceEvent(demoCardRef, "demo_asset_viewed");


  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Radar"
        eyebrow="Live Preview"
        description="Real-time scores across the full universe. Sign in for free to track unlimited assets and unlock live scores."
      />

      {isLoading || !data ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          <ProgressionLabel
            visible={data.demo_assets.length}
            total={data.total_asset_count}
            noun="assets"
            trackingLabel="public_asset_radar"
          />

          <Card ref={demoCardRef} className="bg-ds-surface border-ds-border">
            <CardHeader className="border-b border-ds-border">
              <h2 className="text-body font-semibold text-ds-text-primary">
                Demo Assets <span className="text-ds-text-muted font-normal">— Full Data</span>
              </h2>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-ds-border">
              {data.demo_assets.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-ds-surface-elevated"
                  onClick={() => track("preview_asset_clicked", { ticker: a.ticker, surface: "demo" })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-ds-text-primary">{a.ticker}</span>
                      <Badge variant="outline" className="text-caption">{a.asset_class}</Badge>
                    </div>
                    <p className="text-caption text-ds-text-secondary truncate mt-0.5">{a.name}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-data-sm text-ds-text-primary">
                      {a.price != null ? `$${a.price.toFixed(2)}` : "—"}
                    </div>
                    {a.price_change_pct != null && (
                      <div
                        className={cn(
                          "text-caption font-mono inline-flex items-center gap-1",
                          a.price_change_pct >= 0 ? "text-ds-signal-positive" : "text-ds-signal-negative",
                        )}
                      >
                        {a.price_change_pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {a.price_change_pct >= 0 ? "+" : ""}{a.price_change_pct}%
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-ds-sm border px-2 py-1 text-data-sm font-mono",
                      scoreClasses(a.score),
                    )}
                  >
                    {Math.round(a.score)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-ds-surface border-ds-border">
            <CardHeader className="border-b border-ds-border flex flex-row items-center justify-between">
              <h2 className="text-body font-semibold text-ds-text-primary">
                Top-Ranked Assets <span className="text-ds-text-muted font-normal">— Locked</span>
              </h2>
              <Badge variant="outline" className="border-ds-brand-primary/40 text-ds-brand-primary">
                <Lock className="h-3 w-3 mr-1" /> Free Access
              </Badge>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-ds-border">
              {data.blurred_assets.slice(0, 25).map((a) => (
                <div key={a.id} className="flex items-center gap-4 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-ds-text-primary">{a.ticker}</span>
                      <Badge variant="outline" className="text-caption">{a.asset_class}</Badge>
                    </div>
                    <p className="text-caption text-ds-text-secondary truncate mt-0.5">{a.name}</p>
                  </div>
                  <LockedPreview mode="row-cell" intensity="medium" fieldType="price" trackingLabel="public_radar_price">
                    <span className="font-mono text-data-sm text-ds-text-primary">$000.00</span>
                  </LockedPreview>
                  <LockedPreview mode="row-cell" intensity="medium" fieldType="score" trackingLabel="public_radar_score">
                    <span className="inline-flex items-center rounded-ds-sm border border-ds-border px-2 py-1 text-data-sm font-mono">00</span>
                  </LockedPreview>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={() => { track("locked_content_cta_clicked", { surface: "footer", label: "public_radar_footer" }); openAuthModal("signup", { ref: "public_radar_footer" }); }}
              className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary"
            >
              Start Free Access to See All {data.total_asset_count.toLocaleString()} Assets
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default PublicAssetRadar;
