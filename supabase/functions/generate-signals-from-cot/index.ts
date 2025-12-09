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

    console.log('[SIGNAL-GEN-COT] Starting COT report signal generation...');

    const { data: reports, error: reportsError } = await supabaseClient
      .from('cot_reports')
      .select('*')
      .gte('report_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('report_date', { ascending: false });

    if (reportsError) throw reportsError;

    console.log(`[SIGNAL-GEN-COT] Found ${reports?.length || 0} COT reports`);

    if (!reports || reports.length === 0) {
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'generate-signals-from-cot',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(JSON.stringify({ message: 'No reports to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tickers = [...new Set(reports.map(r => r.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const report of reports) {
      const assetId = tickerToAssetId.get(report.ticker);
      if (!assetId) continue;

      const netChange = report.net_position_change || 0;
      const direction = netChange > 0 ? 'up' : netChange < 0 ? 'down' : 'neutral';
      
      const totalPositions = Math.abs(report.noncommercial_net || 0) + 
                            Math.abs(report.commercial_net || 0);
      const magnitude = Math.min(1.0, Math.abs(netChange) / (totalPositions || 1));

      const signalData = {
        ticker: report.ticker,
        signal_type: 'cot_positioning',
        report_date: report.report_date,
        net_change: netChange
      };
      
      signals.push({
        asset_id: assetId,
        signal_type: 'cot_positioning',
        direction,
        magnitude,
        observed_at: new Date(report.report_date).toISOString(),
        value_text: `Net position change: ${netChange > 0 ? '+' : ''}${netChange}`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'CFTC Commitment of Traders',
          timestamp: new Date().toISOString()
        },
        raw: {
          noncommercial_net: report.noncommercial_net,
          commercial_net: report.commercial_net,
          sentiment: report.sentiment
        }
      });
    }

    // Use upsert to handle duplicate signals gracefully
    const { data: upsertResult, error: insertError } = await supabaseClient
      .from('signals')
      .upsert(signals, { 
        onConflict: 'checksum',
        ignoreDuplicates: true 
      })
      .select('id');

    if (insertError) {
      console.error('[SIGNAL-GEN-COT] Insert error:', insertError);
      throw insertError;
    }
    
    const actualInserted = upsertResult?.length || 0;
    console.log(`[SIGNAL-GEN-COT] Upserted ${actualInserted} signals (${signals.length - actualInserted} duplicates skipped)`);

    console.log(`[SIGNAL-GEN-COT] ✅ Created ${actualInserted} COT positioning signals`);

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-signals-from-cot',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: actualInserted,
      rowsSkipped: signals.length - actualInserted,
    });

    return new Response(JSON.stringify({ 
      success: true,
      reports_processed: reports.length,
      signals_created: actualInserted,
      duplicates_skipped: signals.length - actualInserted
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-COT] ❌ Error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'generate-signals-from-cot',
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
