import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

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
  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Center"
        description="Real-time notifications for high-priority opportunities"
        action={
          <Button variant="outline" size="sm">
            Mark All Read
          </Button>
        }
      />

      <div className="space-y-3">
        {alerts.map((alert) => {
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
                  {!alert.read && (
                    <Button variant="ghost" size="sm" className="ml-auto">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Alerts;
