import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Settings, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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

const getSeverity = (score: number): "critical" | "warning" | "info" => {
  if (score >= 80) return "critical";
  if (score >= 60) return "warning";
  return "info";
};

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: "destructive",
    label: "High Priority",
  },
  warning: {
    icon: AlertTriangle,
    color: "warning",
    label: "Medium",
  },
  info: {
    icon: Info,
    color: "accent",
    label: "Info",
  },
};

const Alerts = () => {
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const [scoreThreshold, setScoreThreshold] = useState("60");
  const [minPositives, setMinPositives] = useState("3");
  const [isSaving, setIsSaving] = useState(false);
  const [alertsList, setAlertsList] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

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
          title="Alert Center"
          description="Real-time notifications for high-priority opportunities"
        />
        <Card className="shadow-data">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Please log in to view your alerts.</p>
            <Button asChild className="mt-4">
              <Link to="/auth">Log In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Center"
        description="Real-time notifications for high-priority opportunities"
        action={
          alertsList.length > 0 ? (
            <Button variant="outline" size="sm" onClick={handleDismissAll}>
              Dismiss All
            </Button>
          ) : undefined
        }
      />

      <Card className="shadow-data">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle>Alert Thresholds</CardTitle>
          </div>
          <CardDescription>Configure when alerts should fire</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="score-threshold">Minimum Score</Label>
              <Input
                id="score-threshold"
                type="number"
                step="1"
                min="0"
                max="100"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(e.target.value)}
                placeholder="60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-positives">Minimum Positive Components</Label>
              <Input
                id="min-positives"
                type="number"
                min="1"
                max="10"
                value={minPositives}
                onChange={(e) => setMinPositives(e.target.value)}
                placeholder="3"
              />
            </div>
          </div>
          <Button 
            onClick={handleSaveThresholds} 
            disabled={isSaving}
            className="bg-gradient-chrome text-primary-foreground"
          >
            {isSaving ? "Saving..." : "Save Thresholds"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {loading ? (
          <Card className="shadow-data">
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground mt-2">Loading alerts...</p>
            </CardContent>
          </Card>
        ) : alertsList.length === 0 ? (
          <Card className="shadow-data">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No active alerts. Subscribe to themes to receive alerts when opportunities arise.</p>
              <Button asChild className="mt-4">
                <Link to="/themes">Browse Themes</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          alertsList.map((alert) => {
            const severity = getSeverity(alert.score);
            const config = severityConfig[severity];
            const Icon = config.icon;

            return (
              <Card key={alert.id} className="shadow-data">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 ${
                      severity === 'critical' ? 'text-destructive' :
                      severity === 'warning' ? 'text-warning' :
                      'text-accent'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-foreground leading-relaxed">
                          <strong>{alert.theme_name}</strong> reached a score of {alert.score.toFixed(1)}
                        </p>
                        <Badge variant="outline" className="ml-2 border-primary text-primary">
                          Active
                        </Badge>
                      </div>
                      {alert.positives && alert.positives.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {alert.positives.slice(0, 4).map((p, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{formatTimeAgo(alert.created_at)}</span>
                        <Badge variant="secondary" className="text-xs">
                          {config.label}
                        </Badge>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDismiss(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Alerts;