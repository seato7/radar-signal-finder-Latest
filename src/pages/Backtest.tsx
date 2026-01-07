import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, AlertCircle, BarChart3, ArrowUp, ArrowDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Period = '1W' | '1M' | 'ALL';

interface PerformanceData {
  portfolio_value: number;
  portfolio_return_pct: number;
  spy_return_pct: number;
  outperformance: number;
  period_days: number;
  start_date: string;
  end_date: string;
  chart_data: Array<{ date: string; portfolio: number; spy: number }>;
  asset_breakdown: Array<{
    ticker: string;
    name: string;
    score: number;
    return_pct: number;
    contribution: number;
    first_price?: number | null;
    last_price?: number | null;
    has_data?: boolean;
  }>;
  starting_investment: number;
  last_updated_at?: string | null;
}

interface DailyHistoryData {
  daily_history: Array<{
    date: string;
    top_assets: Array<{ ticker: string; name: string; score: number; daily_return_pct?: number }>;
    daily_return_pct: number;
    cumulative_value: number;
    spy_daily_return_pct: number;
    spy_cumulative_value: number;
    is_negative_day?: boolean;
  }>;
  start_date: string;
  starting_investment: number;
  total_days: number;
  last_updated_at?: string | null;
}

const Performance = () => {
  const [period, setPeriod] = useState<Period>('ALL');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const { data: performanceData, isLoading: isLoadingPerformance, error: performanceError } = useQuery({
    queryKey: ['performance', period],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('calculate-performance', {
        body: { period },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data as PerformanceData;
    },
  });

  const { data: dailyHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['daily-performance-history'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-daily-performance-history', {
        body: {},
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data as DailyHistoryData;
    },
  });

  const toggleDayExpanded = (date: string) => {
    const newExpanded = new Set(expandedDays);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDays(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Tracker"
        description="Track historical returns from our top-rated assets based on real market data"
      />

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['1W', '1M', 'ALL'] as Period[]).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p === 'ALL' ? 'All Time' : p === '1W' ? '1 Week' : '1 Month'}
          </Button>
        ))}
      </div>

      {/* Hero Card */}
      <Card className="bg-gradient-to-br from-primary/10 via-background to-secondary/10 border-primary/20">
        <CardContent className="pt-6">
          {isLoadingPerformance ? (
            <div className="space-y-4 text-center">
              <Skeleton className="h-8 w-64 mx-auto" />
              <Skeleton className="h-16 w-48 mx-auto" />
              <Skeleton className="h-6 w-40 mx-auto" />
            </div>
          ) : performanceError ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p>Unable to load performance data</p>
              <p className="text-sm mt-2">{performanceError instanceof Error ? performanceError.message : 'Unknown error'}</p>
            </div>
          ) : performanceData ? (
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">
                ${performanceData.starting_investment.toLocaleString()} invested in Top 10 Rated Assets →
              </p>
              <p className="text-5xl font-bold">
                ${performanceData.portfolio_value.toLocaleString()}
              </p>
              <div className="flex items-center justify-center gap-3">
                <Badge
                  variant={performanceData.portfolio_return_pct >= 0 ? 'default' : 'destructive'}
                  className="text-lg px-3 py-1"
                >
                  {performanceData.portfolio_return_pct >= 0 ? (
                    <TrendingUp className="h-4 w-4 mr-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 mr-1" />
                  )}
                  {performanceData.portfolio_return_pct >= 0 ? '+' : ''}
                  {performanceData.portfolio_return_pct.toFixed(2)}%
                </Badge>
                <span className="text-muted-foreground">
                  vs SPY: {performanceData.spy_return_pct >= 0 ? '+' : ''}
                  {performanceData.spy_return_pct.toFixed(2)}%
                </span>
              </div>
              {performanceData.outperformance !== 0 && (
                <p className={cn(
                  "text-sm font-medium",
                  performanceData.outperformance > 0 ? "text-green-500" : "text-red-500"
                )}>
                  {performanceData.outperformance > 0 ? 'Outperforming' : 'Underperforming'} S&P 500 by{' '}
                  {Math.abs(performanceData.outperformance).toFixed(2)}%
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-4">
                {performanceData.period_days} days tracked ({formatDate(performanceData.start_date)} - {formatDate(performanceData.end_date)})
              </p>
              {performanceData.last_updated_at && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(performanceData.last_updated_at).toLocaleString()}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance Over Time
          </CardTitle>
          <CardDescription>
            Top 10 Rated Portfolio vs S&P 500 (SPY)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPerformance ? (
            <Skeleton className="h-[300px] w-full" />
          ) : performanceData?.chart_data && performanceData.chart_data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={performanceData.chart_data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  className="text-xs"
                />
                <YAxis
                  tickFormatter={(value) => `$${(value / 1000).toFixed(1)}k`}
                  className="text-xs"
                />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                  labelFormatter={(label) => formatFullDate(label as string)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="Top 10 Portfolio"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="spy"
                  name="SPY Benchmark"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No chart data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Asset Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Top 10 Rated Assets</CardTitle>
          <CardDescription>
            Individual asset performance with up/down indicators
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPerformance ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : performanceData?.asset_breakdown ? (
            <div className="space-y-2">
              {performanceData.asset_breakdown.map((asset, index) => (
                <div
                  key={asset.ticker}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-6">#{index + 1}</span>
                    <div className="flex items-center gap-2">
                      {asset.return_pct >= 0 ? (
                        <ArrowUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">{asset.ticker}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {asset.name}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="text-xs">
                      Score: {Math.round(asset.score)}
                    </Badge>
                    <div className={cn(
                      "text-right font-medium min-w-[80px]",
                      asset.return_pct >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {asset.return_pct >= 0 ? '+' : ''}{asset.return_pct.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Daily Performance History */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Performance History</CardTitle>
          <CardDescription>
            Day-by-day breakdown starting with $1,000 investment
            {dailyHistory?.start_date && (
              <span className="ml-1">(since {formatDate(dailyHistory.start_date)})</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : dailyHistory?.daily_history ? (
            <div className="space-y-1">
              {dailyHistory.daily_history.slice(0, 30).map((day) => (
                <Collapsible
                  key={day.date}
                  open={expandedDays.has(day.date)}
                  onOpenChange={() => toggleDayExpanded(day.date)}
                >
                  <CollapsibleTrigger asChild>
                    <div className={cn(
                      "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                      day.is_negative_day 
                        ? "bg-red-500/10 hover:bg-red-500/20" 
                        : "bg-muted/30 hover:bg-muted/50"
                    )}>
                      <div className="flex items-center gap-4">
                        <span className="font-medium w-24">{formatFullDate(day.date)}</span>
                        <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {day.top_assets.slice(0, 5).map(a => a.ticker).join(', ')}
                          {day.top_assets.length > 5 && ` +${day.top_assets.length - 5}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "text-sm font-medium w-16 text-right flex items-center justify-end gap-1",
                          day.daily_return_pct >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {day.daily_return_pct >= 0 ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                          {day.daily_return_pct >= 0 ? '+' : ''}{day.daily_return_pct.toFixed(2)}%
                        </div>
                        <div className="font-medium w-20 text-right">
                          ${day.cumulative_value.toFixed(2)}
                        </div>
                        {expandedDays.has(day.date) ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 ml-4 border-l-2 border-muted space-y-2">
                      <div className="flex justify-between text-sm text-muted-foreground mb-2">
                        <span>SPY Return: {day.spy_daily_return_pct >= 0 ? '+' : ''}{day.spy_daily_return_pct.toFixed(2)}%</span>
                        <span>SPY Value: ${day.spy_cumulative_value.toFixed(2)}</span>
                      </div>
                      <p className="text-sm font-medium mb-2">Top 10 Rated Assets:</p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {day.top_assets.map((asset) => {
                          const returnPct = asset.daily_return_pct ?? asset.score;
                          const isPositive = returnPct >= 0;
                          return (
                            <div
                              key={asset.ticker}
                              className={cn(
                                "p-2 rounded text-center",
                                isPositive ? "bg-green-500/10" : "bg-red-500/10"
                              )}
                            >
                              <div className="flex items-center justify-center gap-1">
                                {isPositive ? (
                                  <ArrowUp className="h-3 w-3 text-green-500" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-red-500" />
                                )}
                                <p className="font-medium text-sm">{asset.ticker}</p>
                              </div>
                              <p className={cn(
                                "text-xs",
                                isPositive ? "text-green-500" : "text-red-500"
                              )}>
                                {isPositive ? '+' : ''}{returnPct.toFixed(1)}%
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
              {dailyHistory.daily_history.length > 30 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Showing last 30 days of {dailyHistory.total_days} total days
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No daily history available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <div className="text-center text-xs text-muted-foreground px-4">
        <AlertCircle className="h-4 w-4 inline mr-1" />
        Historical performance based on equal-weighted investment in top 10 rated assets using real market data from TwelveData.
        Past performance does not guarantee future results.
      </div>
    </div>
  );
};

export default Performance;
