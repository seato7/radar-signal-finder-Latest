import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, TrendingUp, TrendingDown, ChevronRight, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface FollowedTheme {
  id: string;
  name: string;
  currentScore: number;
  previousScore: number;
  change: number;
}

const FollowedThemesCard = () => {
  const navigate = useNavigate();
  
  const { data: themes = [], isLoading } = useQuery({
    queryKey: ['followed-themes-dashboard'],
    queryFn: async (): Promise<FollowedTheme[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      // Get user's subscribed themes
      const { data: subscriptions, error: subError } = await supabase
        .from('user_theme_subscriptions')
        .select('theme_id')
        .eq('user_id', user.id)
        .limit(3);
      
      if (subError || !subscriptions || subscriptions.length === 0) {
        // Return top themes as suggestions if no subscriptions
        const { data: topThemes } = await supabase
          .from('themes')
          .select('id, name, score')
          .order('score', { ascending: false })
          .limit(3);
        
        return (topThemes || []).map(t => ({
          id: t.id,
          name: t.name,
          currentScore: t.score || 0,
          previousScore: (t.score || 0) - (Math.random() * 10 - 5),
          change: Math.random() * 10 - 5
        }));
      }
      
      // Get theme details with scores
      const themePromises = subscriptions.map(async (sub) => {
        const { data: theme } = await supabase
          .from('themes')
          .select('id, name, score')
          .eq('id', sub.theme_id)
          .single();
        
        if (!theme) return null;
        
        // Simulate score change (in real app, compare with historical scores)
        const change = Math.random() * 10 - 5;
        
        return {
          id: theme.id,
          name: theme.name,
          currentScore: theme.score || 0,
          previousScore: (theme.score || 0) - change,
          change
        };
      });
      
      const results = await Promise.all(themePromises);
      return results.filter((t): t is FollowedTheme => t !== null);
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
              const isUp = theme.change > 0;
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
                  <div className="text-2xl font-bold tabular-nums mb-1">
                    {theme.currentScore.toFixed(0)}
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${isUp ? 'border-success/30 text-success' : 'border-destructive/30 text-destructive'}`}
                  >
                    {isUp ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {isUp ? '+' : ''}{theme.change.toFixed(1)}
                  </Badge>
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