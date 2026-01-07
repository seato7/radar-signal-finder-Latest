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
    
    // First, get SPY prices to determine our date range
    const { data: spyPrices, error: spyError } = await supabase
      .from('prices')
      .select('date, close, updated_at')
      .eq('ticker', 'SPY')
      .order('date', { ascending: true });
    
    if (spyError) throw spyError;
    
    if (!spyPrices || spyPrices.length === 0) {
      return new Response(
        JSON.stringify({ daily_history: [], start_date: null, message: 'No SPY data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const startDate = spyPrices[0].date;
    const allDates = spyPrices.map(p => p.date);
    
    // Create SPY lookup
    const spyByDate: Record<string, number> = {};
    for (const p of spyPrices) {
      spyByDate[p.date] = p.close;
    }
    
    // Get all price data from start date
    const { data: priceData, error: priceError } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .gte('date', startDate)
      .order('date', { ascending: true });
    
    if (priceError) throw priceError;
    
    // Organize prices by date and ticker
    const pricesByDate: Record<string, Record<string, number>> = {};
    for (const p of priceData || []) {
      if (!pricesByDate[p.date]) {
        pricesByDate[p.date] = {};
      }
      pricesByDate[p.date][p.ticker] = p.close;
    }
    
    // Check for snapshots
    const { data: snapshots } = await supabase
      .from('asset_score_snapshots')
      .select('snapshot_date, ticker, asset_name, computed_score, rank')
      .order('snapshot_date', { ascending: true })
      .order('rank', { ascending: true });
    
    // Create snapshots by date
    const snapshotsByDate: Record<string, Array<{ ticker: string; name: string; score: number; rank: number }>> = {};
    if (snapshots && snapshots.length > 0) {
      for (const s of snapshots) {
        if (!snapshotsByDate[s.snapshot_date]) {
          snapshotsByDate[s.snapshot_date] = [];
        }
        if (snapshotsByDate[s.snapshot_date].length < 10) {
          snapshotsByDate[s.snapshot_date].push({
            ticker: s.ticker,
            name: s.asset_name || s.ticker,
            score: s.computed_score,
            rank: s.rank,
          });
        }
      }
    }
    
    // Fallback to current top 10 if no snapshots
    let fallbackTop10: Array<{ ticker: string; name: string; score: number }> = [];
    if (Object.keys(snapshotsByDate).length === 0) {
      const { data: topAssets } = await supabase
        .from('assets')
        .select('ticker, name, computed_score')
        .not('computed_score', 'is', null)
        .order('computed_score', { ascending: false })
        .limit(10);
      
      fallbackTop10 = (topAssets || []).map(a => ({
        ticker: a.ticker,
        name: a.name || a.ticker,
        score: a.computed_score,
      }));
    }
    
    // Calculate daily performance
    const dailyHistory: Array<{
      date: string;
      top_assets: Array<{ ticker: string; name: string; score: number }>;
      daily_return_pct: number;
      cumulative_value: number;
      spy_daily_return_pct: number;
      spy_cumulative_value: number;
    }> = [];
    
    let cumulativeValue = STARTING_INVESTMENT;
    let spyCumulativeValue = STARTING_INVESTMENT;
    
    // Track last known prices for forward-fill
    const lastKnownPrices: Record<string, number> = {};
    let previousSpyPrice: number | null = null;
    
    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      const todayPrices = pricesByDate[date] || {};
      
      // Update last known prices
      for (const [ticker, price] of Object.entries(todayPrices)) {
        lastKnownPrices[ticker] = price;
      }
      
      // Get top 10 for this date
      const top10 = snapshotsByDate[date] || fallbackTop10.map((a, idx) => ({ ...a, rank: idx + 1 }));
      
      if (top10.length === 0) continue;
      
      // Calculate daily return for portfolio
      let dailyReturn = 0;
      let validAssets = 0;
      
      if (i > 0) {
        const prevDate = allDates[i - 1];
        const prevPrices = pricesByDate[prevDate] || {};
        
        for (const asset of top10) {
          const todayPrice = todayPrices[asset.ticker] || lastKnownPrices[asset.ticker];
          const yesterdayPrice = prevPrices[asset.ticker];
          
          if (todayPrice && yesterdayPrice && yesterdayPrice > 0) {
            dailyReturn += (todayPrice - yesterdayPrice) / yesterdayPrice;
            validAssets++;
          }
        }
        
        if (validAssets > 0) {
          dailyReturn = dailyReturn / validAssets;
        }
      }
      
      // Calculate SPY daily return
      let spyDailyReturn = 0;
      const todaySpyPrice = spyByDate[date];
      if (i > 0 && previousSpyPrice && todaySpyPrice && previousSpyPrice > 0) {
        spyDailyReturn = (todaySpyPrice - previousSpyPrice) / previousSpyPrice;
      }
      
      // Update cumulative values
      cumulativeValue = cumulativeValue * (1 + dailyReturn);
      spyCumulativeValue = spyCumulativeValue * (1 + spyDailyReturn);
      
      dailyHistory.push({
        date,
        top_assets: top10.slice(0, 10).map(a => ({ ticker: a.ticker, name: a.name, score: a.score })),
        daily_return_pct: Math.round(dailyReturn * 10000) / 100,
        cumulative_value: Math.round(cumulativeValue * 100) / 100,
        spy_daily_return_pct: Math.round(spyDailyReturn * 10000) / 100,
        spy_cumulative_value: Math.round(spyCumulativeValue * 100) / 100,
      });
      
      // Store for next iteration
      previousSpyPrice = todaySpyPrice || previousSpyPrice;
    }
    
    // Get last updated timestamp
    const lastUpdatedAt = spyPrices[spyPrices.length - 1]?.updated_at || null;
    
    console.log(`Daily history calculated: ${dailyHistory.length} days from ${startDate}`);
    
    return new Response(
      JSON.stringify({
        daily_history: dailyHistory.reverse(), // Most recent first
        start_date: startDate,
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
