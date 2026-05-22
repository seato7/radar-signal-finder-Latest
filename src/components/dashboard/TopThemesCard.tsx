import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Flame, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BlurredUpgradeOverlay } from "@/components/BlurredUpgradeOverlay";
import { LockedPreview } from "@/components/conversion/LockedPreview";

interface ThemeScore {
  id: string;
  name: string;
  score: number;
  components: Record<string, number>;
  isDemo: boolean;
}


const TopThemesCard = () => {
  const navigate = useNavigate();
  const { limits, userPlan } = useAuth();
  const themesLimit = limits().themes;
  const isFree = userPlan === 'free' || !userPlan;

  const { data: themes = [], isLoading } = useQuery({
    queryKey: ['top-themes-dashboard', isFree],
    queryFn: async (): Promise<ThemeScore[]> => {
      const { data: allThemes, error: themesError } = await (supabase.rpc as any)('get_themes_for_user');

      if (themesError) throw themesError;
      if (!allThemes || allThemes.length === 0) return [];

      // For Free users: ensure the demo theme is included (floated to top) so the user always
      // sees at least one fully-scored theme as an anchor. Pull demo themes + top non-demo by name.
      const candidates = isFree
        ? [
            ...allThemes.filter((t: any) => t.is_demo),
            ...allThemes.filter((t: any) => !t.is_demo).slice(0, 10),
          ]
        : allThemes.slice(0, 10);

      const themeScores = await Promise.all(
        candidates.map(async (theme: any) => {
          const { data } = await supabase
            .from('theme_scores')
            .select('score, component_scores')
            .eq('theme_id', theme.id)
            .order('computed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!data) return null;

          return {
            id: theme.id,
            name: theme.name,
            score: data.score,
            components: data.component_scores || {},
            isDemo: Boolean(theme.is_demo),
          };
        })
      );

      const scored = themeScores.filter((theme): theme is ThemeScore => theme !== null);

      if (isFree) {
        // Demo first, then by score desc
        return scored
          .sort((a, b) => {
            if (a.isDemo !== b.isDemo) return a.isDemo ? -1 : 1;
            return b.score - a.score;
          })
          .slice(0, 3);
      }

      return scored.sort((a, b) => b.score - a.score).slice(0, 3);
    },
    staleTime: 10 * 60 * 1000,
  });


  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-ds-signal-positive';
    return 'text-ds-text-muted';
  };

  const getTopSignals = (components: Record<string, number>) => {
    return Object.entries(components)
      .filter(([_, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name);
  };

  return (
    <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none h-full">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-h4 font-semibold text-ds-text-primary">
            <Flame className="h-5 w-5 text-ds-text-secondary" />
            Market Themes
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
            onClick={() => navigate('/themes')}
          >
            View All <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-ds-md bg-ds-surface-elevated space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-5 w-32 skeleton-pulse rounded" />
                  <div className="h-6 w-16 skeleton-pulse rounded" />
                </div>
                <div className="h-2 w-full skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : themesLimit === 0 ? (
          <BlurredUpgradeOverlay
            feature="Investment Themes"
            description="Themes require a paid plan. Upgrade to track macro trends."
          >
            <div className="space-y-3">
              {[
                { name: "AI Infrastructure Boom", score: 82 },
                { name: "Clean Energy Transition", score: 74 },
                { name: "Defence Spending Surge", score: 67 },
              ].map((t, i) => (
                <div key={i} className="p-4 rounded-ds-md bg-ds-surface-elevated border border-ds-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-ds-brand-primary flex items-center justify-center text-caption font-semibold text-ds-brand-primary-foreground">
                        {i + 1}
                      </div>
                      <span className="text-body-lg text-ds-text-primary">{t.name}</span>
                    </div>
                    <span className="text-data-lg font-mono font-semibold text-ds-signal-positive">{t.score}</span>
                  </div>
                  <div className="h-1.5 w-full bg-ds-surface-overlay rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-ds-brand-primary" style={{ width: `${t.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </BlurredUpgradeOverlay>
        ) : themes.length === 0 ? (
          <div className="text-center py-8 text-ds-text-muted text-body-sm">
            <p>Theme scores are being computed...</p>
          </div>
        ) : (
          (themesLimit === -1 ? themes : themes.slice(0, themesLimit)).map((theme, index) => {
            const topSignals = getTopSignals(theme.components);
            return (
              <div
                key={theme.id}
                className="group p-4 rounded-ds-md bg-ds-surface-elevated border border-ds-border hover:border-ds-border-strong transition-colors duration-fast ease-ds-out cursor-pointer"
                onClick={() => navigate(`/themes`)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-ds-brand-primary flex items-center justify-center text-caption font-semibold text-ds-brand-primary-foreground">
                      {index + 1}
                    </div>
                    <span className="text-body-lg font-medium text-ds-text-primary truncate">
                      {theme.name}
                    </span>
                  </div>
                  {isFree ? (
                    <LockedPreview mode="inline" intensity="medium" targetTier="starter" trackingLabel="dashboard_top_themes">
                      <div className={`text-data-lg font-mono font-semibold tabular-nums ${getScoreColor(theme.score)}`}>
                        {theme.score.toFixed(0)}
                      </div>
                    </LockedPreview>
                  ) : (
                    <div className={`text-data-lg font-mono font-semibold tabular-nums ${getScoreColor(theme.score)}`}>
                      {theme.score.toFixed(0)}
                    </div>
                  )}
                </div>

                <div className="h-1.5 w-full bg-ds-surface-overlay rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full bg-ds-brand-primary transition-all duration-slow ${isFree ? 'blur-[4px]' : ''}`}
                    style={{ width: `${Math.min(theme.score, 100)}%` }}
                  />
                </div>

                {topSignals.length > 0 && (
                  <div className="flex items-center gap-2">
                    {topSignals.map((signal) => (
                      <span
                        key={signal}
                        className="text-caption px-2 py-0.5 rounded-ds-sm bg-ds-surface-overlay border border-ds-border text-ds-text-secondary"
                      >
                        {signal}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default TopThemesCard;
