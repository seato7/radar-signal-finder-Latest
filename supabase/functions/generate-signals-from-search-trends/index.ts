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

    console.log('[SIGNAL-GEN-TRENDS] Starting search trends signal generation...');

    const { data: trends, error: trendsError } = await supabaseClient
      .from('search_trends')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false });

    if (trendsError) throw trendsError;

    console.log(`[SIGNAL-GEN-TRENDS] Found ${trends?.length || 0} search trend records`);

    if (!trends || trends.length === 0) {
      return new Response(JSON.stringify({ message: 'No search trends to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(trends.map(t => t.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const trend of trends) {
      const assetId = tickerToAssetId.get(trend.ticker);
      if (!assetId) continue;

      const searchVolume = trend.search_volume || 0;
      const changePct = trend.change_pct || 0;
      
      // Rising search interest = potential momentum
      const direction = changePct > 20 ? 'up' : changePct < -20 ? 'down' : 'neutral';
      const magnitude = Math.min(1.0, Math.abs(changePct) / 100 + searchVolume / 100);

      const signalData = {
        ticker: trend.ticker,
        signal_type: 'search_interest',
        timestamp: trend.timestamp,
        search_volume: searchVolume
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'search_interest',
        direction,
        magnitude,
        observed_at: new Date(trend.timestamp).toISOString(),
        value_text: `Search interest: ${changePct > 0 ? '+' : ''}${changePct.toFixed(0)}% (vol: ${searchVolume})`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'Google Trends',
          timestamp: new Date().toISOString()
        },
        raw: {
          search_volume: searchVolume,
          change_pct: changePct,
          region: trend.region,
          related_queries: trend.related_queries
        }
      });
    }

    const { error: insertError } = await supabaseClient
      .from('signals')
      .insert(signals);

    if (insertError) {
      console.error('[SIGNAL-GEN-TRENDS] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-TRENDS] ✅ Created ${signals.length} search interest signals`);

    return new Response(JSON.stringify({ 
      success: true,
      trends_processed: trends.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-TRENDS] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
