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

    console.log('[SIGNAL-GEN-CRYPTO] Starting crypto on-chain signal generation...');

    // Fetch crypto on-chain metrics
    const { data: onchain, error: onchainError } = await supabaseClient
      .from('crypto_onchain_metrics')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(1000);

    if (onchainError) throw onchainError;

    console.log(`[SIGNAL-GEN-CRYPTO] Found ${onchain?.length || 0} on-chain metric records`);

    if (!onchain || onchain.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-crypto-onchain',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'crypto_onchain_metrics',
      });
      return new Response(JSON.stringify({ message: 'No on-chain data to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(onchain.map(o => o.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const metric of onchain) {
      const assetId = tickerToAssetId.get(metric.ticker);
      if (!assetId) continue;

      // Whale signal
      const whaleSignal = metric.whale_signal?.toLowerCase() || '';
      if (whaleSignal) {
        let direction = 'neutral';
        let magnitude = 4;

        if (whaleSignal === 'accumulation' || whaleSignal.includes('buy')) {
          direction = 'up';
        } else if (whaleSignal === 'distribution' || whaleSignal.includes('sell')) {
          direction = 'down';
        }

        if (direction !== 'neutral') {
          signals.push({
            asset_id: assetId,
            signal_type: 'crypto_whale_activity',
            direction,
            magnitude,
            observed_at: metric.timestamp,
            value_text: `Whale ${whaleSignal} detected`,
            checksum: JSON.stringify({ ticker: metric.ticker, signal_type: 'crypto_whale_activity', timestamp: metric.timestamp, whaleSignal }),
            citation: { source: metric.source || 'On-Chain Analytics', timestamp: new Date().toISOString() },
            raw: { whale_signal: whaleSignal, whale_transaction_count: metric.whale_transaction_count, large_transaction_volume: metric.large_transaction_volume }
          });
        }
      }

      // Exchange flow signal
      const exchangeFlow = metric.exchange_flow_signal?.toLowerCase() || '';
      const netFlow = metric.exchange_net_flow || 0;
      if (exchangeFlow || Math.abs(netFlow) > 100) {
        let direction = 'neutral';
        let magnitude = 3;

        // Outflow from exchanges = bullish (less selling pressure)
        if (exchangeFlow.includes('outflow') || netFlow < -100) {
          direction = 'up';
          magnitude = Math.min(5, 3 + Math.abs(netFlow) / 1000);
        }
        // Inflow to exchanges = bearish (more selling pressure)
        else if (exchangeFlow.includes('inflow') || netFlow > 100) {
          direction = 'down';
          magnitude = Math.min(4, 2.5 + Math.abs(netFlow) / 1000);
        }

        if (direction !== 'neutral') {
          signals.push({
            asset_id: assetId,
            signal_type: 'crypto_exchange_flow',
            direction,
            magnitude,
            observed_at: metric.timestamp,
            value_text: `Exchange ${direction === 'up' ? 'outflow' : 'inflow'}: ${Math.abs(netFlow).toFixed(0)} BTC`,
            checksum: JSON.stringify({ ticker: metric.ticker, signal_type: 'crypto_exchange_flow', timestamp: metric.timestamp, netFlow }),
            citation: { source: metric.source || 'On-Chain Analytics', timestamp: new Date().toISOString() },
            raw: { exchange_flow_signal: exchangeFlow, exchange_net_flow: netFlow, exchange_inflow: metric.exchange_inflow, exchange_outflow: metric.exchange_outflow }
          });
        }
      }

      // Fear & Greed Index
      const fearGreed = metric.fear_greed_index;
      if (fearGreed !== null && fearGreed !== undefined) {
        let direction = 'neutral';
        let magnitude = 0;

        // Extreme fear = contrarian bullish
        if (fearGreed < 25) {
          direction = 'up';
          magnitude = Math.min(5, (25 - fearGreed) / 5);
        }
        // Extreme greed = contrarian bearish
        else if (fearGreed > 75) {
          direction = 'down';
          magnitude = Math.min(4, (fearGreed - 75) / 6);
        }

        if (direction !== 'neutral' && magnitude > 1) {
          signals.push({
            asset_id: assetId,
            signal_type: 'crypto_fear_greed',
            direction,
            magnitude,
            observed_at: metric.timestamp,
            value_text: `Fear & Greed: ${fearGreed} (${fearGreed < 25 ? 'Extreme Fear' : 'Extreme Greed'})`,
            checksum: JSON.stringify({ ticker: metric.ticker, signal_type: 'crypto_fear_greed', timestamp: metric.timestamp, fearGreed }),
            citation: { source: metric.source || 'On-Chain Analytics', timestamp: new Date().toISOString() },
            raw: { fear_greed_index: fearGreed }
          });
        }
      }

      // MVRV Ratio (Market Value to Realized Value)
      const mvrv = metric.mvrv_ratio;
      if (mvrv !== null && mvrv !== undefined) {
        let direction = 'neutral';
        let magnitude = 0;

        // MVRV < 1 = undervalued
        if (mvrv < 1) {
          direction = 'up';
          magnitude = Math.min(5, (1 - mvrv) * 5);
        }
        // MVRV > 3 = overvalued
        else if (mvrv > 3) {
          direction = 'down';
          magnitude = Math.min(4, (mvrv - 3) * 1.5);
        }

        if (direction !== 'neutral' && magnitude > 1) {
          signals.push({
            asset_id: assetId,
            signal_type: 'crypto_mvrv',
            direction,
            magnitude,
            observed_at: metric.timestamp,
            value_text: `MVRV Ratio: ${mvrv.toFixed(2)} (${mvrv < 1 ? 'Undervalued' : 'Overvalued'})`,
            checksum: JSON.stringify({ ticker: metric.ticker, signal_type: 'crypto_mvrv', timestamp: metric.timestamp, mvrv }),
            citation: { source: metric.source || 'On-Chain Analytics', timestamp: new Date().toISOString() },
            raw: { mvrv_ratio: mvrv }
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

    console.log(`[SIGNAL-GEN-CRYPTO] ✅ Created ${insertedCount} on-chain signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-crypto-onchain',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'crypto_onchain_metrics',
    });

    return new Response(JSON.stringify({ 
      success: true,
      records_processed: onchain.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-CRYPTO] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-crypto-onchain',
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
