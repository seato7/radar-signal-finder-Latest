import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to find nearest price within a window
function findNearestPrice(
  ticker: string,
  targetDate: string,
  pricesByTicker: Record<string, Array<{ date: string; close: number }>>,
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
    
    // Calculate date range with buffer for nearest-price lookup
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const startDateWithBuffer = new Date(new Date(firstDate).getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);
    const endDateWithBuffer = new Date(new Date(lastDate).getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    // Query ALL prices for portfolio tickers in date range (with buffer)
    // Fetch in batches to avoid the 1000 row limit
    let portfolioPrices: { ticker: string; date: string; close: number }[] = [];
    const tickerBatches = [];
    const BATCH_SIZE = 20;
    
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      tickerBatches.push(tickers.slice(i, i + BATCH_SIZE));
    }
    
    for (const batch of tickerBatches) {
      const { data: batchPrices, error: batchError } = await supabase
        .from('prices')
        .select('ticker, date, close')
        .in('ticker', batch)
        .gte('date', startDateWithBuffer)
        .lte('date', endDateWithBuffer)
        .order('date', { ascending: true })
        .limit(5000);

      if (batchError) throw batchError;
      if (batchPrices) {
        portfolioPrices = portfolioPrices.concat(batchPrices);
      }
    }

    // Fetch SPY prices separately - guaranteed to get them
    const { data: spyPrices, error: spyError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .eq('ticker', 'SPY')
      .gte('date', startDateWithBuffer)
      .lte('date', endDateWithBuffer)
      .order('date', { ascending: true });

    if (spyError) throw spyError;

    // Merge both price sets
    const allPrices = [...(portfolioPrices || []), ...(spyPrices || [])];
    console.log(`Fetched ${portfolioPrices?.length || 0} portfolio prices, ${spyPrices?.length || 0} SPY prices`);

    // Build price lookup by ticker -> array of {date, close}
    const pricesByTicker: Record<string, Array<{ date: string; close: number }>> = {};
    for (const p of allPrices) {
      if (!pricesByTicker[p.ticker]) pricesByTicker[p.ticker] = [];
      pricesByTicker[p.ticker].push({ date: p.date, close: Number(p.close) });
    }

    // Sort prices by date for each ticker
    for (const ticker of Object.keys(pricesByTicker)) {
      pricesByTicker[ticker].sort((a, b) => a.date.localeCompare(b.date));
    }

    // Group snapshots by date
    const snapshotsByDate: Record<string, typeof snapshots> = {};
    for (const s of snapshots) {
      if (!snapshotsByDate[s.snapshot_date]) snapshotsByDate[s.snapshot_date] = [];
      snapshotsByDate[s.snapshot_date].push(s);
    }

    // Track running prices for carry-forward logic
    const lastKnownPrice: Record<string, number> = {};
    let lastKnownSpyPrice = 0;

    // Calculate daily returns
    const dailyHistory: {
      date: string;
      top_assets: { ticker: string; name: string; score: number; daily_return_pct: number; rank: number }[];
      daily_return_pct: number;
      spy_daily_return_pct: number;
      cumulative_value: number;
      spy_cumulative_value: number;
      is_negative_day: boolean;
      assets_with_data: number;
    }[] = [];
    
    let cumulativeValue = 1000; // Starting with $1,000 for daily history
    let spyCumulativeValue = 1000;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const daySnapshots = snapshotsByDate[date] || [];
      const prevDate = i > 0 ? dates[i - 1] : null;

      // Update last known prices from today's data
      for (const ticker of tickers) {
        const todayPrice = pricesByTicker[ticker]?.find(p => p.date === date);
        if (todayPrice) {
          lastKnownPrice[ticker] = todayPrice.close;
        }
      }
      const todaySpyPrice = pricesByTicker['SPY']?.find(p => p.date === date);
      if (todaySpyPrice) {
        lastKnownSpyPrice = todaySpyPrice.close;
      }

      // Calculate portfolio daily return
      const portfolioReturns: number[] = [];
      const topAssets: { ticker: string; name: string; score: number; daily_return_pct: number; rank: number }[] = [];
      let assetsWithData = 0;

      for (const snapshot of daySnapshots.slice(0, 10)) {
        // Get current and previous prices using nearest-price logic
        const currentPriceData = findNearestPrice(snapshot.ticker, date, pricesByTicker, 'before');
        const prevPriceData = prevDate 
          ? findNearestPrice(snapshot.ticker, prevDate, pricesByTicker, 'before')
          : currentPriceData;
        
        let dailyReturn = 0;
        let hasData = false;
        
        if (prevPriceData && currentPriceData && prevPriceData.price > 0) {
          dailyReturn = ((currentPriceData.price - prevPriceData.price) / prevPriceData.price) * 100;
          hasData = true;
          assetsWithData++;
        }
        
        portfolioReturns.push(dailyReturn);
        topAssets.push({
          ticker: snapshot.ticker,
          name: snapshot.asset_name || snapshot.ticker,
          score: snapshot.computed_score || 0,
          daily_return_pct: Math.round(dailyReturn * 100) / 100,
          rank: snapshot.rank || 0
        });
      }

      // Only include day if we have at least 50% asset coverage
      const coverageRatio = topAssets.length > 0 ? assetsWithData / topAssets.length : 0;
      
      const avgDailyReturn = portfolioReturns.length > 0 && assetsWithData > 0
        ? portfolioReturns.reduce((a, b) => a + b, 0) / assetsWithData
        : 0;

      // Calculate SPY return using nearest-price logic
      const spyCurrentData = findNearestPrice('SPY', date, pricesByTicker, 'before');
      const spyPrevData = prevDate 
        ? findNearestPrice('SPY', prevDate, pricesByTicker, 'before')
        : spyCurrentData;
      
      let spyDailyReturn = 0;
      if (spyPrevData && spyCurrentData && spyPrevData.price > 0) {
        spyDailyReturn = ((spyCurrentData.price - spyPrevData.price) / spyPrevData.price) * 100;
      }

      // Update cumulative values
      if (i > 0) {
        cumulativeValue = cumulativeValue * (1 + avgDailyReturn / 100);
        spyCumulativeValue = spyCumulativeValue * (1 + spyDailyReturn / 100);
      }

      // Only add to history if coverage is adequate (>=50%)
      if (coverageRatio >= 0.5 || i === 0) {
        dailyHistory.push({
          date,
          top_assets: topAssets,
          daily_return_pct: Math.round(avgDailyReturn * 100) / 100,
          spy_daily_return_pct: Math.round(spyDailyReturn * 100) / 100,
          cumulative_value: Math.round(cumulativeValue * 100) / 100,
          spy_cumulative_value: Math.round(spyCumulativeValue * 100) / 100,
          is_negative_day: avgDailyReturn < 0,
          assets_with_data: assetsWithData
        });
      }
    }

    // Reverse to show newest first
    dailyHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // safe sort instead of mutating reverse()

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
