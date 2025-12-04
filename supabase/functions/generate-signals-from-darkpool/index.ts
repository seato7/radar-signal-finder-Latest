import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

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

    console.log('[SIGNAL-GEN-DARKPOOL] Starting dark pool signal generation...');

    const { data: activities, error: activitiesError } = await supabaseClient
      .from('dark_pool_activity')
      .select('*')
      .gte('trade_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('trade_date', { ascending: false });

    if (activitiesError) throw activitiesError;

    console.log(`[SIGNAL-GEN-DARKPOOL] Found ${activities?.length || 0} dark pool activities`);

    if (!activities || activities.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-darkpool',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No activities to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(activities.map(a => a.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const activity of activities) {
      const assetId = tickerToAssetId.get(activity.ticker);
      if (!assetId) continue;

      const dpPct = activity.dark_pool_percentage || 0;
      const direction = dpPct > 40 ? 'up' : 'neutral';
      
      const magnitude = Math.min(1.0, dpPct / 100);

      const signalData = {
        ticker: activity.ticker,
        signal_type: 'dark_pool_activity',
        trade_date: activity.trade_date,
        dark_pool_percentage: dpPct
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'dark_pool_activity',
        direction,
        magnitude,
        observed_at: new Date(activity.trade_date).toISOString(),
        value_text: `Dark pool: ${dpPct.toFixed(1)}% of volume`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'FINRA Dark Pool Data',
          timestamp: new Date().toISOString()
        },
        raw: {
          dark_pool_volume: activity.dark_pool_volume,
          total_volume: activity.total_volume,
          dp_to_lit_ratio: activity.dp_to_lit_ratio,
          signal_strength: activity.signal_strength
        }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-DARKPOOL] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-DARKPOOL] ✅ Created ${signals.length} dark pool signals`);

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-darkpool',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: signals.length,
    });

    return new Response(JSON.stringify({ 
      success: true,
      activities_processed: activities.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-DARKPOOL] ❌ Error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-darkpool',
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
