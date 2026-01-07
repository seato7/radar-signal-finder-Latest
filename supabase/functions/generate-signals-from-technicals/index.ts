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

    console.log('[SIGNAL-GEN-TECHNICALS] Starting advanced technicals signal generation...');

    // Fetch recent technicals data (3.3M rows - limit to last 7 days for performance)
    const { data: technicals, error: techError } = await supabaseClient
      .from('advanced_technicals')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(10000);

    if (techError) throw techError;

    console.log(`[SIGNAL-GEN-TECHNICALS] Found ${technicals?.length || 0} technical records`);

    if (!technicals || technicals.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-technicals',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'advanced_technicals',
      });
      return new Response(JSON.stringify({ message: 'No technicals to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(technicals.map(t => t.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const tech of technicals) {
      const assetId = tickerToAssetId.get(tech.ticker);
      if (!assetId) continue;

      // Stochastic signals
      const stochK = tech.stochastic_k;
      const stochD = tech.stochastic_d;
      if (stochK !== null && stochK !== undefined) {
        let direction = 'neutral';
        let magnitude = 0;
        let signalType = 'technical_stochastic';
        
        if (stochK < 20) {
          direction = 'up'; // Oversold - bullish
          magnitude = Math.min(5, (20 - stochK) / 4); // 0-5 scale
        } else if (stochK > 80) {
          direction = 'down'; // Overbought - bearish
          magnitude = Math.min(5, (stochK - 80) / 4);
        }
        
        if (direction !== 'neutral') {
          signals.push({
            asset_id: assetId,
            signal_type: signalType,
            direction,
            magnitude,
            observed_at: tech.timestamp,
            value_text: `Stochastic K=${stochK.toFixed(1)}, D=${stochD?.toFixed(1) || 'N/A'} (${direction === 'up' ? 'Oversold' : 'Overbought'})`,
            checksum: JSON.stringify({ ticker: tech.ticker, signal_type: signalType, timestamp: tech.timestamp, stochK }),
            citation: { source: 'Advanced Technicals', timestamp: new Date().toISOString() },
            raw: { stochastic_k: stochK, stochastic_d: stochD, adx: tech.adx, trend_strength: tech.trend_strength }
          });
        }
      }

      // RSI-like signals from ADX
      if (tech.adx !== null && tech.adx !== undefined) {
        let direction = 'neutral';
        let magnitude = 0;
        
        // ADX > 25 indicates strong trend
        if (tech.adx > 40) {
          // Strong trend - check trend_strength for direction
          direction = tech.trend_strength === 'strong_uptrend' ? 'up' : 
                     tech.trend_strength === 'strong_downtrend' ? 'down' : 'neutral';
          magnitude = Math.min(5, (tech.adx - 25) / 15);
        } else if (tech.adx > 25) {
          direction = tech.trend_strength?.includes('uptrend') ? 'up' : 
                     tech.trend_strength?.includes('downtrend') ? 'down' : 'neutral';
          magnitude = Math.min(3, (tech.adx - 25) / 10);
        }
        
        if (direction !== 'neutral' && magnitude > 0.5) {
          signals.push({
            asset_id: assetId,
            signal_type: 'technical_rsi',
            direction,
            magnitude,
            observed_at: tech.timestamp,
            value_text: `ADX=${tech.adx.toFixed(1)} ${tech.trend_strength || ''} - Strong ${direction === 'up' ? 'bullish' : 'bearish'} trend`,
            checksum: JSON.stringify({ ticker: tech.ticker, signal_type: 'technical_rsi', timestamp: tech.timestamp, adx: tech.adx }),
            citation: { source: 'Advanced Technicals', timestamp: new Date().toISOString() },
            raw: { adx: tech.adx, trend_strength: tech.trend_strength }
          });
        }
      }

      // Breakout signals
      if (tech.breakout_signal) {
        const isBullish = tech.breakout_signal.toLowerCase().includes('bullish') || 
                         tech.breakout_signal.toLowerCase().includes('resistance_break');
        const direction = isBullish ? 'up' : 'down';
        const magnitude = tech.trend_strength === 'strong' ? 4 : 
                         tech.trend_strength === 'moderate' ? 3 : 2;
        
        signals.push({
          asset_id: assetId,
          signal_type: 'technical_breakout',
          direction,
          magnitude,
          observed_at: tech.timestamp,
          value_text: `Breakout: ${tech.breakout_signal}`,
          checksum: JSON.stringify({ ticker: tech.ticker, signal_type: 'technical_breakout', timestamp: tech.timestamp, breakout: tech.breakout_signal }),
          citation: { source: 'Advanced Technicals', timestamp: new Date().toISOString() },
          raw: { breakout_signal: tech.breakout_signal, trend_strength: tech.trend_strength }
        });
      }

      // VWAP signals
      if (tech.price_vs_vwap_pct !== null && tech.price_vs_vwap_pct !== undefined) {
        const vwapPct = tech.price_vs_vwap_pct;
        if (Math.abs(vwapPct) > 2) {
          const direction = vwapPct > 0 ? 'up' : 'down';
          const magnitude = Math.min(5, Math.abs(vwapPct) / 2);
          
          signals.push({
            asset_id: assetId,
            signal_type: 'technical_vwap',
            direction,
            magnitude,
            observed_at: tech.timestamp,
            value_text: `Price ${vwapPct > 0 ? 'above' : 'below'} VWAP by ${Math.abs(vwapPct).toFixed(1)}%`,
            checksum: JSON.stringify({ ticker: tech.ticker, signal_type: 'technical_vwap', timestamp: tech.timestamp, vwapPct }),
            citation: { source: 'Advanced Technicals', timestamp: new Date().toISOString() },
            raw: { price_vs_vwap_pct: vwapPct, vwap: tech.vwap, current_price: tech.current_price }
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

    console.log(`[SIGNAL-GEN-TECHNICALS] ✅ Created ${insertedCount} technical signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-technicals',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'advanced_technicals',
    });

    return new Response(JSON.stringify({ 
      success: true,
      technicals_processed: technicals.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-TECHNICALS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-technicals',
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
