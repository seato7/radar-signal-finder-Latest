import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Info, Bell, ArrowRight, Lock, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { PLAN_LIMITS, checkPlanLimit } from "@/lib/planLimits";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

interface ThemeScore {
  id: string;
  name: string;
  score: number;
  components: Record<string, number>;
  as_of: string;
}

const Themes = () => {
  const [themes, setThemes] = useState<ThemeScore[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [whyNowData, setWhyNowData] = useState<Record<string, any>>({});
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const { toast } = useToast();
  const { token, isAuthenticated, userPlan } = useAuth();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const userThemeLimit = PLAN_LIMITS[userPlan]?.max_themes || 1;
  const hasUnlimitedThemes = userThemeLimit === -1;

  useEffect(() => {
    fetchThemes();
  }, [API_BASE]);

  const fetchThemes = async () => {
    setLoadingThemes(true);
    try {
      const response = await fetch(`${API_BASE}/api/radar/themes?days=45`);
      if (response.ok) {
        const data = await response.json();
        setThemes(data);
        
        // Fetch "why now?" for accessible themes
        const accessibleThemes = hasUnlimitedThemes ? data : data.slice(0, userThemeLimit);
        accessibleThemes.forEach((theme: ThemeScore) => {
          fetchWhyNow(theme.id, theme.name);
        });
      }
    } catch (error) {
      console.error("Failed to fetch themes:", error);
      toast({
        title: "Error",
        description: "Failed to load themes",
        variant: "destructive"
      });
    } finally {
      setLoadingThemes(false);
    }
  };

  const fetchWhyNow = async (themeId: string, themeName: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/themes/${themeId}/why_now`);
      if (response.ok) {
        const data = await response.json();
        setWhyNowData(prev => ({ ...prev, [themeName]: data }));
      }
    } catch (error) {
      console.error(`Failed to fetch why now for ${themeName}:`, error);
    }
  };

  const handleSubscribe = async (themeId: string, themeName: string) => {
    if (!isAuthenticated || !token) {
      toast({
        title: "Authentication required",
        description: "Please log in to subscribe to alerts",
        variant: "destructive"
      });
      return;
    }

    setSubscribing(themeId);
    try {
      const response = await fetch(`${API_BASE}/api/alerts/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ theme_id: themeId })
      });

      if (response.ok) {
        toast({
          title: "Subscribed!",
          description: `You'll receive alerts for ${themeName}`
        });
      } else {
        const error = await response.json();
        toast({
          title: "Subscription failed",
          description: error.detail || "Failed to subscribe",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to subscribe to alerts",
        variant: "destructive"
      });
    } finally {
      setSubscribing(null);
    }
  };

  const getTopComponents = (components: Record<string, number>) => {
    return Object.entries(components)
      .filter(([_, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  };

  const isThemeLocked = (index: number) => {
    if (hasUnlimitedThemes) return false;
    return index >= userThemeLimit;
  };

  if (loadingThemes) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Investment Themes"
          description="Multi-signal opportunities across all data sources"
        />
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading themes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investment Themes"
        description={`Multi-signal opportunities across all data sources ${hasUnlimitedThemes ? '(Unlimited)' : `(${userThemeLimit} of ${themes.length} available)`}`}
      />

      {!hasUnlimitedThemes && themes.length > userThemeLimit && (
        <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Unlock All {themes.length} Investment Themes</CardTitle>
            </div>
            <CardDescription>
              You're currently viewing {userThemeLimit} of {themes.length} themes. Upgrade to Pro or Premium for unlimited access to all themes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/pricing">
                View Plans
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {themes.map((theme, index) => {
          const isLocked = isThemeLocked(index);
          const topComponents = getTopComponents(theme.components);
          
          return (
            <Card 
              key={theme.id} 
              className={`shadow-data relative ${isLocked ? 'opacity-60' : ''}`}
            >
              {isLocked && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                  <div className="text-center p-6">
                    <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-semibold text-lg mb-2">Theme Locked</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upgrade to access this theme
                    </p>
                    <Button asChild size="sm">
                      <Link to="/pricing">View Plans</Link>
                    </Button>
                  </div>
                </div>
              )}
              
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="mb-2">{theme.name}</CardTitle>
                    <CardDescription>
                      Score: {theme.score.toFixed(1)}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`${
                      theme.score >= 80 ? 'border-success text-success' :
                      theme.score >= 60 ? 'border-accent text-accent' :
                      'border-warning text-warning'
                    }`}
                  >
                    <TrendingUp className="mr-1 h-3 w-3" />
                    {theme.score >= 80 ? 'Strong' : theme.score >= 60 ? 'Moderate' : 'Weak'}
                  </Badge>
                </div>
              </CardHeader>
              
              {!isLocked && (
                <CardContent className="space-y-4">
                  {whyNowData[theme.name]?.summary && (
                    <div className="p-3 rounded-md bg-muted/30 border border-border">
                      <div className="flex items-start gap-2 mb-2">
                        <Info className="h-4 w-4 text-primary mt-0.5" />
                        <span className="text-sm font-medium text-foreground">Why now?</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {whyNowData[theme.name].summary}
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Theme Strength</span>
                      <span className="font-bold text-primary">{theme.score.toFixed(1)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-chrome"
                        style={{ width: `${Math.min(theme.score, 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Top Signals</div>
                    <div className="flex gap-2 flex-wrap">
                      {topComponents.map((component) => (
                        <Badge key={component} variant="secondary" className="text-xs">
                          {component}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      asChild
                      className="flex-1"
                      variant="outline"
                    >
                      <Link to="/radar">
                        View Opportunities
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button 
                      onClick={() => handleSubscribe(theme.id, theme.name)}
                      disabled={subscribing === theme.id}
                      className="flex-1"
                      variant="outline"
                    >
                      <Bell className="mr-2 h-4 w-4" />
                      {subscribing === theme.id ? "Subscribing..." : "Alerts"}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Themes;
