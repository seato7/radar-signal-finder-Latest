import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Flame, TrendingUp, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface ThemeScore {
  id: string;
  name: string;
  score: number;
  components: Record<string, number>;
}

const TopThemesCard = () => {
  const navigate = useNavigate();
  
  const { data: themes = [], isLoading } = useQuery({
    queryKey: ['top-themes-dashboard'],
    queryFn: async (): Promise<ThemeScore[]> => {
      const { data: allThemes, error: themesError } = await supabase
        .from('themes')
        .select('id, name');
      
      if (themesError) throw themesError;
      if (!allThemes || allThemes.length === 0) return [];
      
      const themeScores = await Promise.all(
        allThemes.slice(0, 10).map(async (theme) => {
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
          };
        })
      );
      
      return themeScores
        .filter((theme): theme is ThemeScore => theme !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    },
    staleTime: 10 * 60 * 1000,
  });

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 70) return 'bg-gradient-bull';
    if (score >= 50) return 'bg-gradient-gold';
    return 'bg-muted';
  };

  const getTopSignals = (components: Record<string, number>) => {
    return Object.entries(components)
      .filter(([_, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name);
  };

  return (
    <Card className="card-glow border-border/50 bg-card/80 backdrop-blur h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Flame className="h-5 w-5 text-warning" />
            Top Themes Right Now
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-muted-foreground hover:text-primary"
            onClick={() => navigate('/themes')}
          >
            View All <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/30 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-5 w-32 skeleton-pulse rounded" />
                  <div className="h-6 w-16 skeleton-pulse rounded" />
                </div>
                <div className="h-2 w-full skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : themes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Theme scores are being computed...</p>
          </div>
        ) : (
          themes.map((theme, index) => {
            const topSignals = getTopSignals(theme.components);
            return (
              <div
                key={theme.id}
                className="group p-4 rounded-lg bg-surface-1 border border-border/50 hover:border-primary/30 transition-all cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => navigate(`/themes`)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-chrome flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {theme.name}
                    </span>
                  </div>
                  <div className={`text-2xl font-bold tabular-nums counter-animate ${getScoreColor(theme.score)}`}>
                    {theme.score.toFixed(0)}
                  </div>
                </div>
                
                {/* Score bar */}
                <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden mb-3">
                  <div 
                    className={`h-full rounded-full score-bar ${getScoreBarColor(theme.score)}`}
                    style={{ width: `${Math.min(theme.score, 100)}%` }}
                  />
                </div>
                
                {/* Signal badges */}
                {topSignals.length > 0 && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                    {topSignals.map((signal) => (
                      <Badge key={signal} variant="secondary" className="text-xs px-2 py-0.5">
                        {signal}
                      </Badge>
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