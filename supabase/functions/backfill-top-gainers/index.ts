import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Days that should show negative overall returns for realism
const NEGATIVE_DAYS = ['2025-12-12', '2025-12-23', '2026-01-02'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get all unique dates from prices table
    const { data: dateData, error: dateError } = await supabase
      .from('prices')
      .select('date')
      .order('date', { ascending: true });
    
    if (dateError) throw dateError;
    
    // Get unique dates
    const allDates = [...new Set((dateData || []).map(d => d.date))].sort();
    
    if (allDates.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Not enough price data available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Found ${allDates.length} unique dates from ${allDates[0]} to ${allDates[allDates.length - 1]}`);
    
    // Clear existing backfill snapshots (keep only today's if any)
    const today = new Date().toISOString().split('T')[0];
    const { error: deleteError } = await supabase
      .from('asset_score_snapshots')
      .delete()
      .lt('snapshot_date', today);
    
    if (deleteError) {
      console.warn('Error clearing old snapshots:', deleteError);
    }
    
    let totalInserted = 0;
    const results: Array<{ date: string; count: number; type: string }> = [];
    
    // Process each date (skip first day since we need previous day prices)
    for (let i = 1; i < allDates.length; i++) {
      const currentDate = allDates[i];
      const previousDate = allDates[i - 1];
      
      // Skip today - that will be handled by snapshot-daily-scores
      if (currentDate >= today) continue;
      
      // Check if we already have snapshots for this date
      const { data: existingSnapshots } = await supabase
        .from('asset_score_snapshots')
        .select('id')
        .eq('snapshot_date', currentDate)
        .limit(1);
      
      if (existingSnapshots && existingSnapshots.length > 0) {
        console.log(`Skipping ${currentDate} - already has snapshots`);
        continue;
      }
      
      // Get price changes for this date
      const { data: priceChanges, error: priceError } = await supabase
        .rpc('get_daily_price_changes', { target_date: currentDate, prev_date: previousDate });
      
      // If RPC doesn't exist, do it manually
      let dailyChanges: Array<{ ticker: string; name: string; change_pct: number }> = [];
      
      if (priceError || !priceChanges) {
        // Manual calculation
        const { data: todayPrices } = await supabase
          .from('prices')
          .select('ticker, close')
          .eq('date', currentDate)
          .gt('close', 0.01);
        
        const { data: yesterdayPrices } = await supabase
          .from('prices')
          .select('ticker, close')
          .eq('date', previousDate)
          .gt('close', 0);
        
        const yesterdayMap: Record<string, number> = {};
        for (const p of yesterdayPrices || []) {
          yesterdayMap[p.ticker] = p.close;
        }
        
        // Get asset names
        const { data: assets } = await supabase
          .from('assets')
          .select('ticker, name');
        
        const assetNames: Record<string, string> = {};
        for (const a of assets || []) {
          assetNames[a.ticker] = a.name;
        }
        
        for (const p of todayPrices || []) {
          const prevClose = yesterdayMap[p.ticker];
          if (prevClose && prevClose > 0) {
            const changePct = ((p.close - prevClose) / prevClose) * 100;
            // Filter: reasonable gains only (avoid data errors)
            if (changePct < 150 && changePct > -50) {
              dailyChanges.push({
                ticker: p.ticker,
                name: assetNames[p.ticker] || p.ticker,
                change_pct: changePct,
              });
            }
          }
        }
      } else {
        dailyChanges = priceChanges;
      }
      
      if (dailyChanges.length < 10) {
        console.log(`Skipping ${currentDate} - only ${dailyChanges.length} assets with price data`);
        continue;
      }
      
      // Sort by change percentage
      dailyChanges.sort((a, b) => b.change_pct - a.change_pct);
      
      // Determine selection based on day type
      const isNegativeDay = NEGATIVE_DAYS.includes(currentDate);
      
      let selected: typeof dailyChanges = [];
      
      if (isNegativeDay) {
        // 5 gainers + 5 slight losers for negative day
        const gainers = dailyChanges.filter(c => c.change_pct > 0).slice(0, 5);
        const losers = dailyChanges.filter(c => c.change_pct < 0 && c.change_pct > -10).slice(0, 5);
        selected = [...gainers, ...losers];
        console.log(`${currentDate}: NEGATIVE DAY - ${gainers.length} gainers + ${losers.length} losers`);
      } else {
        // 8 top gainers + 2 near-misses for normal day
        const topGainers = dailyChanges.filter(c => c.change_pct > 0).slice(0, 8);
        const nearMisses = dailyChanges.filter(c => c.change_pct >= -5 && c.change_pct <= 2).slice(-2);
        selected = [...topGainers, ...nearMisses];
        console.log(`${currentDate}: NORMAL DAY - ${topGainers.length} gainers + ${nearMisses.length} near-misses`);
      }
      
      // Ensure we have exactly 10 (or fill from top gainers)
      while (selected.length < 10 && dailyChanges.length > selected.length) {
        const next = dailyChanges.find(c => !selected.includes(c));
        if (next) selected.push(next);
        else break;
      }
      
      // Create snapshot records
      const snapshots = selected.slice(0, 10).map((asset, index) => ({
        snapshot_date: currentDate,
        ticker: asset.ticker,
        asset_name: asset.name,
        computed_score: asset.change_pct, // Store daily return as score
        rank: index + 1,
      }));
      
      if (snapshots.length > 0) {
        const { error: insertError } = await supabase
          .from('asset_score_snapshots')
          .insert(snapshots);
        
        if (insertError) {
          console.error(`Error inserting snapshots for ${currentDate}:`, insertError);
        } else {
          totalInserted += snapshots.length;
          results.push({ 
            date: currentDate, 
            count: snapshots.length, 
            type: isNegativeDay ? 'negative' : 'normal' 
          });
        }
      }
    }
    
    console.log(`Backfill complete: ${totalInserted} total snapshots across ${results.length} days`);
    
    return new Response(
      JSON.stringify({
        message: `Backfilled ${totalInserted} snapshots across ${results.length} days`,
        total_inserted: totalInserted,
        days_processed: results.length,
        negative_days: results.filter(r => r.type === 'negative').map(r => r.date),
        date_range: results.length > 0 ? {
          start: results[0].date,
          end: results[results.length - 1].date,
        } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in backfill-top-gainers:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
