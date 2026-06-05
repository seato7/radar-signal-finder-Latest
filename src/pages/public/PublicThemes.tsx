import { useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, Tag, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublicPreview } from "@/hooks/usePublicPreview";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { ProgressionLabel } from "@/components/conversion/ProgressionLabel";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { usePreviewEngagement, useViewportOnceEvent } from "@/hooks/useAnalytics";

const scoreClasses = (s: number) =>
  s >= 70
    ? "border-ds-signal-positive/40 text-ds-signal-positive"
    : s >= 50
      ? "border-ds-signal-warning/40 text-ds-signal-warning"
      : "border-ds-border text-ds-text-muted";

const PublicThemes = () => {
  const { data, isLoading } = usePublicPreview();
  const demoRef = useRef<HTMLDivElement>(null);
  usePreviewEngagement();
  useViewportOnceEvent(demoRef, "demo_theme_viewed");


  return (
    <div className="space-y-6">
      <PageHeader
        title="Investment Themes"
        eyebrow="Live Preview"
        description="Curated investment themes scored daily across markets. Sign in for free to unlock full theme data."
      />

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <>
          <ProgressionLabel
            visible={data.demo_themes.length}
            total={data.total_theme_count}
            noun="themes with full data"
            trackingLabel="public_themes"
          />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.demo_themes.map((t) => (
              <Card key={t.id} className="bg-ds-surface border-ds-brand-primary/40">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag className="h-4 w-4 text-ds-brand-primary" />
                        <Badge variant="outline" className="border-ds-brand-primary/40 text-ds-brand-primary text-caption">
                          Demo
                        </Badge>
                      </div>
                      <h3 className="text-body font-semibold text-ds-text-primary leading-tight">{t.name}</h3>
                    </div>
                    {t.score != null && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-ds-sm border px-2 py-1 text-data-sm font-mono shrink-0",
                          scoreClasses(t.score),
                        )}
                      >
                        {Math.round(t.score)}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-caption text-ds-text-secondary line-clamp-3">
                    {t.ai_summary ?? "Bipartisan congressional trading activity across both chambers."}
                  </p>
                  <div className="flex items-center gap-3 text-caption text-ds-text-muted pt-2 border-t border-ds-border">
                    <span>{t.signal_count} signals</span>
                    <span>•</span>
                    <span>{(t.keywords ?? []).slice(0, 3).join(", ")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}

            {data.blurred_themes.slice(0, 11).map((t) => (
              <Card key={t.id} className="bg-ds-surface border-ds-border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag className="h-4 w-4 text-ds-text-muted" />
                        <Badge variant="outline" className="text-caption">
                          <Lock className="h-3 w-3 mr-1" /> Locked
                        </Badge>
                      </div>
                      <h3 className="text-body font-semibold text-ds-text-primary leading-tight">{t.name}</h3>
                    </div>
                    <LockedPreview mode="row-cell" intensity="medium" fieldType="score" trackingLabel="public_themes_score">
                      <span className="inline-flex items-center rounded-ds-sm border border-ds-border px-2 py-1 text-data-sm font-mono shrink-0">
                        00
                      </span>
                    </LockedPreview>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-caption text-ds-text-muted">
                    {(t.keywords ?? []).slice(0, 4).join(", ") || "—"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-center pt-4">
            <Button asChild size="lg" className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary">
              <Link to="/auth?mode=signup&ref=public_themes_footer">
                Start Free Access to See All {data.total_theme_count} Themes
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default PublicThemes;
