import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, ChevronRight, Plus, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface FollowedTheme {
  id: string;
  name: string;
  currentScore: number | null;
}

const FollowedThemesCard = () => {
  const navigate = useNavigate();
  
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

  return (
    <Card className="card-glow border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-primary" />
            Themes You Follow
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-muted-foreground hover:text-primary"
            onClick={() => navigate('/themes')}
          >
            Browse <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/30 space-y-2">
                <div className="h-4 w-full skeleton-pulse rounded" />
                <div className="h-8 w-16 skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : themes.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">Start following themes to track their performance</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/themes')}
            >
              <Plus className="h-4 w-4 mr-1" />
              Browse Themes
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {themes.map((theme, index) => {
              const hasScore = theme.currentScore !== null;
              return (
                <div
                  key={theme.id}
                  className="p-4 rounded-lg bg-surface-1 border border-border/50 hover:border-primary/30 transition-all cursor-pointer animate-fade-in text-center"
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => navigate('/themes')}
                >
                  <p className="text-sm font-medium text-foreground truncate mb-2" title={theme.name}>
                    {theme.name}
                  </p>
                  <div className={`text-2xl font-bold tabular-nums mb-1 ${hasScore ? '' : 'text-muted-foreground/60 font-mono'}`}>
                    {hasScore ? theme.currentScore!.toFixed(0) : '__/100'}
                  </div>
                  {hasScore ? (
                    <Badge variant="outline" className="text-xs text-muted-foreground border-border/50">
                      -
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-1 border-border/50 text-muted-foreground">
                      <Lock className="h-2.5 w-2.5" />
                      Unscored
                    </Badge>
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