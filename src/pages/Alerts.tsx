import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Settings } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const alerts = [
  {
    id: "1",
    severity: "critical" as const,
    message: "BTC/USD momentum score exceeded threshold (95.2)",
    timestamp: "2 minutes ago",
    read: false,
  },
  {
    id: "2",
    severity: "warning" as const,
    message: "ETH/USD volume spike detected - potential breakout",
    timestamp: "15 minutes ago",
    read: false,
  },
  {
    id: "3",
    severity: "info" as const,
    message: "New theme identified: 'DeFi Institutional Adoption'",
    timestamp: "1 hour ago",
    read: true,
  },
];

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: "destructive",
    label: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    color: "warning",
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "accent",
    label: "Info",
  },
};

const Alerts = () => {
  const { toast } = useToast();
  const { token, isAuthenticated } = useAuth();
  const [scoreThreshold, setScoreThreshold] = useState("2.0");
  const [minPositives, setMinPositives] = useState("3");
  const [isSaving, setIsSaving] = useState(false);
  const [alertsList, setAlertsList] = useState(alerts);

  const handleMarkRead = (id: string) => {
    setAlertsList(alertsList.map(alert => 
      alert.id === id ? { ...alert, read: true } : alert
    ));
  };

  const handleMarkAllRead = () => {
    setAlertsList(alertsList.map(alert => ({ ...alert, read: true })));
    toast({
      title: "All marked as read",
      description: "All alerts have been marked as read"
    });
  };

  const handleDismiss = (id: string) => {
    setAlertsList(alertsList.filter(alert => alert.id !== id));
    toast({
      title: "Alert dismissed",
      description: "Alert has been removed"
    });
  };

  const handleSaveThresholds = async () => {
    if (!isAuthenticated || !token) {
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Center"
        description="Real-time notifications for high-priority opportunities"
        action={
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark All Read
          </Button>
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
              <Label htmlFor="score-threshold">Score Threshold</Label>
              <Input
                id="score-threshold"
                type="number"
                step="0.1"
                value={scoreThreshold}
                onChange={(e) => setScoreThreshold(e.target.value)}
                placeholder="2.0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-positives">Minimum Positive Components</Label>
              <Input
                id="min-positives"
                type="number"
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
        {alertsList.length === 0 ? (
          <Card className="shadow-data">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No alerts at the moment. You'll be notified when opportunities arise.</p>
            </CardContent>
          </Card>
        ) : (
          alertsList.map((alert) => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;

          return (
            <Card
              key={alert.id}
              className={`shadow-data transition-opacity ${alert.read ? "opacity-60" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 ${
                    alert.severity === 'critical' ? 'text-destructive' :
                    alert.severity === 'warning' ? 'text-warning' :
                    'text-accent'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-foreground leading-relaxed">
                        {alert.message}
                      </p>
                      {!alert.read && (
                        <Badge variant="outline" className="ml-2 border-primary text-primary">
                          New
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{alert.timestamp}</span>
                      <Badge variant="secondary" className="text-xs">
                        {config.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    {!alert.read && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleMarkRead(alert.id)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDismiss(alert.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }))}
      </div>
    </div>
  );
};

export default Alerts;
