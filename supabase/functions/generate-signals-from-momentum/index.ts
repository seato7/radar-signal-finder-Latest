import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-MOMENTUM] Starting price momentum signal generation...');

    // Use assets table to get all tickers - this avoids Supabase's 1000 row default limit
    // on the prices table query
    
    // Step 1: Get all assets with their tickers (paginated to handle 26K+ assets)
    const allAssets: Array<{ id: string; ticker: string }> = [];
    let offset = 0;
    const pageSize = 5000;
    
    while (true) {
      const { data: assetBatch, error: assetError } = await supabaseClient
        .from('assets')
        .select('id, ticker')
        .range(offset, offset + pageSize - 1);
      
      if (assetError) throw assetError;
      if (!assetBatch || assetBatch.length === 0) break;
      
      allAssets.push(...assetBatch);
      offset += pageSize;
      
      if (assetBatch.length < pageSize) break;
    }

    console.log(`[SIGNAL-GEN-MOMENTUM] Found ${allAssets.length} assets to process`);

    if (allAssets.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-momentum',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'prices',
      });
      return new Response(JSON.stringify({ message: 'No assets to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create ticker to asset ID mapping
    const tickerToAssetId = new Map<string, string>();
    for (const asset of allAssets) {
      tickerToAssetId.set(asset.ticker, asset.id);
    }

    const uniqueTickers = allAssets.map(a => a.ticker);
    const signals: Array<{
      asset_id: string;
      signal_type: string;
      direction: string;
      magnitude: number;
      observed_at: string;
      value_text: string;
      checksum: string;
      citation: object;
      raw: object;
    }> = [];
    // CRITICAL: Reduce batch size to avoid Supabase's 1000 row limit on prices query
    // 25 tickers * 30 days = 750 rows, safely under 1000
    const BATCH_SIZE = 25;

    // Step 3: Process in batches to avoid memory issues
    for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
      const tickerBatch = uniqueTickers.slice(i, i + BATCH_SIZE);
      
      // Fetch prices for this batch - use range(0, 999) to explicitly request up to 1000 rows
      const { data: prices, error: pricesError } = await supabaseClient
        .from('prices')
        .select('asset_id, ticker, date, close')
        .in('ticker', tickerBatch)
        .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date', { ascending: false })
        .range(0, 999);

      if (pricesError) {
        console.error(`[SIGNAL-GEN-MOMENTUM] Error fetching batch ${i}: ${pricesError.message}`);
        continue;
      }
      
      console.log(`[SIGNAL-GEN-MOMENTUM] Batch ${Math.floor(i / BATCH_SIZE) + 1}: fetched ${prices?.length || 0} price rows for ${tickerBatch.length} tickers`);

      // Group by ticker
      const pricesByTicker = new Map<string, Array<{ date: string; close: number; asset_id: string }>>();
      for (const price of prices || []) {
        if (!pricesByTicker.has(price.ticker)) {
          pricesByTicker.set(price.ticker, []);
        }
        pricesByTicker.get(price.ticker)!.push({
          date: price.date,
          close: price.close,
          asset_id: price.asset_id || tickerToAssetId.get(price.ticker) || ''
        });
      }

      // Calculate momentum for each ticker
      for (const [ticker, tickerPrices] of pricesByTicker) {
        // Sort by date descending (most recent first)
        tickerPrices.sort((a, b) => b.date.localeCompare(a.date));

        if (tickerPrices.length < 6) continue; // Need at least 6 days for 5-day momentum

        const assetId = tickerPrices[0].asset_id || tickerToAssetId.get(ticker);
        if (!assetId) continue; // Skip if no asset ID

        const latestPrice = tickerPrices[0].close;
        const latestDate = tickerPrices[0].date;

        // Calculate 5-day momentum
        const price5d = tickerPrices[5]?.close;
        if (price5d && price5d > 0) {
          const momentum5d = ((latestPrice - price5d) / price5d) * 100;

          if (Math.abs(momentum5d) > 3) { // Only significant moves
            const direction = momentum5d > 0 ? 'up' : 'down';
            // Magnitude must be between 0 and 1 - normalize using sigmoid-like function
            const magnitude = Math.min(1.0, Math.max(0, Math.abs(momentum5d) / 100));
            const signalType = momentum5d > 0 ? 'momentum_5d_bullish' : 'momentum_5d_bearish';

            signals.push({
              asset_id: assetId,
              signal_type: signalType,
              direction,
              magnitude,
              observed_at: latestDate,
              value_text: `5-day momentum: ${momentum5d > 0 ? '+' : ''}${momentum5d.toFixed(1)}%`,
              checksum: JSON.stringify({ ticker, signal_type: signalType, date: latestDate, momentum: momentum5d.toFixed(1) }),
              citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
              raw: { ticker, latest_price: latestPrice, price_5d_ago: price5d, momentum_pct: momentum5d }
            });
          }
        }

        // Calculate 20-day momentum
        if (tickerPrices.length >= 21) {
          const price20d = tickerPrices[20]?.close;
          if (price20d && price20d > 0) {
            const momentum20d = ((latestPrice - price20d) / price20d) * 100;

            if (Math.abs(momentum20d) > 5) { // Only significant moves
              const direction = momentum20d > 0 ? 'up' : 'down';
              // Magnitude must be between 0 and 1 - normalize using sigmoid-like function
              const magnitude = Math.min(1.0, Math.max(0, Math.abs(momentum20d) / 100));
              const signalType = momentum20d > 0 ? 'momentum_20d_bullish' : 'momentum_20d_bearish';

              signals.push({
                asset_id: assetId,
                signal_type: signalType,
                direction,
                magnitude,
                observed_at: latestDate,
                value_text: `20-day momentum: ${momentum20d > 0 ? '+' : ''}${momentum20d.toFixed(1)}%`,
                checksum: JSON.stringify({ ticker, signal_type: signalType, date: latestDate, momentum: momentum20d.toFixed(1) }),
                citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
                raw: { ticker, latest_price: latestPrice, price_20d_ago: price20d, momentum_pct: momentum20d }
              });
            }
          }
        }
      }

      console.log(`[SIGNAL-GEN-MOMENTUM] Batch ${i / BATCH_SIZE + 1}: Processed ${tickerBatch.length} tickers, ${signals.length} signals so far`);
    }

    // Batch upsert
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (!insertError) insertedCount += data?.length || 0;
      else console.error(`[SIGNAL-GEN-MOMENTUM] Batch insert error: ${insertError.message}`);
    }

    console.log(`[SIGNAL-GEN-MOMENTUM] ✅ Created ${insertedCount} momentum signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-momentum',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'prices',
      metadata: {
        unique_tickers: uniqueTickers.length,
        total_signals_generated: signals.length,
        tickers_with_6plus_days: signals.length
      }
    });

    return new Response(JSON.stringify({ 
      success: true,
      tickers_processed: uniqueTickers.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-MOMENTUM] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-momentum',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
