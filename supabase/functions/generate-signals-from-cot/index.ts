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

    console.log('[SIGNAL-GEN-COT] Starting COT report signal generation...');

    // Get COT reports from last 90 days
    const { data: reports, error: reportsError } = await supabaseClient
      .from('cot_reports')
      .select('*')
      .gte('report_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('report_date', { ascending: false });

    if (reportsError) throw reportsError;

    console.log(`[SIGNAL-GEN-COT] Found ${reports?.length || 0} COT reports`);

    if (!reports || reports.length === 0) {
      return new Response(JSON.stringify({ message: 'No reports to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset IDs for tickers
    const tickers = [...new Set(reports.map(r => r.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Create signals from COT reports
    const signals = [];
    for (const report of reports) {
      const assetId = tickerToAssetId.get(report.ticker);
      if (!assetId) continue;

      // Determine direction based on net position change
      const netChange = report.net_position_change || 0;
      const direction = netChange > 0 ? 'up' : netChange < 0 ? 'down' : 'neutral';
      
      // Magnitude based on position size relative to total
      const totalPositions = Math.abs(report.noncommercial_net || 0) + 
                            Math.abs(report.commercial_net || 0);
      const magnitude = Math.min(1.0, Math.abs(netChange) / (totalPositions || 1));

      signals.push({
        asset_id: assetId,
        signal_type: 'cot_positioning',
        direction,
        magnitude,
        observed_at: new Date(report.report_date).toISOString(),
        value_text: `Net position change: ${netChange > 0 ? '+' : ''}${netChange}`,
        metadata: {
          noncommercial_net: report.noncommercial_net,
          commercial_net: report.commercial_net,
          sentiment: report.sentiment
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
      console.error('[SIGNAL-GEN-COT] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[SIGNAL-GEN-COT] ✅ Created ${signals.length} COT positioning signals`);

    return new Response(JSON.stringify({ 
      success: true,
      reports_processed: reports.length,
      signals_created: signals.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-COT] ❌ Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
