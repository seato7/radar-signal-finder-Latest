import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Bot, AlertCircle } from "lucide-react";

const Admin = () => {
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const [metrics, setMetrics] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [metricsRes, auditRes] = await Promise.all([
          fetch(`${API_BASE}/api/admin/metrics`),
          fetch(`${API_BASE}/api/admin/audit`)
        ]);
        
        const metricsData = await metricsRes.json();
        const auditData = await auditRes.json();
        
        setMetrics(metricsData);
        setAudit(auditData.bot_actions || []);
      } catch (error) {
        console.error("Failed to fetch admin data:", error);
      }
    };

    fetchData();
  }, []);

  if (!metrics) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        description="System metrics and audit logs"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Bots"
          value={metrics.totals.bots}
          icon={Bot}
        />
        <MetricCard
          title="Total Alerts"
          value={metrics.totals.alerts}
          icon={AlertCircle}
        />
        <MetricCard
          title="Subscriptions"
          value={metrics.totals.subscriptions}
          icon={Users}
        />
        <MetricCard
          title="New Bots (24h)"
          value={metrics.recent_24h.bots_created}
          icon={Activity}
        />
      </div>

      <Card className="shadow-data">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {audit.slice(0, 10).map((log, idx) => (
              <div key={idx} className="flex justify-between items-center p-2 rounded bg-muted/50 text-sm">
                <span className="text-foreground">{log.msg}</span>
                <span className="text-muted-foreground">
                  {new Date(log.ts).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Admin;
