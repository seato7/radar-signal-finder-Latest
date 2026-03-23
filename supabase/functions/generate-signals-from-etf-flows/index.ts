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

    console.log('[SIGNAL-GEN-ETF] Starting ETF flows signal generation...');

    const { data: flows, error: flowsError } = await supabaseClient
      .from('etf_flows')
      .select('*')
      .gte('flow_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('flow_date', { ascending: false });

    if (flowsError) throw flowsError;

    console.log(`[SIGNAL-GEN-ETF] Found ${flows?.length || 0} ETF flow records`);

    if (!flows || flows.length === 0) {
      const duration = Date.now() - startTime;
      
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-etf-flows',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'etf_flows',
      });
      
      return new Response(JSON.stringify({ message: 'No ETF flows to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize tickers: strip exchange suffixes like "SPY:US" -> "SPY", "QQQ:NA" -> "QQQ"
    const normalizeTicker = (t: string) => t.split(':')[0].trim().toUpperCase();

    const tickers = [...new Set(flows.map(f => normalizeTicker(f.ticker)))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map(a => [a.id, a.ticker]) || []);
    console.log(`[SIGNAL-GEN-ETF] ${tickerToAssetId.size}/${tickers.length} tickers matched in assets`);

    const signals = [];
    for (const flow of flows) {
      const normalizedTicker = normalizeTicker(flow.ticker);
      const assetId = tickerToAssetId.get(normalizedTicker);
      if (!assetId) continue;

      const netFlow = flow.net_flow || ((flow.inflow || 0) - (flow.outflow || 0));
      if (!netFlow || netFlow === 0) continue; // skip zero/null flow — no signal
      const direction = netFlow > 0 ? 'up' : netFlow < 0 ? 'down' : 'neutral';
      // Scale magnitude: 0-5 based on flow size (normalize to $100M scale for better differentiation)
      const magnitude = Math.min(5, Math.abs(netFlow) / 100000000 * 2.5);

      const signalData = {
        ticker: normalizedTicker,
        signal_type: 'etf_flow',
        flow_date: flow.flow_date,
        net_flow: netFlow
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'etf_flow',
        direction,
        magnitude,
        observed_at: new Date(flow.flow_date).toISOString(),
        value_text: `ETF ${netFlow > 0 ? 'inflow' : 'outflow'}: $${Math.abs(netFlow / 1000000).toFixed(1)}M`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'ETF Flow Data',
          timestamp: new Date().toISOString()
        },
        raw: {
          inflow: flow.inflow,
          outflow: flow.outflow,
          net_flow: netFlow,
          assets_under_management: flow.aum
        }
      });
    }

    // Use upsert to avoid duplicate key errors
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (insertError) {
        console.log('[SIGNAL-GEN-ETF] Batch error (continuing):', insertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    console.log(`[SIGNAL-GEN-ETF] ✅ Upserted ${insertedCount} ETF flow signals (${signals.length - insertedCount} duplicates skipped)`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;

    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-etf-flows',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'etf_flows',
    });

    return new Response(JSON.stringify({ 
      success: true,
      flows_processed: flows.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-ETF] ❌ Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-etf-flows',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
