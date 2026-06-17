import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp,
  Info,
  Bell,
  ArrowRight,
  Sparkles,
  Search,
  SearchX,
} from "lucide-react";
import { BlurredUpgradeOverlay } from "@/components/BlurredUpgradeOverlay";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getPlanLimits } from "@/lib/planLimits";
import { useAuth } from "@/hooks/useAuth";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAnonSignupCTA } from "@/hooks/useAnonSignupCTA";
import { usePublicPreview } from "@/hooks/usePublicPreview";
import { supabase } from "@/integrations/supabase/client";


interface ThemeScore {
  id: string;
  name: string;
  score: number;
  is_demo: boolean;
  ai_summary: string | null;
  tickers: string[];
  keywords: string[];
  signal_count: number;
  is_tracking: boolean;
  last_calculated_at: string | null;
  created_at: string | null;
}

type SortOption =
  | "score_desc"
  | "score_asc"
  | "active_desc"
  | "updated_desc"
  | "newest"
  | "alpha";

type FilterOption = "all" | "scored" | "tracking" | "subscribed";

const SORT_LABELS: Record<SortOption, string> = {
  score_desc: "Highest Score",
  score_asc: "Lowest Score",
  active_desc: "Most Active",
  updated_desc: "Recently Updated",
  newest: "Newest",
  alpha: "Alphabetical",
};

const formatRelative = (iso: string | null): string => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Updated ${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `Updated ${days}d ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months}mo ago`;
};

const Themes = () => {
  const [themes, setThemes] = useState<ThemeScore[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [whyNowData, setWhyNowData] = useState<Record<string, any>>({});
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = (searchParams.get("sort") as SortOption) || "score_desc";
  const setSort = (next: SortOption) => {
    const params = new URLSearchParams(searchParams);
    if (next === "score_desc") params.delete("sort");
    else params.set("sort", next);
    setSearchParams(params, { replace: true });
  };

  const { toast } = useToast();
  const { token, isAuthenticated, userPlan, user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const anonSignup = useAnonSignupCTA();
  const previewQuery = usePublicPreview();

  const planLimits = getPlanLimits(userPlan);
  const userThemeLimit = planLimits.themes;
  const hasUnlimitedThemes = userThemeLimit === -1;
  const isFree = userPlan === "free" || !userPlan;

  useEffect(() => {
    if (!isAuthenticated) {
      // Anonymous = Free: populate from public preview snapshot.
      if (previewQuery.isLoading || !previewQuery.data) {
        setLoadingThemes(previewQuery.isLoading);
        return;
      }
      const demo = previewQuery.data.demo_themes ?? [];
      const blurred = previewQuery.data.blurred_themes ?? [];
      const mappedDemo: ThemeScore[] = demo.map((t) => ({
        id: t.id, name: t.name, score: Number(t.score ?? 0),
        is_demo: true, ai_summary: t.ai_summary,
        tickers: t.tickers ?? [], keywords: t.keywords ?? [],
        signal_count: t.signal_count ?? 0, is_tracking: false,
        last_calculated_at: t.last_calculated_at, created_at: t.created_at,
      }));
      const mappedBlur: ThemeScore[] = blurred.map((t) => ({
        id: t.id, name: t.name, score: 50, is_demo: false, ai_summary: null,
        tickers: [], keywords: t.keywords ?? [], signal_count: 0,
        is_tracking: false, last_calculated_at: null, created_at: null,
      }));
      setThemes([...mappedDemo, ...mappedBlur]);
      setLoadingThemes(false);
      return;
    }
    fetchThemes();
  }, [isAuthenticated, previewQuery.data, previewQuery.isLoading]);


  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchInput.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!user?.id) {
      setSubscribedIds(new Set());
      return;
    }
    supabase
      .from("user_theme_subscriptions")
      .select("theme_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) setSubscribedIds(new Set(data.map((r: any) => r.theme_id)));
      });
  }, [user?.id]);

  const fetchThemes = async () => {
    setLoadingThemes(true);
    try {
      const [{ data, error }, scoresRes] = await Promise.all([
        (supabase.rpc as any)("get_themes_for_user"),
        supabase
          .from("theme_scores")
          .select("theme_id, signal_count, computed_at")
          .order("computed_at", { ascending: false }),
      ]);

      if (error) throw error;

      const signalCountMap = new Map<string, number>();
      const lastCalcMap = new Map<string, string>();
      for (const s of (scoresRes.data ?? []) as Array<{
        theme_id: string;
        signal_count: number | null;
        computed_at: string | null;
      }>) {
        if (!signalCountMap.has(s.theme_id)) {
          signalCountMap.set(s.theme_id, Number(s.signal_count ?? 0));
          if (s.computed_at) lastCalcMap.set(s.theme_id, s.computed_at);
        }
      }

      const rows = (data ?? []) as Array<{
        id: string;
        name: string;
        score: number | null;
        is_demo: boolean;
        ai_summary: string | null;
        tickers: string[] | null;
        keywords: string[] | null;
        created_at: string | null;
      }>;

      const mapped: ThemeScore[] = rows.map((r) => {
        const tickers = Array.isArray(r.tickers) ? r.tickers : [];
        const keywords = Array.isArray(r.keywords) ? r.keywords : [];
        const signalCount = signalCountMap.get(r.id) ?? 0;
        const score = Number(r.score ?? 0);
        const isTracking = tickers.length === 0 && signalCount === 0 && score === 50;
        return {
          id: r.id,
          name: r.name,
          score,
          is_demo: Boolean(r.is_demo),
          ai_summary: r.ai_summary,
          tickers,
          keywords,
          signal_count: signalCount,
          is_tracking: isTracking,
          last_calculated_at: lastCalcMap.get(r.id) ?? null,
          created_at: r.created_at,
        };

      });

      setThemes(mapped);

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
        variant: "destructive",
      });
    } finally {
      setLoadingThemes(false);
    }
  };

  const fetchWhyNow = async (themeId: string, themeName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("explain-theme", {
        body: { theme_id: themeId },
      });
      if (error) throw error;
      setWhyNowData((prev) => ({ ...prev, [themeName]: data }));
    } catch (error) {
      console.error(`Failed to fetch why now for ${themeName}:`, error);
    }
  };

  const handleSubscribe = async (themeId: string, themeName: string) => {
    if (!isAuthenticated || !token) {
      anonSignup('themes_subscribe');
      return;
    }


    setSubscribing(themeId);
    try {
      const { error } = await supabase.functions.invoke("manage-alert-settings", {
        body: {
          action: "subscribe",
          theme_id: themeId,
          theme_name: themeName,
        },
      });

      if (error) throw error;

      setSubscribedIds((prev) => new Set(prev).add(themeId));
      toast({
        title: "Subscribed!",
        description: `You'll receive alerts for ${themeName}`,
      });
    } catch (error: any) {
      toast({
        title: "Subscription failed",
        description: error.message || "Failed to subscribe",
        variant: "destructive",
      });
    } finally {
      setSubscribing(null);
    }
  };

  const showScore = planLimits.show_scores;

  const visibleThemes = useMemo(() => {
    let list = [...themes];

    // Filter chips
    if (filter === "scored") list = list.filter((t) => !t.is_tracking);
    else if (filter === "tracking") list = list.filter((t) => t.is_tracking);
    else if (filter === "subscribed") list = list.filter((t) => subscribedIds.has(t.id));

    // Search — tokenize by whitespace; every token must match at least one field
    if (debouncedQuery) {
      const tokens = debouncedQuery.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        list = list.filter((t) => {
          const name = t.name.toLowerCase();
          const summary = (t.ai_summary ?? "").toLowerCase();
          const keywords = t.keywords.map((k) => k.toLowerCase());
          const tickers = t.tickers.map((tk) => tk.toLowerCase());
          return tokens.every(
            (tok) =>
              name.includes(tok) ||
              summary.includes(tok) ||
              keywords.some((k) => k.includes(tok)) ||
              tickers.some((tk) => tk.includes(tok)),
          );
        });
      }
    }

    // Sort
    const trackingLast = sort !== "newest" && sort !== "alpha";
    list.sort((a, b) => {
      if (trackingLast && a.is_tracking !== b.is_tracking) return a.is_tracking ? 1 : -1;
      switch (sort) {
        case "score_asc":
          return a.score - b.score;
        case "active_desc":
          return b.signal_count - a.signal_count;
        case "updated_desc": {
          const av = a.last_calculated_at ? new Date(a.last_calculated_at).getTime() : 0;
          const bv = b.last_calculated_at ? new Date(b.last_calculated_at).getTime() : 0;
          return bv - av;
        }
        case "newest": {
          const av = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bv = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bv - av;
        }
        case "alpha":
          return a.name.localeCompare(b.name);
        case "score_desc":
        default:
          return b.score - a.score;
      }
    });

    return list;
  }, [themes, filter, debouncedQuery, sort, subscribedIds]);

  const isThemeLocked = (index: number, theme: ThemeScore) => {
    if (isFree && theme.is_demo) return false;
    if (hasUnlimitedThemes) return false;
    return index >= userThemeLimit;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-ds-signal-positive";
    if (score >= 60) return "text-ds-signal-warning";
    return "text-ds-text-muted";
  };

  const getStrengthBadgeClass = (score: number) => {
    if (score >= 75) return "border-ds-signal-positive/40 text-ds-signal-positive";
    if (score >= 60) return "border-ds-signal-warning/40 text-ds-signal-warning";
    return "border-ds-border text-ds-text-muted";
  };

  const getProgressColor = (score: number) => {
    if (score >= 70) return "bg-ds-signal-positive";
    if (score >= 60) return "bg-ds-signal-warning";
    return "bg-ds-text-muted";
  };

  const filterChips: Array<{ id: FilterOption; label: string }> = [
    { id: "all", label: "All" },
    { id: "scored", label: "Scored" },
    { id: "tracking", label: "Tracking" },
    { id: "subscribed", label: "Subscribed" },
  ];

  if (loadingThemes) {
    return (
      <div className="space-y-6">
        <PageHeader title="Theme Tracker" description="Multi-signal data points across all data sources" />
        <div className="text-center py-12">
          <p className="text-caption text-ds-text-muted">Loading themes...</p>
        </div>
      </div>
    );
  }

  const isFiltering = debouncedQuery.length > 0 || filter !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Theme Tracker"
        description={`Multi-signal data points across all data sources ${hasUnlimitedThemes ? "(Unlimited)" : `(${userThemeLimit} of ${themes.length} available)`}`}
      />

      {!hasUnlimitedThemes && themes.length > userThemeLimit && (
        <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-ds-brand-primary" />
              <CardTitle className="text-h4 font-semibold text-ds-text-primary">
                Unlock All {themes.length} Investment Themes
              </CardTitle>
            </div>
            <CardDescription className="text-body-sm text-ds-text-secondary mt-1">
              You're currently viewing {userThemeLimit} of {themes.length} themes. Upgrade to Pro or Premium for unlimited access to all themes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              className="w-full sm:w-auto border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent"
              variant="outline"
            >
              <Link to="/pricing">
                View Plans
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sticky toolbar */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-ds-background/95 backdrop-blur supports-[backdrop-filter]:bg-ds-background/80 border-b border-ds-border space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 md:max-w-[600px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-muted pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search themes by name, keyword, or ticker..."
              className="pl-9 bg-ds-surface border-ds-border text-ds-text-primary placeholder:text-ds-text-muted"
            />
          </div>
          <div className="flex items-center gap-3">
            {isFiltering && (
              <span className="text-caption font-mono text-ds-text-muted whitespace-nowrap">
                {visibleThemes.length} {visibleThemes.length === 1 ? "result" : "results"}
              </span>
            )}
            <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
              <SelectTrigger className="w-full md:w-[200px] bg-ds-surface border-ds-border text-ds-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortOption[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => {
            const active = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={`px-3 py-1 text-caption rounded-full border transition-colors duration-fast ${
                  active
                    ? "bg-ds-brand-primary border-ds-brand-primary text-ds-brand-primary-foreground"
                    : "bg-transparent border-ds-border text-ds-text-secondary hover:border-ds-border-strong hover:text-ds-text-primary"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {visibleThemes.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
          <SearchX className="h-10 w-10 text-ds-text-muted" />
          <p className="text-body text-ds-text-secondary">
            {debouncedQuery
              ? `No themes match "${debouncedQuery}"`
              : "No themes match the current filter"}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-ds-text-secondary hover:text-ds-text-primary"
            onClick={() => {
              setSearchInput("");
              setFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {visibleThemes.map((theme, index) => {
            const isLocked = isThemeLocked(index, theme);
            const isTracking = theme.is_tracking;
            const scoreLabel = isTracking ? "—" : showScore ? theme.score.toFixed(1) : "__";
            const strengthLabel = isTracking
              ? "Tracking"
              : showScore
                ? theme.score >= 75
                  ? "Strong"
                  : theme.score >= 60
                    ? "Moderate"
                    : "Weak"
                : "Premium only";
            const strengthClass = isTracking
              ? "border-ds-border text-ds-text-muted"
              : showScore
                ? getStrengthBadgeClass(theme.score)
                : "border-ds-border text-ds-text-muted";
            const scoreClass = isTracking
              ? "text-ds-text-muted"
              : showScore
                ? getScoreColor(theme.score)
                : "text-ds-text-muted";

            const topTickers = theme.tickers.slice(0, 5);
            const visibleKeywords = theme.keywords.slice(0, 6);
            const extraKeywords = Math.max(0, theme.keywords.length - visibleKeywords.length);

            const cardContent = (
              <Card
                className={`bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md hover:shadow-ds-lg hover:border-ds-border-strong transition-all duration-fast ease-ds-out h-full flex flex-col ${isTracking ? "opacity-70" : ""}`}
              >
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
                      <p className="text-body-sm text-ds-text-secondary leading-relaxed">{theme.ai_summary}</p>
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

                  {/* Scored theme extras */}
                  {!isTracking && topTickers.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-caption text-ds-text-muted">Top tickers</div>
                      <div className="flex flex-wrap gap-1.5">
                        {topTickers.map((tk) => (
                          <span
                            key={tk}
                            className="px-2 py-0.5 rounded-ds-sm bg-ds-surface-elevated border border-ds-border font-mono text-caption text-ds-text-secondary"
                          >
                            {tk}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isTracking && (
                    <div className="flex items-center justify-between font-mono text-caption text-ds-text-muted">
                      <span>{theme.signal_count} signals</span>
                      <span>{formatRelative(theme.last_calculated_at)}</span>
                    </div>
                  )}

                  {/* Tracking theme keyword hints */}
                  {isTracking && visibleKeywords.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-caption text-ds-text-muted">Tracking keywords</div>
                      <div className="flex flex-wrap gap-1.5">
                        {visibleKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="px-2 py-0.5 rounded-ds-sm bg-ds-surface-elevated border border-ds-border text-caption text-ds-text-muted"
                          >
                            {kw}
                          </span>
                        ))}
                        {extraKeywords > 0 && (
                          <span className="px-2 py-0.5 rounded-ds-sm text-caption text-ds-text-muted">
                            +{extraKeywords} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {isTracking && (
                    <div className="text-caption text-ds-text-muted font-mono">Awaiting signals</div>
                  )}

                  <div className="space-y-2 mt-auto pt-2">
                    <div className="flex justify-between text-caption">
                      <span className="text-ds-text-muted">Theme Strength</span>
                      <span className={`font-mono font-semibold ${scoreClass}`}>{scoreLabel}</span>
                    </div>
                    <div className="h-1.5 bg-ds-surface-elevated rounded-full overflow-hidden">
                      <div
                        className={`h-full ${isTracking ? "bg-ds-text-muted/20" : showScore ? getProgressColor(theme.score) : "bg-ds-text-muted/30"}`}
                        style={{ width: `${isTracking ? 0 : showScore ? Math.min(theme.score, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  {isFree && theme.is_demo ? (
                    <div className="flex gap-2 pt-2">
                      <Button
                        asChild
                        className="flex-1 border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent"
                        variant="outline"
                      >
                        <Link to="/pricing">
                          Subscribe to Starter to see all assets
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-2">
                      {isTracking ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex-1">
                              <Button
                                disabled
                                className="w-full border-ds-border text-ds-text-muted bg-transparent cursor-not-allowed"
                                variant="outline"
                              >
                                View Signals
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>No signals yet to view</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          asChild
                          className="flex-1 border-ds-brand-primary text-ds-brand-primary hover:bg-ds-brand-primary hover:text-ds-brand-primary-foreground bg-transparent"
                          variant="outline"
                        >
                          <Link to="/asset-radar">
                            View Signals
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      )}
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

            return isFree && !theme.is_demo ? (
              <LockedPreview
                key={theme.id}
                mode="card"
                intensity="medium"
                targetTier="pro"
                context="themes"
                trackingLabel="themes_locked_card"
              >
                {cardContent}
              </LockedPreview>
            ) : isLocked ? (
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
      )}
    </div>
  );
};

export default Themes;
