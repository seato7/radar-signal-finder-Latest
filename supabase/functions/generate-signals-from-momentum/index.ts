import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHUNK_SIZE = 1000; // Assets per chunk
const TICKER_BATCH_SIZE = 50; // Tickers per price query

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

    // Parse request body for offset parameter
    let offset = 0;
    try {
      const body = await req.json();
      offset = body?.offset ?? 0;
    } catch {
      // No body or invalid JSON, use default offset 0
    }

    console.log(`[SIGNAL-GEN-MOMENTUM] Starting chunk at offset ${offset}...`);

    // Get total asset count first
    const { count: totalAssets } = await supabaseClient
      .from('assets')
      .select('*', { count: 'exact', head: true });

    // Fetch assets for this chunk only
    const { data: assetBatch, error: assetError } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .range(offset, offset + CHUNK_SIZE - 1);

    if (assetError) throw assetError;

    console.log(`[SIGNAL-GEN-MOMENTUM] Processing ${assetBatch?.length || 0} assets (offset ${offset}, total ${totalAssets})`);

    if (!assetBatch || assetBatch.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-momentum',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'prices',
        metadata: { offset, chunk_complete: true, all_complete: true }
      });
      return new Response(JSON.stringify({ 
        message: 'No more assets to process', 
        signals_created: 0,
        offset,
        next_offset: null,
        complete: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create ticker to asset ID mapping
    const tickerToAssetId = new Map<string, string>();
    for (const asset of assetBatch) {
      tickerToAssetId.set(asset.ticker, asset.id);
    }

    const uniqueTickers = assetBatch.map(a => a.ticker);
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

    // Process in ticker batches
    for (let i = 0; i < uniqueTickers.length; i += TICKER_BATCH_SIZE) {
      const tickerBatch = uniqueTickers.slice(i, i + TICKER_BATCH_SIZE);
      
      // Fetch prices for this batch
      const { data: prices, error: pricesError } = await supabaseClient
        .from('prices')
        .select('asset_id, ticker, date, close')
        .in('ticker', tickerBatch)
        .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(tickerBatch.length * 30); // ~30 days per ticker

      if (pricesError) {
        console.error(`[SIGNAL-GEN-MOMENTUM] Error fetching batch ${i}: ${pricesError.message}`);
        continue;
      }

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
        tickerPrices.sort((a, b) => b.date.localeCompare(a.date));

        // Allow momentum calculation with at least 2 prices (lowered from 6)
        if (tickerPrices.length < 2) continue;

        const assetId = tickerPrices[0].asset_id || tickerToAssetId.get(ticker);
        if (!assetId) continue;

        const latestPrice = tickerPrices[0].close;
        const latestDate = tickerPrices[0].date;

        // Calculate 5-day momentum - use available data if less than 6 prices
        const lookbackIndex5d = Math.min(5, tickerPrices.length - 1);
        const price5d = tickerPrices[lookbackIndex5d]?.close;
        const hasLimitedData5d = tickerPrices.length < 6;
        
        if (price5d && price5d > 0) {
          const momentum5d = ((latestPrice - price5d) / price5d) * 100;

          // Always create a signal - magnitude indicates strength
          const direction = momentum5d > 0 ? 'up' : (momentum5d < 0 ? 'down' : 'neutral');
          const magnitude = Math.min(1.0, Math.max(0, Math.abs(momentum5d) / 20)); // Scale: 20% = max magnitude

          // Different signal types based on strength, with limited_data suffix if sparse
          const dataQuality = hasLimitedData5d ? '_limited_data' : '';
          let signalType: string;
          if (Math.abs(momentum5d) > 5) {
            signalType = momentum5d > 0 ? `momentum_5d_strong_bullish${dataQuality}` : `momentum_5d_strong_bearish${dataQuality}`;
          } else if (Math.abs(momentum5d) > 2) {
            signalType = momentum5d > 0 ? `momentum_5d_bullish${dataQuality}` : `momentum_5d_bearish${dataQuality}`;
          } else {
            signalType = momentum5d > 0 ? `momentum_5d_weak_bullish${dataQuality}` : `momentum_5d_weak_bearish${dataQuality}`;
          }

          signals.push({
            asset_id: assetId,
            signal_type: signalType,
            direction,
            magnitude,
            observed_at: latestDate,
            value_text: `5-day momentum: ${momentum5d > 0 ? '+' : ''}${momentum5d.toFixed(1)}%${hasLimitedData5d ? ' (limited data)' : ''}`,
            checksum: JSON.stringify({ ticker, signal_type: signalType, date: latestDate, momentum: momentum5d.toFixed(1) }),
            citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
            raw: { ticker, latest_price: latestPrice, price_5d_ago: price5d, momentum_pct: momentum5d, days_available: tickerPrices.length }
          });
        }

        // Calculate 20-day momentum - use available data if between 6-20 prices
        if (tickerPrices.length >= 6) {
          const lookbackIndex20d = Math.min(20, tickerPrices.length - 1);
          const price20d = tickerPrices[lookbackIndex20d]?.close;
          const hasLimitedData20d = tickerPrices.length < 21;
          
          if (price20d && price20d > 0) {
            const momentum20d = ((latestPrice - price20d) / price20d) * 100;

            // Always create a signal - magnitude indicates strength
            const direction = momentum20d > 0 ? 'up' : (momentum20d < 0 ? 'down' : 'neutral');
            const magnitude = Math.min(1.0, Math.max(0, Math.abs(momentum20d) / 30)); // Scale: 30% = max magnitude

            // Different signal types based on strength, with limited_data suffix if sparse
            const dataQuality = hasLimitedData20d ? '_limited_data' : '';
            let signalType: string;
            if (Math.abs(momentum20d) > 10) {
              signalType = momentum20d > 0 ? `momentum_20d_strong_bullish${dataQuality}` : `momentum_20d_strong_bearish${dataQuality}`;
            } else if (Math.abs(momentum20d) > 3) {
              signalType = momentum20d > 0 ? `momentum_20d_bullish${dataQuality}` : `momentum_20d_bearish${dataQuality}`;
            } else {
              signalType = momentum20d > 0 ? `momentum_20d_weak_bullish${dataQuality}` : `momentum_20d_weak_bearish${dataQuality}`;
            }

            signals.push({
              asset_id: assetId,
              signal_type: signalType,
              direction,
              magnitude,
              observed_at: latestDate,
              value_text: `20-day momentum: ${momentum20d > 0 ? '+' : ''}${momentum20d.toFixed(1)}%${hasLimitedData20d ? ' (limited data)' : ''}`,
              checksum: JSON.stringify({ ticker, signal_type: signalType, date: latestDate, momentum: momentum20d.toFixed(1) }),
              citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
              raw: { ticker, latest_price: latestPrice, price_20d_ago: price20d, momentum_pct: momentum20d, days_available: tickerPrices.length }
            });
          }
        }
      }
    }

    // Batch upsert signals
    let insertedCount = 0;
    const insertBatchSize = 100;
    for (let i = 0; i < signals.length; i += insertBatchSize) {
      const batch = signals.slice(i, i + insertBatchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (!insertError) insertedCount += data?.length || 0;
      else console.error(`[SIGNAL-GEN-MOMENTUM] Batch insert error: ${insertError.message}`);
    }

    // Calculate next offset
    const nextOffset = offset + CHUNK_SIZE;
    const hasMore = nextOffset < (totalAssets || 0);

    console.log(`[SIGNAL-GEN-MOMENTUM] ✅ Chunk complete: ${insertedCount} signals created, next_offset: ${hasMore ? nextOffset : null}`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-momentum',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'prices',
      metadata: {
        offset,
        chunk_size: assetBatch.length,
        total_assets: totalAssets,
        next_offset: hasMore ? nextOffset : null,
        signals_generated: signals.length
      }
    });

    return new Response(JSON.stringify({ 
      success: true,
      offset,
      tickers_processed: assetBatch.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount,
      next_offset: hasMore ? nextOffset : null,
      complete: !hasMore,
      total_assets: totalAssets
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
