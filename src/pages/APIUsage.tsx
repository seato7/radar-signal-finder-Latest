import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { AlertTriangle, TrendingUp, DollarSign, Activity, CheckCircle2, XCircle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#a4de6c', '#d084d0', '#ffb3ba'];

export default function APIUsage() {
  const [timeRange, setTimeRange] = useState<24 | 168 | 720>(24); // 24h, 7d, 30d

  // Fetch API usage summary
  const { data: usageSummary, isLoading: loadingUsage } = useQuery({
    queryKey: ["api-usage-summary", timeRange],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_api_usage_summary", {
        hours_back: timeRange
      });
      if (error) throw error;
      return data as Array<{
        api_name: string;
        total_calls: number;
        successful_calls: number;
        failed_calls: number;
        cached_calls: number;
        success_rate: number;
        avg_response_time_ms: number;
        estimated_cost: number;
      }>;
    },
    refetchInterval: 30000 // Refresh every 30s
  });

  // Fetch API costs configuration
  const { data: apiCosts } = useQuery({
    queryKey: ["api-costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_costs")
        .select("*")
        .order("api_name");
      if (error) throw error;
      return data;
    }
  });

  // Fetch recent API logs for time-series chart
  const { data: apiLogs } = useQuery({
    queryKey: ["api-logs", timeRange],
    queryFn: async () => {
      const hoursBack = timeRange;
      const { data, error } = await supabase
        .from("api_usage_logs")
        .select("*")
        .gte("created_at", new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  // Calculate totals
  const totalCalls = usageSummary?.reduce((sum, api) => sum + Number(api.total_calls), 0) || 0;
  const totalCost = usageSummary?.reduce((sum, api) => sum + Number(api.estimated_cost), 0) || 0;
  const avgSuccessRate = usageSummary?.reduce((sum, api) => sum + Number(api.success_rate), 0) / (usageSummary?.length || 1) || 0;

  // Prepare chart data
  const apiCallsData = usageSummary?.map(api => ({
    name: api.api_name,
    calls: Number(api.total_calls),
    success: Number(api.successful_calls),
    failed: Number(api.failed_calls),
    cached: Number(api.cached_calls)
  })) || [];

  const costData = usageSummary?.filter(api => Number(api.estimated_cost) > 0).map(api => ({
    name: api.api_name,
    cost: Number(api.estimated_cost)
  })) || [];

  // Calculate real costs from actual API usage data
  // AUDITED: Based on actual 30-day data from ingest_logs (Dec 23, 2025)
  // 
  // Raw data from database:
  // - Twelve Data: 21,740 runs (twelvedata source) - Fixed $79/mo
  // - Perplexity: 382 (Perplexity API) + 83 (Perplexity AI) = 465 calls
  // - Lovable AI: 188 (Multi-source) + 12 (Batch) = 200 calls
  // - Firecrawl: 4 calls total (Firecrawl Search)
  // - Yahoo Finance: Deprecated (stopped Dec 3)
  // - Alpha Vantage: 99.8% failure rate, effectively unused
  // - SEC EDGAR, RSS Feeds, OpenFIGI: Free APIs
  const actualCosts = {
    twelveData: {
      monthlyFixed: 79, // Grow plan fixed cost
      callsPerMonth: 21740,
      description: "Grow plan (55 credits/min, unlimited daily)"
    },
    firecrawl: {
      // Actual: Only 4 Firecrawl Search calls in 30 days
      callsPerMonth: 4,
      costPerCall: 0.002,
      get monthlyCost() {
        return this.callsPerMonth * this.costPerCall;
      }
    },
    lovableAI: {
      // Actual: 188 (AI Research + Multi-source) + 12 (Batch) = 200 calls
      callsPerMonth: 200,
      costPerCall: 0.0002, // $0.20 per 1M tokens, ~1000 tokens avg
      get monthlyCost() {
        return this.callsPerMonth * this.costPerCall;
      }
    },
    perplexity: {
      // Actual: 382 (Perplexity API from ingest_logs) + 83 (Perplexity AI) = 465
      // Note: api_usage_logs shows higher numbers but includes failures
      callsPerMonth: 465,
      costPerCall: 0.005,
      get monthlyCost() {
        return this.callsPerMonth * this.costPerCall;
      }
    },
    freeAPIs: {
      description: "SEC EDGAR, RSS Feeds, OpenFIGI, FRED, Reddit",
      monthlyCost: 0
    },
    get totalMonthly() {
      return this.twelveData.monthlyFixed + 
             this.firecrawl.monthlyCost + 
             this.lovableAI.monthlyCost + 
             this.perplexity.monthlyCost + 
             this.freeAPIs.monthlyCost;
    },
    get dailyAverage() {
      return this.totalMonthly / 30;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Usage Dashboard"
        description="Real-time monitoring of external API usage, costs, and reliability"
      />

      {/* Info Banner - Twelve Data Migration */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Price Data Provider:</strong> Prices are now powered by Twelve Data (Grow plan - $79/mo). 
          Crypto/Forex refresh every 10 min, Stocks/Commodities every 30 min.
        </AlertDescription>
      </Alert>


      {/* Monthly Cost Estimate Card - Based on Actual Usage */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader>
          <CardTitle>Monthly API Costs (Based on Actual Usage)</CardTitle>
          <CardDescription>Calculated from real 30-day API call logs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Twelve Data (Prices)</div>
              <div className="text-2xl font-bold">${actualCosts.twelveData.monthlyFixed}/mo</div>
              <div className="text-xs text-muted-foreground">
                Fixed monthly cost
                <div className="mt-1 space-y-0.5">
                  <div>• 55 credits/min limit</div>
                  <div>• Unlimited daily calls</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Firecrawl (Scraping)</div>
              <div className="text-2xl font-bold">${actualCosts.firecrawl.monthlyCost.toFixed(2)}/mo</div>
              <div className="text-xs text-muted-foreground">
                ~{actualCosts.firecrawl.callsPerMonth} calls/mo
                <div className="mt-1 space-y-0.5">
                  <div>• ${actualCosts.firecrawl.costPerCall}/call</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Lovable AI (Gemini)</div>
              <div className="text-2xl font-bold">${actualCosts.lovableAI.monthlyCost.toFixed(2)}/mo</div>
              <div className="text-xs text-muted-foreground">
                ~{actualCosts.lovableAI.callsPerMonth} calls/mo
                <div className="mt-1 space-y-0.5">
                  <div>• AI Research + Multi-source</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Perplexity AI</div>
              <div className="text-2xl font-bold">${actualCosts.perplexity.monthlyCost.toFixed(2)}/mo</div>
              <div className="text-xs text-muted-foreground">
                ~{actualCosts.perplexity.callsPerMonth.toLocaleString()} calls/mo
                <div className="mt-1 space-y-0.5">
                  <div>• ${actualCosts.perplexity.costPerCall}/call</div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Total Monthly Cost</div>
              <div className="text-2xl font-bold text-primary">${actualCosts.totalMonthly.toFixed(2)}/mo</div>
              <div className="text-lg font-semibold mt-2">${actualCosts.dailyAverage.toFixed(2)}/day</div>
              <div className="text-xs text-muted-foreground mt-1">
                Based on actual 30-day usage
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
            <div className="font-medium mb-2">📊 Cost Breakdown:</div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div>• Twelve Data: Fixed ${actualCosts.twelveData.monthlyFixed}/mo (price data)</div>
              <div>• Perplexity: ${actualCosts.perplexity.monthlyCost.toFixed(2)}/mo (AI search)</div>
              <div>• Firecrawl: ${actualCosts.firecrawl.monthlyCost.toFixed(2)}/mo (web scraping)</div>
              <div>• Lovable AI: ${actualCosts.lovableAI.monthlyCost.toFixed(2)}/mo (research reports)</div>
              <div>• Free APIs: Yahoo, Alpha Vantage, SEC EDGAR, Reddit, FRED</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total API Calls</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingUsage ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalCalls.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Last {timeRange} hours</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variable API Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingUsage ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
                <p className="text-xs text-muted-foreground">
                  Excl. Twelve Data fixed cost
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingUsage ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{avgSuccessRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">Across all APIs</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Price Data Provider</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Twelve Data</div>
            <p className="text-xs text-muted-foreground">
              Grow plan (55 credits/min)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Time Range Selector */}
      <Tabs value={String(timeRange)} onValueChange={(v) => setTimeRange(Number(v) as 24 | 168 | 720)}>
        <TabsList>
          <TabsTrigger value="24">Last 24 Hours</TabsTrigger>
          <TabsTrigger value="168">Last 7 Days</TabsTrigger>
          <TabsTrigger value="720">Last 30 Days</TabsTrigger>
        </TabsList>

        <TabsContent value={String(timeRange)} className="space-y-6">
          {/* API Calls Chart */}
          <Card>
            <CardHeader>
              <CardTitle>API Calls by Source</CardTitle>
              <CardDescription>Total calls, success, failure, and cache hits</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUsage ? (
                <Skeleton className="h-80 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={apiCallsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="success" stackId="a" fill="#82ca9d" name="Success" />
                    <Bar dataKey="failed" stackId="a" fill="#ff7c7c" name="Failed" />
                    <Bar dataKey="cached" stackId="a" fill="#8dd1e1" name="Cached" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Cost Distribution */}
          {costData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Cost Distribution</CardTitle>
                <CardDescription>Estimated cost by API (variable costs only)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={costData}
                      dataKey="cost"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.name}: $${entry.cost.toFixed(4)}`}
                    >
                      {costData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Detailed API Table */}
          <Card>
            <CardHeader>
              <CardTitle>API Usage Details</CardTitle>
              <CardDescription>Comprehensive metrics for each API</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUsage ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">API</th>
                        <th className="text-right p-2">Total Calls</th>
                        <th className="text-right p-2">Success</th>
                        <th className="text-right p-2">Failed</th>
                        <th className="text-right p-2">Cached</th>
                        <th className="text-right p-2">Success Rate</th>
                        <th className="text-right p-2">Avg Response</th>
                        <th className="text-right p-2">Cost</th>
                        <th className="text-center p-2">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageSummary?.map((api) => {
                        const costInfo = apiCosts?.find(c => c.api_name === api.api_name);
                        return (
                          <tr key={api.api_name} className="border-b hover:bg-muted/50">
                            <td className="p-2 font-medium">{api.api_name}</td>
                            <td className="text-right p-2">{Number(api.total_calls).toLocaleString()}</td>
                            <td className="text-right p-2 text-green-600">{Number(api.successful_calls).toLocaleString()}</td>
                            <td className="text-right p-2 text-red-600">{Number(api.failed_calls).toLocaleString()}</td>
                            <td className="text-right p-2 text-blue-600">{Number(api.cached_calls).toLocaleString()}</td>
                            <td className="text-right p-2">
                              <Badge variant={Number(api.success_rate) >= 95 ? "default" : "destructive"}>
                                {Number(api.success_rate).toFixed(1)}%
                              </Badge>
                            </td>
                            <td className="text-right p-2">{Number(api.avg_response_time_ms).toFixed(0)}ms</td>
                            <td className="text-right p-2">${Number(api.estimated_cost).toFixed(4)}</td>
                            <td className="text-center p-2">
                              <Badge variant={costInfo?.is_paid ? "secondary" : "outline"}>
                                {costInfo?.is_paid ? "Paid" : "Free"}
                              </Badge>
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

          {/* API Costs Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>API Cost Configuration</CardTitle>
              <CardDescription>Configured cost rates and limits for each API</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">API Name</th>
                      <th className="text-right p-2">Cost per Call</th>
                      <th className="text-right p-2">Daily Limit</th>
                      <th className="text-center p-2">Type</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiCosts?.map((cost) => (
                      <tr key={cost.api_name} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium">{cost.api_name}</td>
                        <td className="text-right p-2">${cost.cost_per_call?.toFixed(4) || '0.0000'}</td>
                        <td className="text-right p-2">{cost.daily_limit?.toLocaleString() || 'Unlimited'}</td>
                        <td className="text-center p-2">
                          <Badge variant={cost.is_paid ? "secondary" : "outline"}>
                            {cost.is_paid ? "Paid" : "Free"}
                          </Badge>
                        </td>
                        <td className="p-2 text-muted-foreground text-xs">{cost.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
