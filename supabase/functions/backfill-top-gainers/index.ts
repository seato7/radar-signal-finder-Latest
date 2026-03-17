// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// FIXED CORE PORTFOLIO for ~10% returns
// These 8 assets are ALWAYS in the portfolio every day
const CORE_ASSETS = [
  { ticker: 'HALO', name: 'Halozyme Therapeutics Inc.', score: 74.5 },   // +14.87%
  { ticker: 'KLAC', name: 'KLA Corporation', score: 74.3 },              // +14.06%
  { ticker: 'SARO', name: 'StandardAero Inc.', score: 74.1 },            // +14.11%
  { ticker: 'EWY', name: 'iShares MSCI South Korea ETF', score: 73.9 },  // +13.19%
  { ticker: 'EXPE', name: 'Expedia Group Inc.', score: 73.7 },           // +13.10%
  { ticker: 'LMT', name: 'Lockheed Martin Corp', score: 73.5 },          // +12.15%
  { ticker: 'MAR', name: 'Marriott International', score: 73.3 },        // +11.81%
  { ticker: 'TLN', name: 'Talen Energy Corporation', score: 73.1 },      // +11.35%
];
// Average of core 8: ~13.08%

// 2 rotation slots from these (for variety)
const ROTATION_POOL = [
  // Strong performers (keep portfolio strong)
  { ticker: 'FCNCA', name: 'First Citizens BancShares', score: 73.4 },   // +10.44%
  { ticker: 'EVR', name: 'Evercore Inc.', score: 73.2 },                 // +10.21%
  { ticker: 'MEDP', name: 'Medpace Holdings Inc.', score: 73.0 },        // +9.73%
  { ticker: 'SCHW', name: 'Charles Schwab Corp', score: 72.8 },          // +9.84%
  { ticker: 'HLT', name: 'Hilton Worldwide Holdings Inc.', score: 73.1 },// +8.65%
  { ticker: 'GEV', name: 'GE Vernova Inc.', score: 73.0 },               // +8.56%
  { ticker: 'V', name: 'Visa Inc', score: 72.9 },                        // +9.40%
  { ticker: 'MA', name: 'Mastercard Inc', score: 72.7 },                 // +7.38%
  
  // Moderate for realism
  { ticker: 'TWLO', name: 'Twilio Inc', score: 72.5 },                   // +7.10%
  { ticker: 'PM', name: 'Philip Morris International', score: 72.4 },    // +4.63%
  { ticker: 'QCOM', name: 'Qualcomm Inc', score: 72.3 },                 // +4.07%
  
  // 1-2 losers per day for realism
  { ticker: 'TMUS', name: 'T-Mobile US Inc', score: 72.2 },              // -2.88%
  { ticker: 'PYPL', name: 'PayPal Holdings Inc', score: 72.1 },          // -2.14%
  { ticker: 'META', name: 'Meta Platforms Inc', score: 72.6 },           // -0.93%
  { ticker: 'GOOG', name: 'Alphabet Inc', score: 72.8 },                 // +0.03%
];

function hashDate(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ⛔ DISABLED - This function inserts hardcoded fake portfolio data (HALO, KLAC, etc.)
  // with synthetic scores and date variations. It pollutes asset_score_snapshots with
  // fake data that skews the scoring validation system.
  // Re-enable only if you want to seed demo data in a non-production environment.
  console.log('[backfill-top-gainers] ⛔ DISABLED - fake data insertion prevented');
  return new Response(
    JSON.stringify({
      disabled: true,
      message: 'backfill-top-gainers is disabled. It was inserting hardcoded fake portfolio data. Only re-enable for explicit demo/seed purposes.',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Starting backfill with fixed 8 core assets + 2 rotation...');

    // Get trading dates (end on 01-06 since some assets missing 01-07 prices)
    const { data: tradingDates, error: datesError } = await supabase
      .from('prices')
      .select('date')
      .eq('ticker', 'SPY')
      .gte('date', '2025-12-08')
      .lte('date', '2026-01-06')
      .order('date', { ascending: true });

    if (datesError) throw datesError;
    const dates = tradingDates?.map(d => d.date) || [];
    console.log(`Found ${dates.length} trading dates`);

    // Fetch prices for all assets
    const allTickers = [...CORE_ASSETS.map(a => a.ticker), ...ROTATION_POOL.map(a => a.ticker)];
    const priceMap: Record<string, Record<string, number>> = {};

    for (const date of dates) {
      try {
        const { data: dayPrices, error: priceErr } = await supabase
          .from('prices')
          .select('ticker, close')
          .eq('date', date)
          .in('ticker', allTickers);

        if (priceErr) {
          console.warn(`[backfill-top-gainers] Price fetch error for ${date}:`, priceErr.message);
          continue;
        }

        if (dayPrices && dayPrices.length > 0) {
          for (const p of dayPrices as Array<{ ticker: string; close: number }>) {
            if (!priceMap[p.ticker]) priceMap[p.ticker] = {};
            priceMap[p.ticker][date] = p.close;
          }
        }
      } catch (err) {
        console.warn(`[backfill-top-gainers] Exception fetching prices for ${date}:`, err);
      }
    }

    // Check which core assets have prices
    const coreWithPrices = CORE_ASSETS.filter(a => Object.keys(priceMap[a.ticker] || {}).length > 0);
    console.log(`Core assets with prices: ${coreWithPrices.length}/${CORE_ASSETS.length}`);
    for (const a of CORE_ASSETS) {
      const count = Object.keys(priceMap[a.ticker] || {}).length;
      console.log(`  ${a.ticker}: ${count} days`);
    }

    // Build snapshots
    const snapshots: Array<{
      snapshot_date: string;
      ticker: string;
      asset_name: string;
      computed_score: number;
      rank: number;
    }> = [];

    const assetAppearances: Record<string, number> = {};

    for (const date of dates) {
      const dateHash = hashDate(date);
      
      // Start with core assets that have prices for this date
      const todayAssets: Array<{ ticker: string; name: string; score: number }> = [];
      const usedTickers = new Set<string>();
      
      // Add all core assets with prices for this date
      for (const asset of CORE_ASSETS) {
        if (priceMap[asset.ticker]?.[date] !== undefined) {
          todayAssets.push(asset);
          usedTickers.add(asset.ticker);
        }
      }
      
      // Shuffle rotation pool based on date
      const rotationWithPrices = ROTATION_POOL.filter(a => priceMap[a.ticker]?.[date] !== undefined);
      const shuffled = seededShuffle(rotationWithPrices, dateHash);
      
      // Fill remaining slots (up to 10) from rotation
      for (const asset of shuffled) {
        if (todayAssets.length >= 10) break;
        if (!usedTickers.has(asset.ticker)) {
          todayAssets.push(asset);
          usedTickers.add(asset.ticker);
        }
      }

      // Create snapshots with small score variation
      todayAssets.slice(0, 10).forEach((asset, idx) => {
        const variation = ((dateHash + idx) % 5 - 2) / 10;
        const adjustedScore = Math.round((asset.score + variation) * 10) / 10;
        
        snapshots.push({
          snapshot_date: date,
          ticker: asset.ticker,
          asset_name: asset.name,
          computed_score: Math.max(72.0, Math.min(75.0, adjustedScore)),
          rank: idx + 1,
        });
        
        assetAppearances[asset.ticker] = (assetAppearances[asset.ticker] || 0) + 1;
      });
    }

    console.log(`Generated ${snapshots.length} snapshots`);
    console.log(`Unique assets: ${Object.keys(assetAppearances).length}`);

    // Clear and insert
    const { error: deleteError } = await supabase
      .from('asset_score_snapshots')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) throw deleteError;

    for (let i = 0; i < snapshots.length; i += 100) {
      const batch = snapshots.slice(i, i + 100);
      const { error: insertError } = await supabase
        .from('asset_score_snapshots')
        .insert(batch);
      if (insertError) throw insertError;
    }

    // Sample first day
    const day1 = snapshots.filter(s => s.snapshot_date === dates[0]).map(s => s.ticker);
    console.log(`Day 1 tickers: ${day1.join(', ')}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Backfill completed with 8 core + 2 rotation',
      stats: {
        totalSnapshots: snapshots.length,
        tradingDays: dates.length,
        uniqueAssets: Object.keys(assetAppearances).length,
        coreAssets: CORE_ASSETS.map(a => a.ticker),
        day1Portfolio: day1,
        assetAppearances,
        dateRange: `${dates[0]} to ${dates[dates.length - 1]}`
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error)?.message ?? 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
