import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, AlertCircle, BarChart3, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Period = '1W' | '30D' | 'ALL';

interface DataQuality {
  assets_with_prices: number;
  total_assets: number;
  coverage_pct: number;
}

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
  data_quality?: DataQuality;
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
    assets_with_data?: number;
  }>;
  start_date: string;
  starting_investment: number;
  total_days: number;
  last_updated_at?: string | null;
}

type PriceRow = { ticker: string; date: string; close: number };

// Find nearest price within a window (ported from edge function)
function findNearestPrice(
  ticker: string,
  targetDate: string,
  pricesByTicker: Record<string, PriceRow[]>,
  direction: 'before' | 'after' | 'any' = 'any',
  maxDays = 7
): { date: string; price: number } | null {
  const prices = pricesByTicker[ticker];
  if (!prices || prices.length === 0) return null;

  const target = new Date(targetDate).getTime();
  let best: { date: string; price: number; diff: number } | null = null;

  for (const p of prices) {
    const pDate = new Date(p.date).getTime();
    const diff = pDate - target;
    const absDiff = Math.abs(diff);
    const daysDiff = absDiff / (1000 * 60 * 60 * 24);

    if (daysDiff > maxDays) continue;
    if (direction === 'before' && diff > 0) continue;
    if (direction === 'after' && diff < 0) continue;

    if (!best || absDiff < best.diff) {
      best = { date: p.date, price: p.close, diff: absDiff };
    }
  }

  return best ? { date: best.date, price: best.price } : null;
}

const Performance = () => {
  const [period, setPeriod] = useState<Period>('ALL');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // ── Query 1: fetch all asset_predictions (top 10 per day) ──
  const {
    data: rawPredictions,
    isLoading: isLoadingPredictions,
    error: predictionsError,
  } = useQuery({
    queryKey: ['asset-predictions-performance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset_predictions')
        .select('snapshot_date, ticker, rank, confidence_score, expected_return')
        .lte('rank', 10)
        .order('snapshot_date', { ascending: true })
        .order('rank', { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{
        snapshot_date: string;
        ticker: string;
        rank: number;
        confidence_score: number;
        expected_return: number | null;
      }>;
    },
  });

  // ── Derive date range + unique tickers from predictions ──
  const predictionsMeta = useMemo(() => {
    if (!rawPredictions || rawPredictions.length === 0) return null;
    const dates = [...new Set(rawPredictions.map(p => p.snapshot_date))].sort();
    const tickers = [...new Set(rawPredictions.map(p => p.ticker))];
    const MS_PER_DAY = 86400000;
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const startWithBuffer = new Date(new Date(firstDate).getTime() - 7 * MS_PER_DAY)
      .toISOString().slice(0, 10);
    const endWithBuffer = new Date(new Date(lastDate).getTime() + 7 * MS_PER_DAY)
      .toISOString().slice(0, 10);
    return { dates, tickers, firstDate, lastDate, startWithBuffer, endWithBuffer };
  }, [rawPredictions]);

  // ── Query 2: fetch prices for all tickers + SPY (batched) ──
  const { data: rawPrices, isLoading: isLoadingPrices } = useQuery({
    queryKey: [
      'performance-prices',
      predictionsMeta?.firstDate,
      predictionsMeta?.lastDate,
    ],
    enabled: !!predictionsMeta,
    queryFn: async () => {
      if (!predictionsMeta) return [] as PriceRow[];
      const { tickers, startWithBuffer, endWithBuffer } = predictionsMeta;

      // Batch 20 tickers at a time to stay well under row limits
      const BATCH_SIZE = 20;
      const batches: string[][] = [];
      for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        batches.push(tickers.slice(i, i + BATCH_SIZE));
      }

      const batchResults = await Promise.all(
        batches.map(batch =>
          supabase
            .from('prices')
            .select('ticker, date, close')
            .in('ticker', batch)
            .gte('date', startWithBuffer)
            .lte('date', endWithBuffer)
            .order('date', { ascending: true })
            .limit(5000)
        )
      );

      const { data: spyPrices } = await supabase
        .from('prices')
        .select('ticker, date, close')
        .eq('ticker', 'SPY')
        .gte('date', startWithBuffer)
        .lte('date', endWithBuffer)
        .order('date', { ascending: true });

      return [
        ...batchResults.flatMap(r => (r.data || []) as PriceRow[]),
        ...((spyPrices || []) as PriceRow[]),
      ];
    },
  });

  // ── Build pricesByTicker lookup (shared by both computations) ──
  const pricesByTicker = useMemo((): Record<string, PriceRow[]> => {
    const map: Record<string, PriceRow[]> = {};
    for (const p of rawPrices || []) {
      if (!map[p.ticker]) map[p.ticker] = [];
      map[p.ticker].push({ ticker: p.ticker, date: p.date, close: Number(p.close) });
    }
    for (const ticker of Object.keys(map)) {
      map[ticker].sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [rawPrices]);

  // ── Compute PerformanceData (replaces calculate-performance edge function) ──
  const performanceData = useMemo((): PerformanceData | null => {
    if (!rawPredictions || !predictionsMeta || Object.keys(pricesByTicker).length === 0) return null;

    const { dates: allDates } = predictionsMeta;
    if (allDates.length === 0) return null;

    // Filter dates by selected period
    let dates = allDates;
    if (period === '1W') dates = allDates.slice(-7);
    else if (period === '30D') dates = allDates.slice(-30);

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    // Group predictions by date
    const snapshotsByDate: Record<string, typeof rawPredictions> = {};
    for (const p of rawPredictions) {
      if (!snapshotsByDate[p.snapshot_date]) snapshotsByDate[p.snapshot_date] = [];
      snapshotsByDate[p.snapshot_date].push(p);
    }

    // First day's top 10 (already sorted by rank, re-sort by confidence_score desc to be safe)
    const firstDaySnapshots = (snapshotsByDate[firstDate] || [])
      .sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0))
      .slice(0, 10);

    const portfolioTickers = firstDaySnapshots.map(s => s.ticker);

    // Buy-and-hold returns for first day's top 10
    const assetReturns: Record<string, {
      startPrice: number; endPrice: number; returnPct: number;
      startDate: string; endDate: string; hasData: boolean;
    }> = {};
    let validAssets = 0;
    let totalReturn = 0;

    for (const ticker of portfolioTickers) {
      const startPriceData = findNearestPrice(ticker, firstDate, pricesByTicker, 'before');
      const endPriceData = findNearestPrice(ticker, lastDate, pricesByTicker, 'after');
      if (startPriceData && endPriceData && startPriceData.price > 0) {
        const returnPct = ((endPriceData.price - startPriceData.price) / startPriceData.price) * 100;
        assetReturns[ticker] = {
          startPrice: startPriceData.price, endPrice: endPriceData.price,
          returnPct, startDate: startPriceData.date, endDate: endPriceData.date, hasData: true,
        };
        totalReturn += returnPct;
        validAssets++;
      } else {
        assetReturns[ticker] = {
          startPrice: 0, endPrice: 0, returnPct: 0,
          startDate: '', endDate: '', hasData: false,
        };
      }
    }

    const portfolioReturnPct = validAssets > 0 ? totalReturn / validAssets : 0;

    // SPY return
    const spyStartData = findNearestPrice('SPY', firstDate, pricesByTicker, 'before');
    const spyEndData = findNearestPrice('SPY', lastDate, pricesByTicker, 'after');
    const spyReturn = spyStartData && spyEndData && spyStartData.price > 0
      ? ((spyEndData.price - spyStartData.price) / spyStartData.price) * 100
      : 0;

    // Chart data — track daily buy-and-hold value
    const startingValue = 10000;
    const perAssetAllocation = validAssets > 0 ? startingValue / validAssets : 0;
    const shares: Record<string, number> = {};
    for (const ticker of portfolioTickers) {
      const ar = assetReturns[ticker];
      if (ar.hasData && ar.startPrice > 0) {
        shares[ticker] = perAssetAllocation / ar.startPrice;
      }
    }
    const spyShares = spyStartData && spyStartData.price > 0 ? startingValue / spyStartData.price : 0;

    const lastKnownPrice: Record<string, number> = {};
    for (const ticker of portfolioTickers) {
      if (assetReturns[ticker].hasData) lastKnownPrice[ticker] = assetReturns[ticker].startPrice;
    }
    let lastKnownSpyPrice = spyStartData?.price || 0;

    const chartData: { date: string; portfolio: number; spy: number }[] = [];
    for (const date of dates) {
      for (const ticker of portfolioTickers) {
        const p = pricesByTicker[ticker]?.find(px => px.date === date);
        if (p) lastKnownPrice[ticker] = p.close;
      }
      const spyP = pricesByTicker['SPY']?.find(px => px.date === date);
      if (spyP) lastKnownSpyPrice = spyP.close;

      let portfolioValue = 0;
      for (const ticker of portfolioTickers) {
        if (shares[ticker] && lastKnownPrice[ticker]) {
          portfolioValue += shares[ticker] * lastKnownPrice[ticker];
        }
      }
      chartData.push({
        date,
        portfolio: Math.round(portfolioValue),
        spy: Math.round(spyShares * lastKnownSpyPrice),
      });
    }

    const finalPortfolioValue = chartData.length > 0 ? chartData[chartData.length - 1].portfolio : startingValue;

    const assetBreakdown = firstDaySnapshots.map(s => {
      const ar = assetReturns[s.ticker] || { returnPct: 0, startPrice: null, endPrice: null, hasData: false };
      return {
        ticker: s.ticker,
        name: s.ticker,
        score: Math.round((s.confidence_score || 0) * 100),
        return_pct: Math.round(ar.returnPct * 100) / 100,
        contribution: Math.round((ar.returnPct / 10) * 100) / 100,
        first_price: ar.startPrice || null,
        last_price: ar.endPrice || null,
        has_data: ar.hasData,
      };
    });

    return {
      portfolio_value: finalPortfolioValue,
      portfolio_return_pct: Math.round(portfolioReturnPct * 100) / 100,
      spy_return_pct: Math.round(spyReturn * 100) / 100,
      outperformance: Math.round((portfolioReturnPct - spyReturn) * 100) / 100,
      period_days: dates.length,
      start_date: firstDate,
      end_date: lastDate,
      chart_data: chartData,
      asset_breakdown: assetBreakdown,
      starting_investment: startingValue,
      data_quality: {
        assets_with_prices: validAssets,
        total_assets: portfolioTickers.length,
        coverage_pct: portfolioTickers.length > 0
          ? Math.round((validAssets / portfolioTickers.length) * 100)
          : 0,
      },
      last_updated_at: new Date().toISOString(),
    };
  }, [rawPredictions, pricesByTicker, predictionsMeta, period]);

  // ── Compute DailyHistoryData (replaces get-daily-performance-history edge function) ──
  const dailyHistory = useMemo((): DailyHistoryData | null => {
    if (!rawPredictions || !predictionsMeta || Object.keys(pricesByTicker).length === 0) return null;

    const { dates } = predictionsMeta;
    if (dates.length === 0) return null;

    // Group predictions by date
    const snapshotsByDate: Record<string, typeof rawPredictions> = {};
    for (const p of rawPredictions) {
      if (!snapshotsByDate[p.snapshot_date]) snapshotsByDate[p.snapshot_date] = [];
      snapshotsByDate[p.snapshot_date].push(p);
    }

    let cumulativeValue = 1000;
    let spyCumulativeValue = 1000;
    const history: DailyHistoryData['daily_history'] = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const daySnapshots = (snapshotsByDate[date] || []).slice(0, 10);
      const prevDate = i > 0 ? dates[i - 1] : null;

      const portfolioReturns: number[] = [];
      const topAssets: Array<{ ticker: string; name: string; score: number; daily_return_pct: number; rank: number }> = [];
      let assetsWithData = 0;

      for (const snapshot of daySnapshots) {
        const currentPriceData = findNearestPrice(snapshot.ticker, date, pricesByTicker, 'before');
        const prevPriceData = prevDate
          ? findNearestPrice(snapshot.ticker, prevDate, pricesByTicker, 'before')
          : currentPriceData;

        let dailyReturn = 0;
        if (prevPriceData && currentPriceData && prevPriceData.price > 0) {
          dailyReturn = ((currentPriceData.price - prevPriceData.price) / prevPriceData.price) * 100;
          assetsWithData++;
        }
        portfolioReturns.push(dailyReturn);
        topAssets.push({
          ticker: snapshot.ticker,
          name: snapshot.ticker,
          score: Math.round((snapshot.confidence_score || 0) * 100),
          daily_return_pct: Math.round(dailyReturn * 100) / 100,
          rank: snapshot.rank || 0,
        });
      }

      const coverageRatio = topAssets.length > 0 ? assetsWithData / topAssets.length : 0;
      const avgDailyReturn = portfolioReturns.length > 0 && assetsWithData > 0
        ? portfolioReturns.reduce((a, b) => a + b, 0) / assetsWithData
        : 0;

      const spyCurrentData = findNearestPrice('SPY', date, pricesByTicker, 'before');
      const spyPrevData = prevDate
        ? findNearestPrice('SPY', prevDate, pricesByTicker, 'before')
        : spyCurrentData;
      const spyDailyReturn = spyPrevData && spyCurrentData && spyPrevData.price > 0
        ? ((spyCurrentData.price - spyPrevData.price) / spyPrevData.price) * 100
        : 0;

      if (i > 0) {
        cumulativeValue = cumulativeValue * (1 + avgDailyReturn / 100);
        spyCumulativeValue = spyCumulativeValue * (1 + spyDailyReturn / 100);
      }

      if (coverageRatio >= 0.5 || i === 0) {
        history.push({
          date,
          top_assets: topAssets,
          daily_return_pct: Math.round(avgDailyReturn * 100) / 100,
          spy_daily_return_pct: Math.round(spyDailyReturn * 100) / 100,
          cumulative_value: Math.round(cumulativeValue * 100) / 100,
          spy_cumulative_value: Math.round(spyCumulativeValue * 100) / 100,
          is_negative_day: avgDailyReturn < 0,
          assets_with_data: assetsWithData,
        });
      }
    }

    history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      daily_history: history,
      start_date: dates[0],
      starting_investment: 1000,
      total_days: dates.length,
      last_updated_at: new Date().toISOString(),
    };
  }, [rawPredictions, pricesByTicker, predictionsMeta]);

  // ── Loading / error aliases to keep UI unchanged ──
  const isLoadingPerformance = isLoadingPredictions || isLoadingPrices;
  const isLoadingHistory = isLoadingPredictions || isLoadingPrices;
  const performanceError = predictionsError as Error | null;

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

  const getPeriodLabel = (p: Period) => {
    switch (p) {
      case '1W': return 'Last 7 Days';
      case '30D': return 'Last 30 Days';
      case 'ALL': return 'All Time';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Tracker"
        description="Track historical returns from our top-rated assets based on real market data"
      />

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['1W', '30D', 'ALL'] as Period[]).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {getPeriodLabel(p)}
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

              {/* Data Quality Indicator */}
              {performanceData.data_quality && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  {performanceData.data_quality.coverage_pct < 80 ? (
                    <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {performanceData.data_quality.assets_with_prices} of {performanceData.data_quality.total_assets} assets have price data
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                      {performanceData.data_quality.assets_with_prices} of {performanceData.data_quality.total_assets} assets tracked
                    </Badge>
                  )}
                </div>
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
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-colors",
                    asset.has_data === false
                      ? "bg-muted/30 opacity-60"
                      : "bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-6">#{index + 1}</span>
                    <div className="flex items-center gap-2">
                      {asset.has_data === false ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      ) : asset.return_pct >= 0 ? (
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
                    {asset.has_data === false ? (
                      <div className="text-right text-muted-foreground text-sm min-w-[80px]">
                        No data
                      </div>
                    ) : (
                      <div className={cn(
                        "text-right font-medium min-w-[80px]",
                        asset.return_pct >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {asset.return_pct >= 0 ? '+' : ''}{asset.return_pct.toFixed(2)}%
                      </div>
                    )}
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
      <Card className="bg-muted/30 border-muted">
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground text-center">
            <strong>Disclaimer:</strong> Past performance does not guarantee future results.
            This tracker shows hypothetical returns based on our rating system and real historical price data.
            No actual trades are executed. Returns shown are before any fees, taxes, or slippage.
            This is for informational purposes only and not investment advice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Performance;
