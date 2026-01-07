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

    console.log('[SIGNAL-GEN-AI-RESEARCH] Starting AI research signal generation...');

    // Fetch AI research reports
    const { data: reports, error: reportsError } = await supabaseClient
      .from('ai_research_reports')
      .select('*')
      .gte('generated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('generated_at', { ascending: false })
      .limit(1000);

    if (reportsError) throw reportsError;

    console.log(`[SIGNAL-GEN-AI-RESEARCH] Found ${reports?.length || 0} AI research reports`);

    if (!reports || reports.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-ai-research',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'ai_research_reports',
      });
      return new Response(JSON.stringify({ message: 'No AI research to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings
    const tickers = [...new Set(reports.map(r => r.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    const signals = [];
    for (const report of reports) {
      const assetId = report.asset_id || tickerToAssetId.get(report.ticker);
      if (!assetId) continue;

      // Parse recommendation
      const recommendation = report.recommendation?.toLowerCase() || '';
      let direction = 'neutral';
      let magnitude = 3;

      if (recommendation.includes('strong buy') || recommendation.includes('strongly bullish')) {
        direction = 'up';
        magnitude = 5;
      } else if (recommendation.includes('buy') || recommendation.includes('bullish')) {
        direction = 'up';
        magnitude = 4;
      } else if (recommendation.includes('strong sell') || recommendation.includes('strongly bearish')) {
        direction = 'down';
        magnitude = 4;
      } else if (recommendation.includes('sell') || recommendation.includes('bearish')) {
        direction = 'down';
        magnitude = 3;
      } else if (recommendation.includes('hold') || recommendation.includes('neutral')) {
        direction = 'neutral';
        magnitude = 1;
      }

      // Adjust magnitude by confidence score
      const confidence = report.confidence_score || 50;
      magnitude = magnitude * (confidence / 100);

      // Skip weak signals
      if (direction === 'neutral' && magnitude < 1) continue;
      
      // Use specific signal types that match scoring expectations
      const signalType = direction === 'up' ? 'ai_research_buy' : 
                         direction === 'down' ? 'ai_research_sell' : 'ai_research_hold';

      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude: Math.min(5, magnitude),
        observed_at: report.generated_at || new Date().toISOString(),
        value_text: `AI Research: ${recommendation} (${confidence}% confidence) - ${report.executive_summary?.substring(0, 100) || 'No summary'}`,
        checksum: JSON.stringify({ 
          ticker: report.ticker, 
          signal_type: 'ai_research', 
          generated_at: report.generated_at,
          recommendation 
        }),
        citation: { 
          source: report.generated_by || 'AI Research', 
          timestamp: new Date().toISOString() 
        },
        raw: {
          recommendation: report.recommendation,
          confidence_score: confidence,
          target_price: report.target_price,
          stop_loss: report.stop_loss,
          time_horizon: report.time_horizon,
          report_type: report.report_type
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

    console.log(`[SIGNAL-GEN-AI-RESEARCH] ✅ Created ${insertedCount} AI research signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-ai-research',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'ai_research_reports',
    });

    return new Response(JSON.stringify({ 
      success: true,
      reports_processed: reports.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-AI-RESEARCH] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-ai-research',
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
