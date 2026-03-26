import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { fireAiScoring } from '../_shared/fire-ai-scoring.ts';

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

    console.log('[SIGNAL-GEN-SMART-MONEY] Starting smart money flow signal generation...');

    // Fetch smart money flow data
    const { data: smartMoney, error: smError } = await supabaseClient
      .from('smart_money_flow')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(5000);

    if (smError) throw smError;

    console.log(`[SIGNAL-GEN-SMART-MONEY] Found ${smartMoney?.length || 0} smart money records`);

    if (!smartMoney || smartMoney.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-smart-money',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'smart_money_flow',
      });
      return new Response(JSON.stringify({ message: 'No smart money data to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(smartMoney.map(s => s.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map(a => [a.id, a.ticker]) || []);

    const signals = [];
    for (const sm of smartMoney) {
      const assetId = tickerToAssetId.get(sm.ticker);
      if (!assetId) continue;

      // Smart money signal from smart_money_signal field
      const smSignal = sm.smart_money_signal?.toLowerCase() || '';
      let direction = 'neutral';
      let magnitude = 0;

      if (smSignal === 'strong_buy') {
        direction = 'up';
        magnitude = 5;
      } else if (smSignal === 'buy') {
        direction = 'up';
        magnitude = 3;
      } else if (smSignal === 'strong_sell') {
        direction = 'down';
        magnitude = 4;
      } else if (smSignal === 'sell') {
        direction = 'down';
        magnitude = 2.5;
      }

      // Also check institutional vs retail flow
      const instFlow = sm.institutional_net_flow || 0;
      const retailFlow = sm.retail_net_flow || 0;
      const flowDiff = instFlow - retailFlow;

      if (direction === 'neutral' && Math.abs(flowDiff) > 10000) {
        direction = flowDiff > 0 ? 'up' : 'down';
        magnitude = Math.min(4, Math.abs(flowDiff) / 50000);
      }

      // Check MFI signal
      const mfiSignal = sm.mfi_signal?.toLowerCase() || '';
      if (direction === 'neutral' && mfiSignal) {
        if (mfiSignal === 'oversold') {
          direction = 'up';
          magnitude = 2.5;
        } else if (mfiSignal === 'overbought') {
          direction = 'down';
          magnitude = 2;
        }
      }

      // Skip neutral signals with no magnitude
      if (direction === 'neutral' || magnitude < 0.5) continue;
      
      // Use specific signal types that match scoring
      const signalType = direction === 'up' ? 'smart_money_accumulation' : 'smart_money_distribution';

      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: sm.timestamp || new Date().toISOString(),
        value_text: `Smart Money: ${smSignal || 'flow differential'} (Inst: $${(instFlow/1000).toFixed(0)}K, Retail: $${(retailFlow/1000).toFixed(0)}K)`,
        checksum: JSON.stringify({ 
          ticker: sm.ticker, 
          signal_type: 'smart_money_flow', 
          timestamp: sm.timestamp,
          instFlow,
          retailFlow
        }),
        citation: { source: 'Smart Money Flow', timestamp: new Date().toISOString() },
        raw: {
          smart_money_signal: sm.smart_money_signal,
          institutional_net_flow: instFlow,
          retail_net_flow: retailFlow,
          mfi: sm.mfi,
          mfi_signal: sm.mfi_signal,
          flow_differential: flowDiff
        }
      });
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

    console.log(`[SIGNAL-GEN-SMART-MONEY] ✅ Created ${insertedCount} smart money signals (${signals.length - insertedCount} duplicates)`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-smart-money',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'smart_money_flow',
    });

    return new Response(JSON.stringify({ 
      success: true,
      records_processed: smartMoney.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-SMART-MONEY] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-smart-money',
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
