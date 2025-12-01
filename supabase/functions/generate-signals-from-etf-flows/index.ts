import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      return new Response(JSON.stringify({ message: 'No ETF flows to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(flows.map(f => f.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const flow of flows) {
      const assetId = tickerToAssetId.get(flow.ticker);
      if (!assetId) continue;

      const netFlow = (flow.inflow || 0) - (flow.outflow || 0);
      const direction = netFlow > 0 ? 'up' : netFlow < 0 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(netFlow) / 1000000000); // Normalize to $1B scale

      const signalData = {
        ticker: flow.ticker,
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

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-ETF] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-ETF] ✅ Created ${signals.length} ETF flow signals`);

    return new Response(JSON.stringify({ 
      success: true,
      flows_processed: flows.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-ETF] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
