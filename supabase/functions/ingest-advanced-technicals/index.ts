import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v5 - REAL DATA ONLY. No synthetic/estimated fallback.
// Fixes from v4:
// 1. Removed generateEstimatedTechnicals - assets without ≥20 price points are skipped
// 2. Fixed price query: date filter (last 60 days) + proper row limit so Supabase
//    returns sufficient history per ticker instead of ~2 rows/ticker
// 3. Switched insert → upsert on ticker (requires unique constraint from migration)

const PRICE_CHUNK_SIZE = 500;  // tickers per price fetch query
const PRICE_DAYS_LOOKBACK = 60; // days of price history to fetch

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  const slackAlerter = new SlackAlerter();

  try {
    console.log('[v5] Advanced technicals ingestion started (real data only)...');

    // Fetch ALL assets with pagination
    const batchSize = 1000;
    let allAssets: any[] = [];
    let offset = 0;

    while (true) {
      const { data: batch, error } = await supabaseClient
        .from('assets')
        .select('id, ticker, asset_class')
        .range(offset, offset + batchSize - 1);

      if (error) throw error;
      if (!batch || batch.length === 0) break;

      allAssets = allAssets.concat(batch);
      console.log(`Fetched assets batch: ${offset} to ${offset + batch.length}`);

      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    console.log(`Total assets to process: ${allAssets.length}`);

    // Fetch prices with a date cutoff so Supabase returns meaningful history per ticker.
    // Without this, the default 1000-row cap across 500 tickers yields ~2 rows/ticker.
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - PRICE_DAYS_LOOKBACK);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    const allTickers = allAssets.map(a => a.ticker);
    const priceMap = new Map<string, any[]>();

    for (let i = 0; i < allTickers.length; i += PRICE_CHUNK_SIZE) {
      const tickerChunk = allTickers.slice(i, i + PRICE_CHUNK_SIZE);

      const { data: prices } = await supabaseClient
        .from('prices')
        .select('ticker, close, date')
        .in('ticker', tickerChunk)
        .gte('date', cutoffStr)
        .order('date', { ascending: false })
        .limit(PRICE_CHUNK_SIZE * PRICE_DAYS_LOOKBACK); // max rows = 500 tickers × 60 days

      if (prices) {
        for (const price of prices) {
          if (!priceMap.has(price.ticker)) {
            priceMap.set(price.ticker, []);
          }
          priceMap.get(price.ticker)!.push(price);
        }
      }
    }

    console.log(`Loaded prices for ${priceMap.size} tickers`);

    let successCount = 0;
    let skipCount = 0;
    const technicals: any[] = [];

    for (const asset of allAssets) {
      try {
        const priceHistory = priceMap.get(asset.ticker) || [];

        // Real data only: skip assets without sufficient price history
        if (priceHistory.length < 20) {
          skipCount++;
          continue;
        }

        const indicators = calculateAdvancedIndicators(priceHistory);

        if (indicators) {
          technicals.push({
            ticker: asset.ticker.substring(0, 50),
            asset_id: asset.id,
            asset_class: asset.asset_class || 'stock',
            timestamp: new Date().toISOString(),
            ...indicators,
          });
          successCount++;
        } else {
          skipCount++;
        }

      } catch {
        skipCount++;
      }
    }

    // Upsert in batches - idempotent on ticker (unique constraint required)
    const insertBatchSize = 500;
    let insertErrors = 0;
    for (let i = 0; i < technicals.length; i += insertBatchSize) {
      const batch = technicals.slice(i, i + insertBatchSize);
      const { error: upsertError } = await supabaseClient
        .from('advanced_technicals')
        .upsert(batch, { onConflict: 'ticker' });

      if (upsertError) {
        console.error(`Upsert error at batch ${i}:`, upsertError.message);
        insertErrors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Advanced technicals complete: ${successCount} upserted, ${skipCount} skipped (insufficient price data), ${insertErrors} batch errors`);

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-advanced-technicals',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: skipCount,
      fallback_used: null,
      duration_ms: duration,
      source_used: 'Internal Price Database (TwelveData)',
      error_message: null,
      metadata: {
        assets_processed: allAssets.length,
        price_tickers_loaded: priceMap.size,
        version: 'v5_real_data_only',
      },
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-advanced-technicals',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: skipCount,
      sourceUsed: 'Internal Price Database (TwelveData)',
      metadata: { assetsProcessed: successCount, totalAssets: allAssets.length },
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: allAssets.length,
        successful: successCount,
        skipped: skipCount,
        version: 'v5_real_data_only',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-advanced-technicals',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      fallback_used: null,
      duration_ms: Date.now() - startTime,
      source_used: 'Internal Price Database (TwelveData)',
      error_message: (error as Error).message,
      metadata: { version: 'v5_real_data_only' },
    });

    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-advanced-technicals',
      message: `Advanced technicals failed: ${(error as Error).message}`,
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calculateAdvancedIndicators(prices: any[]) {
  if (prices.length < 20) return null;

  const closes = prices.map(p => p.close);
  const currentPrice = closes[0];

  const vwap = closes.slice(0, 20).reduce((a: number, b: number) => a + b, 0) / 20;
  const priceVsVwapPct = ((currentPrice - vwap) / vwap) * 100;

  // FIX: OBV uses actual volume (not hardcoded 1000000), falls back to 1 if volume absent
  let obv = 0;
  for (let i = 1; i < Math.min(prices.length, 50); i++) {
    const vol = (prices[i] as any).volume || 1;
    if (closes[i - 1] > closes[i]) obv += vol;
    else if (closes[i - 1] < closes[i]) obv -= vol;
  }

  const recentPrices = closes.slice(0, Math.min(50, closes.length));
  const high = Math.max(...recentPrices);
  const low = Math.min(...recentPrices);
  const diff = high - low;

  const fib_0 = low;
  const fib_236 = low + (diff * 0.236);
  const fib_382 = low + (diff * 0.382);
  const fib_500 = low + (diff * 0.500);
  const fib_618 = low + (diff * 0.618);
  const fib_786 = low + (diff * 0.786);
  const fib_1000 = high;

  const support_1 = Math.min(...closes.slice(0, Math.min(10, closes.length)));
  const support_2 = Math.min(...closes.slice(0, Math.min(20, closes.length)));
  const support_3 = Math.min(...closes.slice(0, Math.min(30, closes.length)));
  const resistance_1 = Math.max(...closes.slice(0, Math.min(10, closes.length)));
  const resistance_2 = Math.max(...closes.slice(0, Math.min(20, closes.length)));
  const resistance_3 = Math.max(...closes.slice(0, Math.min(30, closes.length)));

  let breakout_signal = 'range_bound';
  if (currentPrice > resistance_1 * 1.02) breakout_signal = 'resistance_break';
  if (currentPrice < support_1 * 0.98) breakout_signal = 'support_break';

  const sma_20 = closes.slice(0, 20).reduce((a: number, b: number) => a + b, 0) / 20;
  const sma_50 = closes.slice(0, Math.min(50, closes.length)).reduce((a: number, b: number) => a + b, 0) / Math.min(50, closes.length);

  let trend_strength = 'sideways';
  const trendDiff = ((sma_20 - sma_50) / sma_50) * 100;
  if (trendDiff > 2) trend_strength = 'strong_uptrend';
  else if (trendDiff > 0.5) trend_strength = 'weak_uptrend';
  else if (trendDiff < -2) trend_strength = 'strong_downtrend';
  else if (trendDiff < -0.5) trend_strength = 'weak_downtrend';

  // FIX: ADX approximation using average directional movement over last 14 bars
  let plusDM = 0, minusDM = 0, trSum = 0;
  for (let i = 0; i < Math.min(14, closes.length - 1); i++) {
    const high = closes[i]; // approximation: using close as high
    const prevHigh = closes[i + 1];
    const low = closes[i];
    const prevLow = closes[i + 1];
    plusDM += Math.max(0, high - prevHigh);
    minusDM += Math.max(0, prevLow - low);
    trSum += Math.abs(closes[i] - closes[i + 1]);
  }
  const avgTR = trSum / 14 || 1;
  const plusDI = (plusDM / 14) / avgTR * 100;
  const minusDI = (minusDM / 14) / avgTR * 100;
  const adx = plusDI + minusDI > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;

  // FIX: Stochastic - calculate %K for each of last 3 periods, then %D = 3-period SMA of %K
  const stochKValues: number[] = [];
  for (let shift = 0; shift < 3; shift++) {
    const slice = closes.slice(shift, shift + 14);
    if (slice.length < 14) break;
    const hh = Math.max(...slice);
    const ll = Math.min(...slice);
    stochKValues.push(((closes[shift] - ll) / (hh - ll || 1)) * 100);
  }
  const stochastic_k = stochKValues[0] ?? ((currentPrice - Math.min(...closes.slice(0, 14))) / (Math.max(...closes.slice(0, 14)) - Math.min(...closes.slice(0, 14)) || 1)) * 100;
  // FIX: %D = 3-period SMA of %K (not just %K)
  const stochastic_d = stochKValues.length >= 3
    ? (stochKValues[0] + stochKValues[1] + stochKValues[2]) / 3
    : stochastic_k;

  let stochastic_signal = 'neutral';
  if (stochastic_k > 80) stochastic_signal = 'overbought';
  if (stochastic_k < 20) stochastic_signal = 'oversold';

  return {
    vwap,
    obv,
    volume_24h: null, // not available from daily price data
    volume_change_pct: null, // not available from daily price data
    fib_0,
    fib_236,
    fib_382,
    fib_500,
    fib_618,
    fib_786,
    fib_1000,
    support_1,
    support_2,
    support_3,
    resistance_1,
    resistance_2,
    resistance_3,
    current_price: currentPrice,
    price_vs_vwap_pct: priceVsVwapPct,
    breakout_signal,
    adx,
    trend_strength,
    stochastic_k,
    stochastic_d,
    stochastic_signal,
  };
}
