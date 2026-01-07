import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const STARTING_INVESTMENT = 1000;
    
    // Get all snapshots grouped by date
    const { data: snapshots, error: snapshotError } = await supabase
      .from('asset_score_snapshots')
      .select('snapshot_date, ticker, asset_name, computed_score, rank')
      .order('snapshot_date', { ascending: true })
      .order('rank', { ascending: true });
    
    if (snapshotError) throw snapshotError;
    
    // Group snapshots by date
    const snapshotsByDate: Record<string, Array<{ 
      ticker: string; 
      name: string; 
      score: number; 
      rank: number;
    }>> = {};
    
    for (const s of snapshots || []) {
      if (!snapshotsByDate[s.snapshot_date]) {
        snapshotsByDate[s.snapshot_date] = [];
      }
      if (snapshotsByDate[s.snapshot_date].length < 10) {
        snapshotsByDate[s.snapshot_date].push({
          ticker: s.ticker,
          name: s.asset_name || s.ticker,
          score: s.computed_score || 0,
          rank: s.rank || snapshotsByDate[s.snapshot_date].length + 1,
        });
      }
    }
    
    const snapshotDates = Object.keys(snapshotsByDate).sort();
    
    if (snapshotDates.length === 0) {
      return new Response(
        JSON.stringify({ daily_history: [], start_date: null, message: 'No snapshot data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get all tickers from snapshots
    const allTickers = new Set<string>();
    for (const assets of Object.values(snapshotsByDate)) {
      for (const asset of assets) {
        allTickers.add(asset.ticker);
      }
    }
    allTickers.add('SPY');
    
    // Get all price data for these tickers
    const { data: priceData, error: priceError } = await supabase
      .from('prices')
      .select('ticker, date, close, updated_at')
      .in('ticker', Array.from(allTickers))
      .gte('date', snapshotDates[0])
      .order('date', { ascending: true });
    
    if (priceError) throw priceError;
    
    // Organize prices by date and ticker
    const pricesByDate: Record<string, Record<string, number>> = {};
    let lastUpdatedAt: string | null = null;
    
    for (const p of priceData || []) {
      if (!pricesByDate[p.date]) {
        pricesByDate[p.date] = {};
      }
      pricesByDate[p.date][p.ticker] = p.close;
      if (!lastUpdatedAt || p.updated_at > lastUpdatedAt) {
        lastUpdatedAt = p.updated_at;
      }
    }
    
    // Calculate daily performance for each snapshot date
    const dailyHistory: Array<{
      date: string;
      top_assets: Array<{ 
        ticker: string; 
        name: string; 
        score: number;
        daily_return_pct?: number;
      }>;
      daily_return_pct: number;
      cumulative_value: number;
      spy_daily_return_pct: number;
      spy_cumulative_value: number;
      is_negative_day: boolean;
    }> = [];
    
    let cumulativeValue = STARTING_INVESTMENT;
    let spyCumulativeValue = STARTING_INVESTMENT;
    
    for (let i = 0; i < snapshotDates.length; i++) {
      const date = snapshotDates[i];
      const assets = snapshotsByDate[date];
      const todayPrices = pricesByDate[date] || {};
      
      // Calculate daily return for portfolio using actual price changes
      let portfolioDailyReturn = 0;
      let validAssets = 0;
      
      // Get previous day's prices
      const prevDate = i > 0 ? snapshotDates[i - 1] : null;
      const prevPrices = prevDate ? (pricesByDate[prevDate] || {}) : {};
      
      // Calculate individual asset returns
      const assetsWithReturns = assets.map(asset => {
        const todayPrice = todayPrices[asset.ticker];
        const prevPrice = prevPrices[asset.ticker];
        
        let dailyReturnPct = 0;
        if (todayPrice && prevPrice && prevPrice > 0) {
          dailyReturnPct = ((todayPrice - prevPrice) / prevPrice) * 100;
          portfolioDailyReturn += dailyReturnPct;
          validAssets++;
        } else {
          // Use the stored score (which is the daily change % from backfill)
          dailyReturnPct = asset.score;
          portfolioDailyReturn += dailyReturnPct;
          validAssets++;
        }
        
        return {
          ...asset,
          daily_return_pct: Math.round(dailyReturnPct * 100) / 100,
        };
      });
      
      // Average the returns
      if (validAssets > 0) {
        portfolioDailyReturn = portfolioDailyReturn / validAssets;
      }
      
      // Calculate SPY daily return
      let spyDailyReturn = 0;
      const todaySpyPrice = todayPrices['SPY'];
      const prevSpyPrice = prevDate ? prevPrices['SPY'] : null;
      
      if (todaySpyPrice && prevSpyPrice && prevSpyPrice > 0) {
        spyDailyReturn = ((todaySpyPrice - prevSpyPrice) / prevSpyPrice) * 100;
      }
      
      // Update cumulative values
      cumulativeValue = cumulativeValue * (1 + portfolioDailyReturn / 100);
      spyCumulativeValue = spyCumulativeValue * (1 + spyDailyReturn / 100);
      
      // Determine if this is a negative day
      const isNegativeDay = portfolioDailyReturn < 0;
      
      dailyHistory.push({
        date,
        top_assets: assetsWithReturns,
        daily_return_pct: Math.round(portfolioDailyReturn * 100) / 100,
        cumulative_value: Math.round(cumulativeValue * 100) / 100,
        spy_daily_return_pct: Math.round(spyDailyReturn * 100) / 100,
        spy_cumulative_value: Math.round(spyCumulativeValue * 100) / 100,
        is_negative_day: isNegativeDay,
      });
    }
    
    console.log(`Daily history calculated: ${dailyHistory.length} days from ${snapshotDates[0]}`);
    
    return new Response(
      JSON.stringify({
        daily_history: dailyHistory.reverse(), // Most recent first
        start_date: snapshotDates[0],
        starting_investment: STARTING_INVESTMENT,
        total_days: dailyHistory.length,
        last_updated_at: lastUpdatedAt,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in get-daily-performance-history:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
