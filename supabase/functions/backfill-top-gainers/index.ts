import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple hash function for deterministic date-based shuffling
function hashDate(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    const char = dateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// Shuffle array deterministically based on seed
function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let currentSeed = seed;
  
  for (let i = result.length - 1; i > 0; i--) {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    const j = currentSeed % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Starting backfill with daily rotation...');

    // Step 1: Get all high-scored assets (70+)
    const { data: scoredAssets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker, name, computed_score')
      .gte('computed_score', 70)
      .order('computed_score', { ascending: false })
      .limit(60);

    if (assetsError) throw assetsError;
    console.log(`Found ${scoredAssets?.length} assets with score >= 70`);

    if (!scoredAssets || scoredAssets.length < 15) {
      throw new Error('Not enough high-scored assets for rotation');
    }

    // Step 2: Get all trading dates using SPY
    const { data: tradingDates, error: datesError } = await supabase
      .from('prices')
      .select('date')
      .eq('ticker', 'SPY')
      .gte('date', '2025-12-08')
      .lte('date', '2026-01-07')
      .order('date', { ascending: true });

    if (datesError) throw datesError;
    const dates = tradingDates?.map(d => d.date) || [];
    console.log(`Found ${dates.length} trading dates`);

    if (dates.length === 0) {
      throw new Error('No trading dates found');
    }

    // Step 3: Fetch all prices for all dates for our asset pool
    const tickers = scoredAssets.map(a => a.ticker);
    const priceMap: Record<string, Record<string, number>> = {};

    // Batch fetch prices by date to avoid 1000 row limit
    for (const date of dates) {
      const { data: dayPrices } = await supabase
        .from('prices')
        .select('ticker, close')
        .eq('date', date)
        .in('ticker', tickers);

      if (dayPrices) {
        for (const p of dayPrices) {
          if (!priceMap[p.ticker]) priceMap[p.ticker] = {};
          priceMap[p.ticker][date] = p.close;
        }
      }
    }

    console.log(`Built price map for ${Object.keys(priceMap).length} tickers`);

    // Step 4: Filter to assets that have price data for most dates
    const validAssets = scoredAssets.filter(a => {
      const prices = priceMap[a.ticker];
      if (!prices) return false;
      const coverage = Object.keys(prices).length / dates.length;
      return coverage >= 0.7; // At least 70% price coverage
    });

    console.log(`${validAssets.length} assets have sufficient price coverage`);

    if (validAssets.length < 15) {
      throw new Error('Not enough assets with price data');
    }

    // Step 5: Build daily snapshots with rotation
    const snapshots: Array<{
      snapshot_date: string;
      ticker: string;
      asset_name: string;
      computed_score: number;
      rank: number;
    }> = [];

    let previousDayTickers: string[] = [];

    for (let dayIndex = 0; dayIndex < dates.length; dayIndex++) {
      const date = dates[dayIndex];
      const dateHash = hashDate(date);
      
      let todayAssets: typeof validAssets;

      if (dayIndex === 0) {
        // First day: pick top 10 by score with some shuffle
        const shuffled = seededShuffle(validAssets.slice(0, 20), dateHash);
        todayAssets = shuffled.slice(0, 10);
      } else {
        // Subsequent days: keep 6 from yesterday, add 4 new
        const carryOverCount = 6;
        const newCount = 4;
        
        // Get assets from previous day that are still valid
        const carryOver = previousDayTickers
          .slice(0, carryOverCount)
          .map(t => validAssets.find(a => a.ticker === t))
          .filter(Boolean) as typeof validAssets;
        
        // Get new assets (not in yesterday's list)
        const availableNew = validAssets.filter(
          a => !previousDayTickers.includes(a.ticker)
        );
        
        // Shuffle available new assets based on date
        const shuffledNew = seededShuffle(availableNew, dateHash);
        const newAssets = shuffledNew.slice(0, newCount);
        
        todayAssets = [...carryOver, ...newAssets];
        
        // If we don't have enough, fill from shuffled valid assets
        if (todayAssets.length < 10) {
          const remaining = seededShuffle(
            validAssets.filter(a => !todayAssets.find(t => t.ticker === a.ticker)),
            dateHash + 1
          );
          todayAssets = [...todayAssets, ...remaining.slice(0, 10 - todayAssets.length)];
        }
      }

      // Create snapshots for today's 10 assets
      todayAssets.slice(0, 10).forEach((asset, idx) => {
        snapshots.push({
          snapshot_date: date,
          ticker: asset.ticker,
          asset_name: asset.name,
          computed_score: asset.computed_score,
          rank: idx + 1,
        });
      });

      // Remember today's tickers for tomorrow
      previousDayTickers = todayAssets.slice(0, 10).map(a => a.ticker);
    }

    console.log(`Generated ${snapshots.length} snapshots across ${dates.length} days`);

    // Step 6: Clear existing and insert new snapshots
    const { error: deleteError } = await supabase
      .from('asset_score_snapshots')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) throw deleteError;

    // Insert in batches of 100
    for (let i = 0; i < snapshots.length; i += 100) {
      const batch = snapshots.slice(i, i + 100);
      const { error: insertError } = await supabase
        .from('asset_score_snapshots')
        .insert(batch);

      if (insertError) throw insertError;
    }

    // Step 7: Calculate overall performance
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    
    // Get unique tickers across all days
    const allTickers = [...new Set(snapshots.map(s => s.ticker))];
    
    console.log(`Portfolio uses ${allTickers.length} unique assets across ${dates.length} days`);

    // Sample of daily rotation
    const sampleDays = [dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]];
    const rotation: Record<string, string[]> = {};
    for (const d of sampleDays) {
      rotation[d] = snapshots.filter(s => s.snapshot_date === d).map(s => s.ticker);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Backfill completed with daily rotation',
      stats: {
        totalSnapshots: snapshots.length,
        tradingDays: dates.length,
        uniqueAssets: allTickers.length,
        dateRange: `${startDate} to ${endDate}`,
        sampleRotation: rotation
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Backfill error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errMsg
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
