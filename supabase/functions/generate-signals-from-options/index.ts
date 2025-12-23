import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
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
  const slackAlerter = new SlackAlerter();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-OPTIONS] Starting options flow signal generation...');

    const { data: optionsFlow, error: optionsError } = await supabaseClient
      .from('options_flow')
      .select('*')
      .gte('trade_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('trade_date', { ascending: false });

    if (optionsError) throw optionsError;

    console.log(`[SIGNAL-GEN-OPTIONS] Found ${optionsFlow?.length || 0} options flow records`);

    if (!optionsFlow || optionsFlow.length === 0) {
      const duration = Date.now() - startTime;
      
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-options',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'options_flow',
      });
      
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-options',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No options flow to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(optionsFlow.map(o => o.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const option of optionsFlow) {
      const assetId = tickerToAssetId.get(option.ticker);
      if (!assetId) continue;

      const isCall = option.option_type?.toLowerCase() === 'call';
      const flowType = option.flow_type?.toLowerCase();
      const isBullish = (isCall && flowType === 'sweep_buy') || (!isCall && flowType === 'sweep_sell');
      
      const direction = isBullish ? 'up' : 'down';
      const premium = option.premium || 0;
      const magnitude = Math.min(1.0, premium / 10000000);

      const signalData = {
        ticker: option.ticker,
        signal_type: 'unusual_options',
        trade_date: option.trade_date,
        premium
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'unusual_options',
        direction,
        magnitude,
        observed_at: new Date(option.trade_date).toISOString(),
        value_text: `${flowType?.toUpperCase()} ${isCall ? 'CALL' : 'PUT'} $${option.strike_price} exp ${option.expiration_date} - $${(premium / 1000).toFixed(0)}K premium`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'Options Flow Data',
          timestamp: new Date().toISOString()
        },
        raw: {
          option_type: option.option_type,
          flow_type: option.flow_type,
          strike_price: option.strike_price,
          expiration_date: option.expiration_date,
          premium,
          volume: option.volume,
          open_interest: option.open_interest,
          implied_volatility: option.implied_volatility
        }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .upsert(signals, { onConflict: 'checksum', ignoreDuplicates: true });

    if (insertError) {
      console.error('[SIGNAL-GEN-OPTIONS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-OPTIONS] ✅ Created ${signals.length} unusual options signals`);

    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-options',
      status: 'success',
      rows_inserted: signals.length,
      duration_ms: duration,
      source_used: 'options_flow',
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-options',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: signals.length,
    });

    return new Response(JSON.stringify({ 
      success: true,
      options_processed: optionsFlow.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-OPTIONS] ❌ Error:', error);
    
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-options',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-options',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
