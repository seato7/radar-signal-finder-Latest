import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, ChevronRight, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LockedPreview } from "@/components/conversion/LockedPreview";

interface Alert {
  id: string;
  theme_name: string;
  score: number;
  created_at: string;
  status: string;
}

const RecentAlertsCard = () => {
  const navigate = useNavigate();
  const { limits } = useAuth();
  const alertsAllowed = limits().alerts !== 0;

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['recent-alerts-dashboard'],
    queryFn: async (): Promise<Alert[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('alerts')
        .select('id, theme_name, score, created_at, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card className="bg-ds-surface border border-ds-border rounded-ds-lg shadow-none">
      <CardHeader className="pb-3 px-5 pt-5">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-h4 font-semibold text-ds-text-primary">
            <Bell className="h-5 w-5 text-ds-text-secondary" />
            Your Active Alerts
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-surface-elevated"
            onClick={() => navigate('/alerts')}
          >
            Manage <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {!alertsAllowed ? (
          <LockedPreview
            mode="card"
            intensity="medium"
            targetTier="starter"
            trackingLabel="dashboard_alerts"
          >
            <div className="space-y-2">
              {[
                { name: "AI Infrastructure Boom", score: 84, time: "2h ago" },
                { name: "Clean Energy Transition", score: 71, time: "5h ago" },
                { name: "Defence Spending Surge", score: 63, time: "1d ago" },
              ].map((a, i) => (
                <div key={i} className="p-3 rounded-ds-md bg-ds-surface-elevated border border-ds-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-ds-signal-warning" />
                    <span className="text-body-sm text-ds-text-primary">{a.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-caption font-mono px-1.5 py-0.5 rounded-ds-sm border border-ds-border text-ds-text-secondary">
                      {a.score}
                    </span>
                    <span className="text-caption font-mono text-ds-text-muted">{a.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </LockedPreview>
        ) : isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-ds-md bg-ds-surface-elevated flex items-center justify-between">
                <div className="h-4 w-32 skeleton-pulse rounded" />
                <div className="h-4 w-16 skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <div className="h-10 w-10 mx-auto rounded-ds-md bg-ds-surface-elevated border border-ds-border flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-ds-text-muted" />
            </div>
            <div>
              <p className="text-body-sm text-ds-text-secondary mb-3">No alerts set up yet</p>
              <Button
                variant="outline"
                size="sm"
                className="border-ds-border text-ds-text-primary hover:bg-ds-surface-elevated hover:border-ds-border-strong rounded-ds-md"
                onClick={() => navigate('/alerts')}
              >
                Create Your First Alert
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-ds-md bg-ds-surface-elevated border border-ds-border hover:border-ds-border-strong transition-colors duration-fast ease-ds-out cursor-pointer flex items-center justify-between"
                onClick={() => navigate('/alerts')}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-ds-brand-primary shrink-0" />
                  <span className="text-body-sm font-medium text-ds-text-primary truncate">{alert.theme_name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-caption font-mono px-1.5 py-0.5 rounded-ds-sm border border-ds-border text-ds-text-secondary">
                    {alert.score.toFixed(0)}
                  </span>
                  <span className="text-caption font-mono text-ds-text-muted">{formatTime(alert.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentAlertsCard;
