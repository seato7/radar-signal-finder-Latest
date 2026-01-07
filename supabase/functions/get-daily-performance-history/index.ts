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
    
    // Get all snapshots ordered by date
    const { data: snapshots, error: snapError } = await supabase
      .from('asset_score_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true })
      .order('rank', { ascending: true });

    if (snapError) throw snapError;

    if (!snapshots || snapshots.length === 0) {
      return new Response(JSON.stringify({
        daily_history: [],
        start_date: null,
        starting_investment: 10000,
        total_days: 0,
        last_updated_at: new Date().toISOString()
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get unique dates and tickers
    const dates = [...new Set(snapshots.map(s => s.snapshot_date))].sort();
    const tickers = [...new Set(snapshots.map(s => s.ticker))];
    
    // Get prices for all tickers
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
      if (!snapshotsByDate[s.snapshot_date]) snapshotsByDate[s.snapshot_date] = [];
      snapshotsByDate[s.snapshot_date].push(s);
    }

    // Calculate daily returns
    const dailyHistory: any[] = [];
    let cumulativeValue = 1000; // Starting with $1,000 for daily history
    let spyCumulativeValue = 1000;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const daySnapshots = snapshotsByDate[date] || [];
      const prevDate = i > 0 ? dates[i - 1] : null;

      // Calculate portfolio daily return
      let portfolioReturns: number[] = [];
      const topAssets: any[] = [];

      for (const snapshot of daySnapshots.slice(0, 10)) {
        const currentPrice = priceLookup[snapshot.ticker]?.[date];
        const prevPrice = prevDate ? priceLookup[snapshot.ticker]?.[prevDate] : currentPrice;
        
        let dailyReturn = 0;
        if (prevPrice && currentPrice && prevPrice > 0) {
          dailyReturn = ((currentPrice - prevPrice) / prevPrice) * 100;
        }
        
        portfolioReturns.push(dailyReturn);
        topAssets.push({
          ticker: snapshot.ticker,
          name: snapshot.asset_name,
          score: snapshot.computed_score, // Real score from assets table (70+)
          daily_return_pct: Math.round(dailyReturn * 100) / 100,
          rank: snapshot.rank
        });
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

      dailyHistory.push({
        date,
        top_assets: topAssets,
        daily_return_pct: Math.round(avgDailyReturn * 100) / 100,
        spy_daily_return_pct: Math.round(spyDailyReturn * 100) / 100,
        cumulative_value: Math.round(cumulativeValue * 100) / 100,
        spy_cumulative_value: Math.round(spyCumulativeValue * 100) / 100,
        is_negative_day: avgDailyReturn < 0
      });
    }

    // Reverse to show newest first
    dailyHistory.reverse();

    return new Response(JSON.stringify({
      daily_history: dailyHistory,
      start_date: dates[0],
      end_date: dates[dates.length - 1],
      starting_investment: 1000,
      total_days: dates.length,
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
