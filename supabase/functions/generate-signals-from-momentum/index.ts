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

    // Fetch recent prices (last 30 days)
    const { data: prices, error: pricesError } = await supabaseClient
      .from('prices')
      .select('asset_id, ticker, date, close')
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false })
      .limit(50000);

    if (pricesError) throw pricesError;

    console.log(`[SIGNAL-GEN-MOMENTUM] Found ${prices?.length || 0} price records`);

    if (!prices || prices.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-momentum',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'prices',
      });
      return new Response(JSON.stringify({ message: 'No prices to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Group prices by ticker
    const pricesByTicker = new Map<string, Array<{ date: string; close: number; asset_id: string }>>();
    for (const price of prices) {
      const ticker = price.ticker;
      if (!pricesByTicker.has(ticker)) {
        pricesByTicker.set(ticker, []);
      }
      pricesByTicker.get(ticker)!.push({
        date: price.date,
        close: price.close,
        asset_id: price.asset_id
      });
    }

    const signals = [];
    const today = new Date().toISOString().split('T')[0];

    for (const [ticker, tickerPrices] of pricesByTicker) {
      // Sort by date descending
      tickerPrices.sort((a, b) => b.date.localeCompare(a.date));

      if (tickerPrices.length < 6) continue; // Need at least 6 days of data

      const assetId = tickerPrices[0].asset_id;
      const latestPrice = tickerPrices[0].close;
      const latestDate = tickerPrices[0].date;

      // Calculate 5-day momentum
      const price5d = tickerPrices[5]?.close;
      if (price5d && price5d > 0) {
        const momentum5d = ((latestPrice - price5d) / price5d) * 100;

        if (Math.abs(momentum5d) > 3) { // Only significant moves
          const direction = momentum5d > 0 ? 'up' : 'down';
          const magnitude = Math.min(5, Math.abs(momentum5d) / 3);

          signals.push({
            asset_id: assetId,
            signal_type: 'momentum_5d',
            direction,
            magnitude,
            observed_at: latestDate,
            value_text: `5-day momentum: ${momentum5d > 0 ? '+' : ''}${momentum5d.toFixed(1)}%`,
            checksum: JSON.stringify({ ticker, signal_type: 'momentum_5d', date: latestDate, momentum: momentum5d.toFixed(1) }),
            citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
            raw: { latest_price: latestPrice, price_5d_ago: price5d, momentum_pct: momentum5d }
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
            const magnitude = Math.min(5, Math.abs(momentum20d) / 5);

            signals.push({
              asset_id: assetId,
              signal_type: 'momentum_20d',
              direction,
              magnitude,
              observed_at: latestDate,
              value_text: `20-day momentum: ${momentum20d > 0 ? '+' : ''}${momentum20d.toFixed(1)}%`,
              checksum: JSON.stringify({ ticker, signal_type: 'momentum_20d', date: latestDate, momentum: momentum20d.toFixed(1) }),
              citation: { source: 'Price Momentum', timestamp: new Date().toISOString() },
              raw: { latest_price: latestPrice, price_20d_ago: price20d, momentum_pct: momentum20d }
            });
          }
        }
      }
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
    });

    return new Response(JSON.stringify({ 
      success: true,
      tickers_processed: pricesByTicker.size,
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
