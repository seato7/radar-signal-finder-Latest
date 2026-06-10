import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bell, Trash2, Pause, Play, Settings, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getPlanLimits } from "@/lib/planLimits";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { toDisplayLabel } from "@/lib/displayLabel";
import { LockedPreview } from "@/components/conversion/LockedPreview";
import { useAuthModal } from "@/contexts/AuthModalContext";

function AlertsUpgradeCta() {
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();
  if (isAuthenticated) {
    return (
      <Button asChild className="cta-upgrade-pulse bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary">
        <Link to="/pricing?upgrade_from=alerts_synthetic">Start 7-day trial for full alerts access</Link>
      </Button>
    );
  }
  return (
    <Button
      onClick={() => openAuthModal("signup", { ref: "alerts_synthetic" })}
      className="cta-upgrade-pulse bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary"
    >
      Start Free Access for full alerts
    </Button>
  );
}


interface Alert {
  id: string;
  theme_name: string;
  score: number;
  positives: string[] | null;
  status: 'active' | 'dismissed' | null;
  created_at: string;
}

const Alerts = () => {
  const { toast } = useToast();
  const { user, isAuthenticated, userPlan } = useAuth();
  const alertsLimit = getPlanLimits(userPlan).alerts;
  const [scoreThreshold, setScoreThreshold] = useState("60");
  const [minPositives, setMinPositives] = useState("3");
  const [isSaving, setIsSaving] = useState(false);
  const [alertsList, setAlertsList] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [pausedIds, setPausedIds] = useState<Set<string>>(new Set());

  // Fetch real alerts from database
  useEffect(() => {
    const fetchAlerts = async () => {
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('alerts')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setAlertsList(data || []);
      } catch (error) {
        console.error("Failed to fetch alerts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
  }, [isAuthenticated, user]);

  const handleDismiss = async (id: string) => {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'dismissed' as const })
        .eq('id', id);

      if (error) throw error;

      setAlertsList(alertsList.filter(alert => alert.id !== id));
      toast({
        title: "Alert dismissed",
        description: "Alert has been removed"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to dismiss alert",
        variant: "destructive"
      });
    }
  };

  const handleDismissAll = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('alerts')
        .update({ status: 'dismissed' as const })
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;

      setAlertsList([]);
      toast({
        title: "All dismissed",
        description: "All alerts have been dismissed"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to dismiss all alerts",
        variant: "destructive"
      });
    }
  };

  const handleSaveThresholds = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication required",
        description: "Please log in to update thresholds",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.functions.invoke('manage-alert-settings', {
        body: {
          action: 'update_thresholds',
          score_threshold: parseFloat(scoreThreshold),
          min_positives: parseInt(minPositives)
        }
      });

      if (error) throw error;

      toast({
        title: "Thresholds updated",
        description: "Alert thresholds saved successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update thresholds",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const togglePause = (id: string) => {
    setPausedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast({ title: "Alert resumed" });
      } else {
        next.add(id);
        toast({ title: "Alert paused" });
      }
      return next;
    });
  };

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const confirmAlert = alertsList.find((a) => a.id === confirmRemoveId) ?? null;



  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  };

  // Anonymous = Free: render the same locked form. CTA opens auth modal.


  if (alertsLimit === 0) {
    const examples = [
      { name: "Semiconductor Earnings Watch", score: 84, time: "2h ago", positives: ["insider_buying", "options_flow", "news_sentiment"] },
      { name: "Energy Transition", score: 76, time: "6h ago", positives: ["dark_pool", "institutional_flow", "policy_signal"] },
      { name: "Defense Spending Cycle", score: 71, time: "1d ago", positives: ["congressional_trades", "supply_chain", "news_sentiment"] },
    ];
    return (
      <div className="space-y-6">
        <PageHeader
          title="Alerts"
          description="Real-time notifications for high-priority opportunities"
        />
        <div className="max-w-5xl mx-auto w-full space-y-6">
          <div className="text-center max-w-2xl mx-auto pt-4">
            <h2 className="text-h3 font-semibold text-ds-text-primary mb-2">Don't miss the next major mover.</h2>
            <p className="text-body text-ds-text-secondary">
              Alerts notify you the moment a high-score signal fires on your themes.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {examples.map((ex) => (
              <LockedPreview
                key={ex.name}
                mode="card"
                intensity="medium"
                targetTier="starter"
                trackingLabel="alerts_example"
              >
                <div className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 h-full">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-h4 font-semibold text-ds-text-primary tracking-tight">{ex.name}</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-medium border border-ds-signal-positive text-ds-signal-positive shrink-0">
                      Active
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {ex.positives.map((p) => (
                      <span key={p} className="px-2 py-0.5 rounded-ds-sm bg-ds-surface-elevated border border-ds-border text-caption font-mono text-ds-text-secondary">
                        {toDisplayLabel(p)}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-caption font-mono text-ds-text-muted">{ex.time}</span>
                    <span className="text-data-sm font-mono font-semibold text-ds-signal-positive">{ex.score}</span>
                  </div>
                </div>
              </LockedPreview>
            ))}
          </div>
          <div className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md p-5 md:p-6 opacity-70 pointer-events-none">
            <div className="flex items-center gap-2 mb-1">
              <Settings className="h-5 w-5 text-ds-brand-primary" />
              <h2 className="text-h4 font-semibold text-ds-text-primary">Alert Thresholds</h2>
            </div>
            <p className="text-body-sm text-ds-text-secondary mb-5">Configure when alerts should fire</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-body-sm text-ds-text-secondary">Minimum Score</Label>
                <Input disabled value="60" className="bg-ds-surface-elevated border-ds-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-body-sm text-ds-text-secondary">Minimum Positive Components</Label>
                <Input disabled value="3" className="bg-ds-surface-elevated border-ds-border" />
              </div>
            </div>
          </div>
          <div className="flex justify-center pt-2">
            <AlertsUpgradeCta />
          </div>

        </div>
      </div>
    );
  }


  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        description="Real-time notifications for high-priority opportunities"
        action={
          alertsList.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismissAll}
              className="border-ds-border text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
            >
              Dismiss All
            </Button>
          ) : undefined
        }
      />

      <div className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md p-5 md:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-5 w-5 text-ds-brand-primary" />
          <h2 className="text-h4 font-semibold text-ds-text-primary">Alert Thresholds</h2>
        </div>
        <p className="text-body-sm text-ds-text-secondary mb-5">Configure when alerts should fire</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="score-threshold" className="text-body-sm text-ds-text-secondary">Minimum Score</Label>
            <Input
              id="score-threshold"
              type="number"
              step="1"
              min="0"
              max="100"
              value={scoreThreshold}
              onChange={(e) => setScoreThreshold(e.target.value)}
              placeholder="60"
              className="bg-ds-surface-elevated border-ds-border text-ds-text-primary placeholder:text-ds-text-muted focus:border-ds-border-focus"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="min-positives" className="text-body-sm text-ds-text-secondary">Minimum Positive Components</Label>
            <Input
              id="min-positives"
              type="number"
              min="1"
              max="10"
              value={minPositives}
              onChange={(e) => setMinPositives(e.target.value)}
              placeholder="3"
              className="bg-ds-surface-elevated border-ds-border text-ds-text-primary placeholder:text-ds-text-muted focus:border-ds-border-focus"
            />
          </div>
        </div>
        <Button
          onClick={handleSaveThresholds}
          disabled={isSaving}
          className="mt-5 bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary transition-colors duration-fast"
        >
          {isSaving ? "Saving..." : "Save Thresholds"}
        </Button>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-ds-brand-primary" />
            <p className="text-ds-text-secondary mt-2">Loading alerts...</p>
          </div>
        ) : alertsList.length === 0 ? (
          <div className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md p-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-ds-text-muted mb-4" />
            <p className="text-body-lg font-semibold text-ds-text-primary mb-1">No active alerts yet</p>
            <p className="text-body text-ds-text-secondary mb-6">
              Subscribe to themes to receive alerts when investment opportunities arise.
            </p>
            <Button
              asChild
              className="bg-ds-brand-primary text-ds-brand-primary-foreground hover:bg-ds-brand-secondary transition-colors duration-fast"
            >
              <Link to="/themes">Browse Themes</Link>
            </Button>
          </div>
        ) : (
          alertsList.map((alert) => {
            const isPaused = pausedIds.has(alert.id);

            return (
              <div
                key={alert.id}
                className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 hover:border-ds-border-strong hover:shadow-ds-lg transition-all duration-fast ease-ds-out group"
              >
                <div className="flex flex-col gap-3">
                  {/* Row 1: Theme name + Status pill */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-h4 font-semibold text-ds-text-primary tracking-tight truncate min-w-0">
                      {alert.theme_name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-medium border shrink-0 ${
                        isPaused
                          ? "border-ds-border text-ds-text-muted"
                          : "border-ds-signal-positive text-ds-signal-positive"
                      }`}
                    >
                      {isPaused ? "Paused" : "Active"}
                    </span>
                  </div>

                  {/* Row 2: Signal-type filter chips */}
                  {alert.positives && alert.positives.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {alert.positives.slice(0, 4).map((p, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-ds-sm bg-ds-surface-elevated border border-ds-border text-caption font-mono text-ds-text-secondary"
                        >
                          {toDisplayLabel(p)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Row 3: Last-triggered timestamp */}
                  <div className="text-caption font-mono text-ds-text-muted">
                    {formatTimeAgo(alert.created_at)}
                  </div>

                  {/* Row 4: Action icons */}
                  <div className="flex items-center gap-1 pt-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
                          onClick={() => togglePause(alert.id)}
                          aria-label={isPaused ? "Resume notifications" : "Pause notifications"}
                        >
                          {isPaused ? (
                            <Play className="h-4 w-4" />
                          ) : (
                            <Pause className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-ds-surface-elevated border border-ds-border text-caption text-ds-text-primary">
                        {isPaused ? "Resume notifications" : "Pause notifications"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-ds-text-muted hover:text-ds-signal-negative hover:bg-ds-surface-elevated"
                          onClick={() => setConfirmRemoveId(alert.id)}
                          aria-label="Remove alert permanently"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-ds-surface-elevated border border-ds-border text-caption text-ds-text-primary">
                        Remove alert permanently
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={confirmRemoveId !== null} onOpenChange={(open) => !open && setConfirmRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this alert?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to re-subscribe to {confirmAlert?.theme_name ?? "this theme"} to bring it back. Your alert history will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-ds-text-secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemoveId) handleDismiss(confirmRemoveId);
                setConfirmRemoveId(null);
              }}
              className="bg-ds-signal-negative text-white hover:bg-ds-signal-negative/90"
            >
              Remove alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
};

export default Alerts;

