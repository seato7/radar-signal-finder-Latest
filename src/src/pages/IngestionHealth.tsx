import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle, Ban, Clock, TrendingUp } from "lucide-react";
import { useState } from "react";

interface IngestionHealthStatus {
  function_name: string;
  last_run_at?: string;
  last_success_at?: string;
  last_error?: string;
  avg_duration_24h?: number;
  success_rate_24h?: number;
  is_circuit_open: boolean;
  circuit_reason?: string;
  primary_api?: string;
  status: 'healthy' | 'degraded' | 'failing' | 'disabled' | 'unknown';
}

interface HealthSummary {
  total_functions: number;
  healthy: number;
  degraded: number;
  failing: number;
  disabled: number;
  unknown: number;
  overall_health: number;
}

export default function IngestionHealth() {
  const [failedOnly, setFailedOnly] = useState(false);

  const { data: healthData, isLoading, refetch } = useQuery({
    queryKey: ["ingestion-health", failedOnly],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ingestion-health', {
        body: { failedOnly }
      });
      
      if (error) throw error;
      
      return data as {
        success: boolean;
        summary: HealthSummary;
        functions: IngestionHealthStatus[];
        timestamp: string;
      };
    },
    refetchInterval: 30000 // Refresh every 30s
  });

  const getStatusIcon = (status: IngestionHealthStatus['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      case 'failing':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'disabled':
        return <Ban className="h-5 w-5 text-muted-foreground" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: IngestionHealthStatus['status']) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      healthy: "default",
      degraded: "secondary",
      failing: "destructive",
      disabled: "outline",
      unknown: "outline"
    };
    
    return (
      <Badge variant={variants[status] || "outline"}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <PageHeader
          title="Ingestion Health"
          description="Monitor the health and status of all data ingestion functions"
        />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const summary = healthData?.summary;
  const functions = healthData?.functions || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Ingestion Health"
          description="Monitor the health and status of all data ingestion functions"
        />
        <div className="flex gap-2">
          <Button
            variant={failedOnly ? "default" : "outline"}
            onClick={() => setFailedOnly(!failedOnly)}
          >
            {failedOnly ? "Show All" : "Failed Only"}
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Overall Health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className={`h-5 w-5 ${summary.overall_health >= 80 ? 'text-success' : summary.overall_health >= 60 ? 'text-warning' : 'text-destructive'}`} />
                <span className="text-2xl font-bold">{summary.overall_health}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Healthy</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="text-2xl font-bold">{summary.healthy}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Degraded</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <span className="text-2xl font-bold">{summary.degraded}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-2xl font-bold">{summary.failing}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Disabled</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-muted-foreground" />
                <span className="text-2xl font-bold">{summary.disabled}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Function List */}
      <Card>
        <CardHeader>
          <CardTitle>Ingestion Functions ({functions.length})</CardTitle>
          <CardDescription>
            Last updated: {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : 'N/A'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {functions.length === 0 ? (
            <Alert>
              <AlertDescription>
                No ingestion functions found. Make sure functions have been executed at least once.
              </AlertDescription>
            </Alert>
          ) : (
            functions.map((func) => (
              <Card key={func.function_name} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(func.status)}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{func.function_name}</h3>
                        {getStatusBadge(func.status)}
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">Last Run:</span>{' '}
                          {formatTimestamp(func.last_run_at)}
                        </div>
                        <div>
                          <span className="font-medium">Last Success:</span>{' '}
                          {formatTimestamp(func.last_success_at)}
                        </div>
                        <div>
                          <span className="font-medium">Success Rate:</span>{' '}
                          {func.success_rate_24h !== undefined ? `${func.success_rate_24h.toFixed(1)}%` : 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Avg Duration:</span>{' '}
                          {formatDuration(func.avg_duration_24h)}
                        </div>
                      </div>

                      {func.is_circuit_open && func.circuit_reason && (
                        <Alert variant="destructive" className="mt-2">
                          <Ban className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Circuit Breaker Open:</strong> {func.circuit_reason}
                          </AlertDescription>
                        </Alert>
                      )}

                      {func.last_error && !func.is_circuit_open && (
                        <Alert variant="destructive" className="mt-2">
                          <XCircle className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Last Error:</strong> {func.last_error}
                          </AlertDescription>
                        </Alert>
                      )}

                      {func.primary_api && (
                        <div className="text-xs text-muted-foreground">
                          Primary API: {func.primary_api}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
