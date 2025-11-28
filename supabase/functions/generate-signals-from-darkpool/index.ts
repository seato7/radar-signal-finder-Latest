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

    console.log('[SIGNAL-GEN-DARKPOOL] Starting dark pool signal generation...');

    // Get dark pool activity from last 30 days
    const { data: activities, error: activitiesError } = await supabaseClient
      .from('dark_pool_activity')
      .select('*')
      .gte('trade_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('trade_date', { ascending: false });

    if (activitiesError) throw activitiesError;

    console.log(`[SIGNAL-GEN-DARKPOOL] Found ${activities?.length || 0} dark pool activities`);

    if (!activities || activities.length === 0) {
      return new Response(JSON.stringify({ message: 'No activities to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset IDs for tickers
    const tickers = [...new Set(activities.map(a => a.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Create signals from dark pool activity
    const signals = [];
    for (const activity of activities) {
      const assetId = tickerToAssetId.get(activity.ticker);
      if (!assetId) continue;

      // High dark pool percentage suggests institutional accumulation
      const dpPct = activity.dark_pool_percentage || 0;
      const direction = dpPct > 40 ? 'up' : 'neutral'; // >40% dark pool is bullish
      
      // Magnitude based on dark pool percentage and volume
      const magnitude = Math.min(1.0, dpPct / 100);

      signals.push({
        asset_id: assetId,
        signal_type: 'dark_pool_activity',
        direction,
        magnitude,
        observed_at: new Date(activity.trade_date).toISOString(),
        value_text: `Dark pool: ${dpPct.toFixed(1)}% of volume`,
        metadata: {
          dark_pool_volume: activity.dark_pool_volume,
          total_volume: activity.total_volume,
          dp_to_lit_ratio: activity.dp_to_lit_ratio,
          signal_strength: activity.signal_strength
        }
      });
    }

    // Insert signals
    const { error: insertError } = await supabaseClient
      .from('signals')
      .upsert(signals, { 
        onConflict: 'asset_id,signal_type,observed_at',
        ignoreDuplicates: true 
      });

    if (insertError) {
      console.error('[SIGNAL-GEN-DARKPOOL] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-DARKPOOL] ✅ Created ${signals.length} dark pool signals`);

    return new Response(JSON.stringify({ 
      success: true,
      activities_processed: activities.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-DARKPOOL] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
