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

    console.log('[SIGNAL-GEN-FOREX-TECH] Starting forex technicals signal generation...');

    // Fetch forex technicals
    const { data: forexTech, error: techError } = await supabaseClient
      .from('forex_technicals')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(5000);

    if (techError) throw techError;

    console.log(`[SIGNAL-GEN-FOREX-TECH] Found ${forexTech?.length || 0} forex technical records`);

    if (!forexTech || forexTech.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-forex-technicals',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'forex_technicals',
      });
      return new Response(JSON.stringify({ message: 'No forex technicals to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(forexTech.map(f => f.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const fx of forexTech) {
      const assetId = tickerToAssetId.get(fx.ticker);
      if (!assetId) continue;

      // RSI signals
      const rsi = fx.rsi_14;
      if (rsi !== null && rsi !== undefined) {
        let direction = 'neutral';
        let magnitude = 0;

        if (rsi < 30) {
          direction = 'up'; // Oversold
          magnitude = Math.min(5, (30 - rsi) / 6);
        } else if (rsi > 70) {
          direction = 'down'; // Overbought
          magnitude = Math.min(5, (rsi - 70) / 6);
        }

        if (direction !== 'neutral') {
          // Use specific signal types that match scoring expectations
          const signalType = direction === 'up' ? 'forex_rsi_oversold' : 'forex_rsi_overbought';
          signals.push({
            asset_id: assetId,
            signal_type: signalType,
            direction,
            magnitude,
            observed_at: fx.timestamp,
            value_text: `RSI ${rsi.toFixed(1)} (${direction === 'up' ? 'Oversold' : 'Overbought'})`,
            checksum: JSON.stringify({ ticker: fx.ticker, signal_type: 'forex_rsi', timestamp: fx.timestamp, rsi }),
            citation: { source: 'Forex Technicals', timestamp: new Date().toISOString() },
            raw: { rsi_14: rsi, rsi_signal: fx.rsi_signal }
          });
        }
      }

      // MACD crossover signals
      const macdCrossover = fx.macd_crossover?.toLowerCase() || '';
      if (macdCrossover) {
        let direction = 'neutral';
        let magnitude = 3;

        if (macdCrossover === 'bullish' || macdCrossover.includes('bull')) {
          direction = 'up';
        } else if (macdCrossover === 'bearish' || macdCrossover.includes('bear')) {
          direction = 'down';
        }

        if (direction !== 'neutral') {
          signals.push({
            asset_id: assetId,
            signal_type: 'forex_macd',
            direction,
            magnitude,
            observed_at: fx.timestamp,
            value_text: `MACD ${macdCrossover} crossover`,
            checksum: JSON.stringify({ ticker: fx.ticker, signal_type: 'forex_macd', timestamp: fx.timestamp, macdCrossover }),
            citation: { source: 'Forex Technicals', timestamp: new Date().toISOString() },
            raw: { macd_line: fx.macd_line, macd_signal: fx.macd_signal, macd_histogram: fx.macd_histogram, macd_crossover: macdCrossover }
          });
        }
      }

      // MA crossover signals
      const maCrossover = fx.ma_crossover?.toLowerCase() || '';
      if (maCrossover) {
        let direction = 'neutral';
        let magnitude = 2.5;

        if (maCrossover === 'golden_cross' || maCrossover.includes('bull')) {
          direction = 'up';
          magnitude = 4;
        } else if (maCrossover === 'death_cross' || maCrossover.includes('bear')) {
          direction = 'down';
          magnitude = 3.5;
        }

        if (direction !== 'neutral') {
          signals.push({
            asset_id: assetId,
            signal_type: 'forex_ma_crossover',
            direction,
            magnitude,
            observed_at: fx.timestamp,
            value_text: `MA Crossover: ${maCrossover.replace('_', ' ')}`,
            checksum: JSON.stringify({ ticker: fx.ticker, signal_type: 'forex_ma_crossover', timestamp: fx.timestamp, maCrossover }),
            citation: { source: 'Forex Technicals', timestamp: new Date().toISOString() },
            raw: { sma_50: fx.sma_50, sma_200: fx.sma_200, ema_50: fx.ema_50, ema_200: fx.ema_200, ma_crossover: maCrossover }
          });
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

    console.log(`[SIGNAL-GEN-FOREX-TECH] ✅ Created ${insertedCount} forex technical signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-forex-technicals',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'forex_technicals',
    });

    return new Response(JSON.stringify({ 
      success: true,
      records_processed: forexTech.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-FOREX-TECH] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-forex-technicals',
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
