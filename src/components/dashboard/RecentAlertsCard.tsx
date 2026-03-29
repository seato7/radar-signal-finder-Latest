import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, ChevronRight, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

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
    <Card className="card-glow border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-warning" />
            Your Active Alerts
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-muted-foreground hover:text-primary"
            onClick={() => navigate('/alerts')}
          >
            Manage <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!alertsAllowed ? (
          <div className="text-center py-6 space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Alerts require a paid plan</p>
              <Button variant="outline" size="sm" onClick={() => navigate('/pricing')}>
                View Plans
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/30 flex items-center justify-between">
                <div className="h-4 w-32 skeleton-pulse rounded" />
                <div className="h-4 w-16 skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">No alerts set up yet</p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/alerts')}
              >
                Create Your First Alert
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, index) => (
              <div
                key={alert.id}
                className="p-3 rounded-lg bg-surface-1 border border-border/50 hover:border-warning/30 transition-all cursor-pointer animate-fade-in flex items-center justify-between"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => navigate('/alerts')}
              >
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-warning pulse-live" />
                  <span className="font-medium text-sm text-foreground">{alert.theme_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    Score: {alert.score.toFixed(0)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatTime(alert.created_at)}</span>
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