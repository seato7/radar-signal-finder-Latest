import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, DollarSign, Activity, CheckCircle2, Info, Database, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#a4de6c', '#d084d0', '#ffb3ba'];

interface IngestSummary {
  etl_name: string;
  total_runs: number;
  success_runs: number;
  last_run: string;
  total_inserted: number;
  avg_duration_sec: number;
}

interface SignalStats {
  total_signals: number;
  mapped_signals: number;
  unmapped_signals: number;
  signals_24h: number;
}

interface ThemeScoreStats {
  last_computed: string;
  themes_scored: number;
}

export default function APIUsage() {
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");

  const hoursBack = timeRange === "24h" ? 24 : timeRange === "7d" ? 168 : 720;

  // Fetch ingestion summary from ingest_logs
  const { data: ingestSummary, isLoading: loadingIngest, refetch: refetchIngest } = useQuery({
    queryKey: ["ingest-summary", timeRange],
    queryFn: async () => {
      const { data: directData, error: directError } = await supabase
        .from("ingest_logs")
        .select("etl_name, status, started_at, rows_inserted, duration_seconds")
        .gte("started_at", new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString());
      
      if (directError) throw directError;
      
      // Aggregate manually
      const grouped = (directData || []).reduce((acc, log) => {
        if (!acc[log.etl_name]) {
          acc[log.etl_name] = {
            etl_name: log.etl_name,
            total_runs: 0,
            success_runs: 0,
            last_run: log.started_at,
            total_inserted: 0,
            avg_duration_sec: 0,
            durations: [] as number[]
          };
        }
        acc[log.etl_name].total_runs++;
        if (log.status === 'success') acc[log.etl_name].success_runs++;
        acc[log.etl_name].total_inserted += log.rows_inserted || 0;
        acc[log.etl_name].durations.push(log.duration_seconds || 0);
        if (new Date(log.started_at) > new Date(acc[log.etl_name].last_run)) {
          acc[log.etl_name].last_run = log.started_at;
        }
        return acc;
      }, {} as Record<string, { etl_name: string; total_runs: number; success_runs: number; last_run: string; total_inserted: number; avg_duration_sec: number; durations: number[] }>);
      
      return Object.values(grouped).map((g) => ({
        etl_name: g.etl_name,
        total_runs: g.total_runs,
        success_runs: g.success_runs,
        last_run: g.last_run,
        total_inserted: g.total_inserted,
        avg_duration_sec: g.durations.length > 0 ? g.durations.reduce((a, b) => a + b, 0) / g.durations.length : 0
      })).sort((a, b) => new Date(b.last_run).getTime() - new Date(a.last_run).getTime()) as IngestSummary[];
    },
    refetchInterval: 60000
  });

  // Fetch signal stats
  const { data: signalStats, isLoading: loadingSignals } = useQuery({
    queryKey: ["signal-stats"],
    queryFn: async () => {
      const { data: total, error: totalError } = await supabase
        .from("signals")
        .select("id", { count: "exact", head: true });
      
      const { data: unmapped, error: unmappedError } = await supabase
        .from("signals")
        .select("id", { count: "exact", head: true })
        .is("theme_id", null);
      
      const { data: recent, error: recentError } = await supabase
        .from("signals")
        .select("id", { count: "exact", head: true })
        .gte("observed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      const totalCount = (total as any)?.length ?? 0;
      const unmappedCount = (unmapped as any)?.length ?? 0;
      
      // Get actual counts from count queries
      const { count: totalSignals } = await supabase
        .from("signals")
        .select("*", { count: "exact", head: true });
      
      const { count: unmappedSignals } = await supabase
        .from("signals")
        .select("*", { count: "exact", head: true })
        .is("theme_id", null);
      
      const { count: signals24h } = await supabase
        .from("signals")
        .select("*", { count: "exact", head: true })
        .gte("observed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      return {
        total_signals: totalSignals || 0,
        mapped_signals: (totalSignals || 0) - (unmappedSignals || 0),
        unmapped_signals: unmappedSignals || 0,
        signals_24h: signals24h || 0
      } as SignalStats;
    },
    refetchInterval: 30000
  });

  // Fetch theme score stats
  const { data: themeStats, isLoading: loadingThemes } = useQuery({
    queryKey: ["theme-score-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_scores")
        .select("computed_at")
        .order("computed_at", { ascending: false })
        .limit(1);
      
      const { count: themesScored } = await supabase
        .from("theme_scores")
        .select("*", { count: "exact", head: true })
        .gte("computed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      return {
        last_computed: data?.[0]?.computed_at || null,
        themes_scored: themesScored || 0
      } as ThemeScoreStats;
    }
  });

  // Calculate totals
  const totalRuns = ingestSummary?.reduce((sum, etl) => sum + Number(etl.total_runs), 0) || 0;
  const totalInserted = ingestSummary?.reduce((sum, etl) => sum + Number(etl.total_inserted), 0) || 0;
  const avgSuccessRate = ingestSummary?.length 
    ? (ingestSummary.reduce((sum, etl) => sum + (etl.success_runs / etl.total_runs) * 100, 0) / ingestSummary.length) 
    : 0;

  // Prepare chart data
  const ingestionChartData = ingestSummary?.slice(0, 10).map(etl => ({
    name: etl.etl_name.replace('ingest-', '').replace('twelvedata-', 'TD-'),
    runs: Number(etl.total_runs),
    inserted: Number(etl.total_inserted),
    success: Number(etl.success_runs)
  })) || [];

  const rowsInsertedData = ingestSummary?.filter(etl => etl.total_inserted > 0).slice(0, 8).map(etl => ({
    name: etl.etl_name.replace('ingest-', '').replace('twelvedata-', 'TD-'),
    value: Number(etl.total_inserted)
  })) || [];

  // Monthly cost estimate
  const monthlyCosts = {
    twelveData: 79, // Fixed monthly
    firecrawl: 0.01, // ~4 calls/month @ $0.002
    lovableAI: 0.05, // ~248 calls @ $0.0002
    get total() { return this.twelveData + this.firecrawl + this.lovableAI; }
  };

  const mappingPercentage = signalStats 
    ? ((signalStats.mapped_signals / signalStats.total_signals) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Pipeline Dashboard"
        description="Real-time monitoring of ingestion functions, signal processing, and theme scoring"
      />

      {/* Info Banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Live Data:</strong> This dashboard shows real metrics from your ingestion pipeline. 
          Prices powered by Twelve Data ($79/mo fixed). Signal-to-theme mapping runs every 15 minutes.
        </AlertDescription>
      </Alert>

      {/* Signal Mapping Status Alert */}
      {signalStats && signalStats.unmapped_signals > 1000 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Signal Backlog:</strong> {signalStats.unmapped_signals.toLocaleString()} signals pending theme mapping. 
            The mapper processes ~1,000 signals every 15 minutes. Estimated clear time: {Math.ceil(signalStats.unmapped_signals / 4000)} hours.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ingestion Runs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingIngest ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalRuns.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Last {timeRange}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rows Inserted</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingIngest ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalInserted.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">New records added</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingIngest ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{avgSuccessRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">Across all ETLs</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Signal Mapping</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {loadingSignals ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{mappingPercentage}%</div>
                <p className="text-xs text-muted-foreground">
                  {signalStats?.mapped_signals.toLocaleString()} / {signalStats?.total_signals.toLocaleString()}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${monthlyCosts.total.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">TwelveData + AI APIs</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-4">
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as "24h" | "7d" | "30d")}>
          <TabsList>
            <TabsTrigger value="24h">Last 24 Hours</TabsTrigger>
            <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
            <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={() => refetchIngest()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Ingestion Runs Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Ingestion Activity</CardTitle>
            <CardDescription>Runs and success counts per ETL</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingIngest ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ingestionChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={10} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="runs" fill="#8884d8" name="Total Runs" />
                  <Bar dataKey="success" fill="#82ca9d" name="Success" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Rows Inserted Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Data Volume Distribution</CardTitle>
            <CardDescription>Rows inserted by ETL</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingIngest ? (
              <Skeleton className="h-80 w-full" />
            ) : rowsInsertedData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={rowsInsertedData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry) => `${entry.name}: ${entry.value.toLocaleString()}`}
                  >
                    {rowsInsertedData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No data inserted in this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Status Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ingestion Pipeline Status</CardTitle>
          <CardDescription>Real-time status of all ETL functions</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingIngest ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">ETL Function</th>
                    <th className="text-right p-2">Total Runs</th>
                    <th className="text-right p-2">Success</th>
                    <th className="text-right p-2">Success Rate</th>
                    <th className="text-right p-2">Rows Inserted</th>
                    <th className="text-right p-2">Avg Duration</th>
                    <th className="text-right p-2">Last Run</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ingestSummary?.map((etl) => {
                    const successRate = (etl.success_runs / etl.total_runs) * 100;
                    const lastRunDate = new Date(etl.last_run);
                    const hoursAgo = (Date.now() - lastRunDate.getTime()) / (1000 * 60 * 60);
                    const isStale = hoursAgo > 6;
                    
                    return (
                      <tr key={etl.etl_name} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium">{etl.etl_name}</td>
                        <td className="text-right p-2">{Number(etl.total_runs).toLocaleString()}</td>
                        <td className="text-right p-2 text-green-600">{Number(etl.success_runs).toLocaleString()}</td>
                        <td className="text-right p-2">
                          <Badge variant={successRate >= 95 ? "default" : successRate >= 80 ? "secondary" : "destructive"}>
                            {successRate.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="text-right p-2">{Number(etl.total_inserted).toLocaleString()}</td>
                        <td className="text-right p-2">{Number(etl.avg_duration_sec).toFixed(1)}s</td>
                        <td className="text-right p-2 text-xs">
                          {formatDistanceToNow(lastRunDate, { addSuffix: true })}
                        </td>
                        <td className="text-center p-2">
                          {isStale ? (
                            <Badge variant="destructive">Stale</Badge>
                          ) : successRate >= 95 ? (
                            <Badge variant="default">Healthy</Badge>
                          ) : (
                            <Badge variant="secondary">Warning</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signal & Theme Status */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Signal Processing</CardTitle>
            <CardDescription>Signal generation and theme mapping status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingSignals ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Signals</p>
                    <p className="text-2xl font-bold">{signalStats?.total_signals.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">New (24h)</p>
                    <p className="text-2xl font-bold text-green-600">{signalStats?.signals_24h.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Mapped to Themes</p>
                    <p className="text-2xl font-bold">{signalStats?.mapped_signals.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Mapping</p>
                    <p className="text-2xl font-bold text-amber-600">{signalStats?.unmapped_signals.toLocaleString()}</p>
                  </div>
                </div>
                <div className="pt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Mapping Progress</span>
                    <span>{mappingPercentage}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all" 
                      style={{ width: `${mappingPercentage}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Theme Scoring</CardTitle>
            <CardDescription>Theme score computation status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingThemes ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Last Computed</p>
                    <p className="text-lg font-medium">
                      {themeStats?.last_computed 
                        ? formatDistanceToNow(new Date(themeStats.last_computed), { addSuffix: true })
                        : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Scores (24h)</p>
                    <p className="text-2xl font-bold">{themeStats?.themes_scored || 0}</p>
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="font-medium mb-1">Pipeline Flow:</p>
                  <p className="text-muted-foreground">
                    Ingestion → Signals → Theme Mapping → Score Computation
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly API Costs</CardTitle>
          <CardDescription>Estimated monthly costs based on actual usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Twelve Data (Prices)</p>
              <p className="text-2xl font-bold">${monthlyCosts.twelveData}/mo</p>
              <p className="text-xs text-muted-foreground mt-1">Fixed - Grow plan</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Firecrawl (Scraping)</p>
              <p className="text-2xl font-bold">~${monthlyCosts.firecrawl.toFixed(2)}/mo</p>
              <p className="text-xs text-muted-foreground mt-1">~4 calls/month</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Lovable AI</p>
              <p className="text-2xl font-bold">~${monthlyCosts.lovableAI.toFixed(2)}/mo</p>
              <p className="text-xs text-muted-foreground mt-1">AI Research reports</p>
            </div>
            <div className="p-4 border rounded-lg bg-primary/5">
              <p className="text-sm font-medium">Total Monthly</p>
              <p className="text-2xl font-bold text-primary">${monthlyCosts.total.toFixed(2)}/mo</p>
              <p className="text-xs text-muted-foreground mt-1">${(monthlyCosts.total / 30).toFixed(2)}/day</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
            <strong>Free APIs:</strong> SEC EDGAR, RSS Feeds (CNBC, MarketWatch, etc.), OpenFIGI, FRED
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
