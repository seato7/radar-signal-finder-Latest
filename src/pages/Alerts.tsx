import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Bell,
  Pencil,
  Trash2,
  Pause,
  Play,
  Settings,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getPlanLimits } from "@/lib/planLimits";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

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

  const handleEdit = () => {
    toast({
      title: "Coming soon",
      description: "Edit alert settings will be available in a future update."
    });
  };

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

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Alerts"
          description="Real-time notifications for high-priority opportunities"
        />
        <div className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-ds-md p-8 text-center">
          <p className="text-ds-text-secondary">Please log in to view your alerts.</p>
          <Button asChild className="mt-4">
            <Link to="/auth">Log In</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (alertsLimit === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Alerts"
          description="Real-time notifications for high-priority opportunities"
        />
        <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-accent/5">
          <CardHeader>
            <CardTitle>Alerts require a paid plan</CardTitle>
            <CardDescription>
              Upgrade to Starter or higher to receive alerts when investment themes reach your thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/pricing">View Plans</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
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
            const threshold = Math.floor(alert.score / 10) * 10;

            return (
              <div
                key={alert.id}
                className="bg-ds-surface border border-ds-border rounded-ds-lg p-5 hover:border-ds-border-strong hover:shadow-ds-lg transition-all duration-fast ease-ds-out group"
              >
                <div className="flex flex-col gap-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-h4 font-semibold text-ds-text-primary tracking-tight truncate">
                        {alert.theme_name}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center font-mono text-data-xs border border-ds-brand-primary text-ds-brand-primary px-1.5 py-0.5 rounded-ds-sm">
                          &gt;{threshold}
                        </span>
                        <span className="text-caption font-mono text-ds-text-muted">
                          {formatTimeAgo(alert.created_at)}
                        </span>
                      </div>
                    </div>
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

                  {/* Positives */}
                  {alert.positives && alert.positives.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {alert.positives.slice(0, 4).map((p, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-ds-sm bg-ds-surface-elevated border border-ds-border text-caption text-ds-text-secondary"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions row */}
                  <div className="flex items-center gap-1 pt-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
                      onClick={handleEdit}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
                      onClick={() => togglePause(alert.id)}
                    >
                      {isPaused ? (
                        <Play className="h-4 w-4" />
                      ) : (
                        <Pause className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-ds-text-muted hover:text-ds-signal-negative hover:bg-ds-surface-elevated"
                      onClick={() => handleDismiss(alert.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Alerts;
