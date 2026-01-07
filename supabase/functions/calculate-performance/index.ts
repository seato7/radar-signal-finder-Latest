import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { period = 'ALL' } = await req.json().catch(() => ({}));

    // Get all snapshots
    const { data: snapshots, error: snapError } = await supabase
      .from('asset_score_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true });

    if (snapError) throw snapError;

    if (!snapshots || snapshots.length === 0) {
      return new Response(JSON.stringify({
        portfolio_value: 10000,
        portfolio_return_pct: 0,
        spy_return_pct: 0,
        outperformance: 0,
        period_days: 0,
        chart_data: [],
        asset_breakdown: []
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get unique dates and tickers
    const allDates = [...new Set(snapshots.map(s => s.snapshot_date))].sort();
    const tickers = [...new Set(snapshots.map(s => s.ticker))];

    // Filter dates by period
    let dates = allDates;
    if (period === '1W') {
      dates = allDates.slice(-7);
    } else if (period === '1M') {
      dates = allDates.slice(-30);
    }

    // Get prices
    const { data: prices, error: pricesError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', [...tickers, 'SPY'])
      .in('date', dates);

    if (pricesError) throw pricesError;

    // Build price lookup
    const priceLookup: Record<string, Record<string, number>> = {};
    for (const p of (prices || [])) {
      if (!priceLookup[p.ticker]) priceLookup[p.ticker] = {};
      priceLookup[p.ticker][p.date] = p.close;
    }

    // Group snapshots by date
    const snapshotsByDate: Record<string, typeof snapshots> = {};
    for (const s of snapshots) {
      if (dates.includes(s.snapshot_date)) {
        if (!snapshotsByDate[s.snapshot_date]) snapshotsByDate[s.snapshot_date] = [];
        snapshotsByDate[s.snapshot_date].push(s);
      }
    }

    // Calculate daily returns and cumulative values
    const chartData: any[] = [];
    let cumulativeValue = 10000;
    let spyCumulativeValue = 10000;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const daySnapshots = snapshotsByDate[date] || [];
      const prevDate = i > 0 ? dates[i - 1] : null;

      // Calculate portfolio daily return (average of top 10)
      let portfolioReturns: number[] = [];
      for (const snapshot of daySnapshots.slice(0, 10)) {
        const currentPrice = priceLookup[snapshot.ticker]?.[date];
        const prevPrice = prevDate ? priceLookup[snapshot.ticker]?.[prevDate] : currentPrice;
        
        if (prevPrice && currentPrice && prevPrice > 0) {
          const dailyReturn = ((currentPrice - prevPrice) / prevPrice) * 100;
          portfolioReturns.push(dailyReturn);
        }
      }

      const avgDailyReturn = portfolioReturns.length > 0 
        ? portfolioReturns.reduce((a, b) => a + b, 0) / portfolioReturns.length 
        : 0;

      // Calculate SPY return
      const spyCurrentPrice = priceLookup['SPY']?.[date];
      const spyPrevPrice = prevDate ? priceLookup['SPY']?.[prevDate] : spyCurrentPrice;
      let spyDailyReturn = 0;
      if (spyPrevPrice && spyCurrentPrice && spyPrevPrice > 0) {
        spyDailyReturn = ((spyCurrentPrice - spyPrevPrice) / spyPrevPrice) * 100;
      }

      // Update cumulative values
      if (i > 0) {
        cumulativeValue = cumulativeValue * (1 + avgDailyReturn / 100);
        spyCumulativeValue = spyCumulativeValue * (1 + spyDailyReturn / 100);
      }

      chartData.push({
        date,
        portfolio: Math.round(cumulativeValue),
        spy: Math.round(spyCumulativeValue)
      });
    }

    // Calculate period returns
    const startValue = 10000;
    const totalReturn = ((cumulativeValue - startValue) / startValue) * 100;
    const spyReturn = ((spyCumulativeValue - startValue) / startValue) * 100;
    const outperformance = totalReturn - spyReturn;

    // Get latest day's assets for breakdown
    const latestDate = dates[dates.length - 1];
    const firstDate = dates[0];
    const latestSnapshots = snapshotsByDate[latestDate] || [];
    
    const assetBreakdown = latestSnapshots.slice(0, 10).map(s => {
      const startPrice = priceLookup[s.ticker]?.[firstDate];
      const endPrice = priceLookup[s.ticker]?.[latestDate];
      let periodReturn = 0;
      if (startPrice && endPrice && startPrice > 0) {
        periodReturn = ((endPrice - startPrice) / startPrice) * 100;
      }
      return {
        ticker: s.ticker,
        name: s.asset_name,
        score: s.computed_score, // Real score from assets table (70+)
        return_pct: Math.round(periodReturn * 100) / 100,
        contribution: Math.round((periodReturn / 10) * 100) / 100
      };
    });

    return new Response(JSON.stringify({
      portfolio_value: Math.round(cumulativeValue),
      portfolio_return_pct: Math.round(totalReturn * 100) / 100,
      spy_return_pct: Math.round(spyReturn * 100) / 100,
      outperformance: Math.round(outperformance * 100) / 100,
      period_days: dates.length,
      start_date: firstDate,
      end_date: latestDate,
      chart_data: chartData,
      asset_breakdown: assetBreakdown,
      starting_investment: startValue,
      last_updated_at: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errMsg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
