import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, ChevronRight, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LockedPreview } from "@/components/conversion/LockedPreview";

interface FollowedTheme {
  id: string;
  name: string;
  currentScore: number | null;
}


const FollowedThemesCard = () => {
  const navigate = useNavigate();
  const { userPlan } = useAuth();
  const isFree = userPlan === 'free' || !userPlan;



  const { data: themes = [], isLoading } = useQuery({
    queryKey: ['followed-themes-dashboard'],
    queryFn: async (): Promise<FollowedTheme[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: allThemes } = await (supabase.rpc as any)('get_themes_for_user');
      const themes = (allThemes ?? []) as Array<{ id: string; name: string; score: number | null }>;
      if (themes.length === 0) return [];

      const themeById = new Map(themes.map((t) => [t.id, t]));

      const { data: subscriptions, error: subError } = await supabase
        .from('user_theme_subscriptions')
        .select('theme_id')
        .eq('user_id', user.id)
        .limit(3);

      const pickThemes: typeof themes = (() => {
        if (subError || !subscriptions || subscriptions.length === 0) {
          return themes.slice(0, 3);
        }
        return subscriptions
          .map((sub) => themeById.get(sub.theme_id))
          .filter((t): t is typeof themes[number] => Boolean(t));
      })();

      return pickThemes.map((t) => ({
        id: t.id,
        name: t.name,
        currentScore: t.score === null || t.score === undefined ? null : Number(t.score),
      }));
    },
    staleTime: 10 * 60 * 1000,
  });

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-ds-text-muted";
    if (score >= 70) return "text-ds-signal-positive";
    return "text-ds-text-muted";
  };

  return (
    <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-h4 font-semibold text-ds-text-primary">
            <Eye className="h-5 w-5 text-ds-text-secondary" />
            Themes You Follow
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
            onClick={() => navigate('/themes')}
          >
            Browse <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-ds-md bg-ds-surface-elevated space-y-2">
                <div className="h-4 w-full skeleton-pulse rounded" />
                <div className="h-8 w-16 skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : themes.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-body-sm text-ds-text-secondary">Start following themes to track their performance</p>
            <Button
              variant="outline"
              size="sm"
              className="border-ds-border text-ds-text-primary hover:bg-ds-surface-elevated hover:border-ds-border-strong rounded-ds-md"
              onClick={() => navigate('/themes')}
            >
              <Plus className="h-4 w-4 mr-1" />
              Browse Themes
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themes.map((theme) => {
              const hasScore = theme.currentScore !== null;
              return (
                <div
                  key={theme.id}
                  className="p-4 rounded-ds-md bg-ds-surface-elevated border border-ds-border hover:border-ds-border-strong transition-colors duration-fast ease-ds-out cursor-pointer text-center"
                  onClick={() => navigate('/themes')}
                >
                  <p className="text-h4 font-medium text-ds-text-primary truncate mb-2" title={theme.name}>
                    {theme.name}
                  </p>
                  {hasScore ? (
                    <>
                      <div className={`text-data-lg font-mono font-semibold tabular-nums mb-2 ${scoreColor(theme.currentScore)}`}>
                        {theme.currentScore!.toFixed(0)}
                      </div>
                      <span className="text-caption font-mono text-ds-text-muted">-</span>
                    </>
                  ) : isFree ? (
                    <div className="mb-2 flex justify-center">
                      <LockedPreview
                        mode="inline"
                        intensity="medium"
                        targetTier="starter"
                        trackingLabel="followed_themes_score"
                      >
                        <span className="text-data-lg font-mono font-semibold tabular-nums text-ds-signal-positive">
                          75
                        </span>
                      </LockedPreview>
                    </div>
                  ) : (
                    <div className="text-data-lg font-mono font-semibold tabular-nums mb-2 text-ds-text-muted">
                      __/100
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FollowedThemesCard;
