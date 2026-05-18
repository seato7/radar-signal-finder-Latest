import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Info, Bell, ArrowRight, Sparkles } from "lucide-react";
import { BlurredUpgradeOverlay } from "@/components/BlurredUpgradeOverlay";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getPlanLimits } from "@/lib/planLimits";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface ThemeScore {
  id: string;
  name: string;
  score: number;
  is_demo: boolean;
  ai_summary: string | null;
  tickers: string[];
  signal_count: number;
  is_tracking: boolean;
}

const Themes = () => {
  const [themes, setThemes] = useState<ThemeScore[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [whyNowData, setWhyNowData] = useState<Record<string, any>>({});
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const { toast } = useToast();
  const { token, isAuthenticated, userPlan } = useAuth();

  const planLimits = getPlanLimits(userPlan);
  const userThemeLimit = planLimits.themes;
  const hasUnlimitedThemes = userThemeLimit === -1;
  const isFree = userPlan === 'free' || !userPlan;

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    setLoadingThemes(true);
    try {
      const [{ data, error }, tickersRes, scoresRes] = await Promise.all([
        (supabase.rpc as any)('get_themes_for_user'),
        supabase.from('themes').select('id, tickers'),
        supabase
          .from('theme_scores')
          .select('theme_id, signal_count, computed_at')
          .order('computed_at', { ascending: false }),
      ]);

      if (error) throw error;

      const tickersMap = new Map<string, string[]>(
        ((tickersRes.data ?? []) as Array<{ id: string; tickers: string[] | null }>).map((t) => [
          t.id,
          Array.isArray(t.tickers) ? t.tickers : [],
        ]),
      );

      const signalCountMap = new Map<string, number>();
      for (const s of (scoresRes.data ?? []) as Array<{ theme_id: string; signal_count: number | null }>) {
        if (!signalCountMap.has(s.theme_id)) {
          signalCountMap.set(s.theme_id, Number(s.signal_count ?? 0));
        }
      }

      const rows = (data ?? []) as Array<{
        id: string;
        name: string;
        score: number | null;
        is_demo: boolean;
        ai_summary: string | null;
      }>;

      const mapped: ThemeScore[] = rows.map((r) => {
        const tickers = tickersMap.get(r.id) ?? [];
        const signalCount = signalCountMap.get(r.id) ?? 0;
        const score = Number(r.score ?? 0);
        // B3 "tracking" state: no tickers, no signals, default neutral score
        const isTracking = tickers.length === 0 && signalCount === 0 && score === 50;
        return {
          id: r.id,
          name: r.name,
          score,
          is_demo: Boolean(r.is_demo),
          ai_summary: r.ai_summary,
          tickers,
          signal_count: signalCount,
          is_tracking: isTracking,
        };
      });

      // Sort: scored themes first (desc by score), tracking themes last
      mapped.sort((a, b) => {
        if (a.is_tracking !== b.is_tracking) return a.is_tracking ? 1 : -1;
        return b.score - a.score;
      });

      setThemes(mapped);

      // Fetch "why now?" for accessible, scored themes only
      const accessibleThemes = hasUnlimitedThemes ? mapped : mapped.slice(0, userThemeLimit);
      accessibleThemes
        .filter((t) => !t.is_tracking)
        .forEach((theme) => {
          fetchWhyNow(theme.id, theme.name);
        });
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
      const { data, error } = await supabase.functions.invoke('explain-theme', {
        body: { theme_id: themeId }
      });
      
      if (error) throw error;
      setWhyNowData(prev => ({ ...prev, [themeName]: data }));
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
      const { error } = await supabase.functions.invoke('manage-alert-settings', {
        body: {
          action: 'subscribe',
          theme_id: themeId,
          theme_name: themeName,
        }
      });

      if (error) throw error;

      toast({
        title: "Subscribed!",
        description: `You'll receive alerts for ${themeName}`
      });
    } catch (error: any) {
      toast({
        title: "Subscription failed",
        description: error.message || "Failed to subscribe",
        variant: "destructive"
      });
    } finally {
      setSubscribing(null);
    }
  };

  const showScore = planLimits.show_scores;

  const isThemeLocked = (index: number, theme: ThemeScore) => {
    if (isFree && theme.is_demo) return false;
    if (hasUnlimitedThemes) return false;
    return index >= userThemeLimit;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-ds-signal-positive';
    if (score >= 60) return 'text-ds-signal-warning';
    if (score >= 50) return 'text-ds-text-muted';
    return 'text-ds-text-muted';
  };

  const getStrengthBadgeClass = (score: number) => {
    if (score >= 75) return 'border-ds-signal-positive/40 text-ds-signal-positive';
    if (score >= 60) return 'border-ds-signal-warning/40 text-ds-signal-warning';
    return 'border-ds-border text-ds-text-muted';
  };

  const getProgressColor = (score: number) => {
    if (score >= 70) return 'bg-ds-signal-positive';
    if (score >= 60) return 'bg-ds-signal-warning';
    return 'bg-ds-text-muted';
  };

  if (loadingThemes) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Theme Tracker"
          description="Multi-signal data points across all data sources"
        />
        <div className="text-center py-12">
          <p className="text-caption text-ds-text-muted">Loading themes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Theme Tracker"
        description={`Multi-signal data points across all data sources ${hasUnlimitedThemes ? '(Unlimited)' : `(${userThemeLimit} of ${themes.length} available)`}`}
      />

      {!hasUnlimitedThemes && themes.length > userThemeLimit && (
        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-ds-brand-primary" />
              <CardTitle className="text-h4 font-semibold text-ds-text-primary">Unlock All {themes.length} Investment Themes</CardTitle>
            </div>
            <CardDescription className="text-body-sm text-ds-text-secondary mt-1">
              You're currently viewing {userThemeLimit} of {themes.length} themes. Upgrade to Pro or Premium for unlimited access to all themes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full sm:w-auto border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent" variant="outline">
              <Link to="/pricing">
                View Plans
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {themes.map((theme, index) => {
          const isLocked = isThemeLocked(index, theme);
          const isTracking = theme.is_tracking;
          const scoreLabel = isTracking
            ? '—'
            : showScore
              ? theme.score.toFixed(1)
              : '__';
          const strengthLabel = isTracking
            ? 'Tracking'
            : showScore
              ? (theme.score >= 75 ? 'Strong' : theme.score >= 60 ? 'Moderate' : 'Weak')
              : 'Premium only';
          const strengthClass = isTracking
            ? 'border-ds-border text-ds-text-muted'
            : showScore
              ? getStrengthBadgeClass(theme.score)
              : 'border-ds-border text-ds-text-muted';
          const scoreClass = isTracking
            ? 'text-ds-text-muted'
            : showScore
              ? getScoreColor(theme.score)
              : 'text-ds-text-muted';

          const cardContent = (
            <Card className={`bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md hover:shadow-ds-lg hover:border-ds-border-strong transition-all duration-fast ease-ds-out h-full flex flex-col ${isTracking ? 'opacity-70' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-h3 font-semibold text-ds-text-primary tracking-tight mb-1 truncate">
                      {theme.name}
                    </CardTitle>
                    <CardDescription className="text-caption text-ds-text-muted flex items-center gap-1">
                      Score
                      {isTracking && (
                        <span
                          title="This theme is being monitored. A score will appear once enough asset data is available."
                          className="inline-flex"
                        >
                          <Info className="h-3 w-3 text-ds-text-muted" />
                        </span>
                      )}
                    </CardDescription>
                    <div className={`font-mono text-data-lg font-semibold tracking-tight ${scoreClass}`}>
                      {scoreLabel}
                    </div>
                  </div>
                  <Badge variant="outline" className={`shrink-0 mt-1 text-caption font-medium ${strengthClass}`}>
                    {!isTracking && <TrendingUp className="mr-1 h-3 w-3" />}
                    {strengthLabel}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col">
                {theme.ai_summary && (
                  <div className="p-3 rounded-ds-md bg-ds-surface-elevated border border-ds-border">
                    <div className="flex items-start gap-2 mb-2">
                      <Info className="h-4 w-4 text-ds-brand-primary mt-0.5 shrink-0" />
                      <span className="text-body-sm font-medium text-ds-text-primary">Summary</span>
                    </div>
                    <p className="text-body-sm text-ds-text-secondary leading-relaxed">
                      {theme.ai_summary}
                    </p>
                  </div>
                )}
                {whyNowData[theme.name]?.summary && (
                  <div className="p-3 rounded-ds-md bg-ds-surface-elevated border border-ds-border">
                    <div className="flex items-start gap-2 mb-2">
                      <Info className="h-4 w-4 text-ds-brand-primary mt-0.5 shrink-0" />
                      <span className="text-body-sm font-medium text-ds-text-primary">Why now?</span>
                    </div>
                    <p className="text-body-sm text-ds-text-secondary leading-relaxed">
                      {whyNowData[theme.name].summary}
                    </p>
                  </div>
                )}
                <div className="space-y-2 mt-auto pt-2">
                  <div className="flex justify-between text-caption">
                    <span className="text-ds-text-muted">Theme Strength</span>
                    <span className={`font-mono font-semibold ${scoreClass}`}>
                      {scoreLabel}
                    </span>
                  </div>
                  <div className="h-1.5 bg-ds-surface-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full ${isTracking ? 'bg-ds-text-muted/20' : showScore ? getProgressColor(theme.score) : 'bg-ds-text-muted/30'}`}
                      style={{ width: `${isTracking ? 0 : showScore ? Math.min(theme.score, 100) : 0}%` }}
                    />
                  </div>
                </div>
                {isFree && theme.is_demo ? (
                  <div className="flex gap-2 pt-2">
                    <Button asChild className="flex-1 border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent" variant="outline">
                      <Link to="/pricing">
                        Subscribe to Starter to see all assets
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-2">
                    <Button asChild className="flex-1 border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent" variant="outline">
                      <Link to="/asset-radar">
                        View Signals
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      onClick={() => handleSubscribe(theme.id, theme.name)}
                      disabled={subscribing === theme.id}
                      className="flex-1 border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent"
                      variant="outline"
                    >
                      <Bell className="mr-2 h-4 w-4" />
                      {subscribing === theme.id ? "Subscribing..." : "Alerts"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );

          return isLocked ? (
            <BlurredUpgradeOverlay
              key={theme.id}
              feature="Theme Locked"
              description="Upgrade your plan to access this investment theme."
            >
              {cardContent}
            </BlurredUpgradeOverlay>
          ) : (
            <div key={theme.id}>{cardContent}</div>
          );
        })}
      </div>
    </div>
  );
};

export default Themes;
