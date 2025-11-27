import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const slackAlerter = new SlackAlerter();

    console.log('🔍 Checking ingestion success rates (last 24 hours)...');

    // All automated ingestion functions to monitor
    const MONITORED_FUNCTIONS = [
      'ingest-prices-yahoo',
      'ingest-news-sentiment',
      'ingest-breaking-news',
      'ingest-form4',
      'ingest-congressional-trades',
      'ingest-etf-flows',
      'ingest-policy-feeds',
      'ingest-dark-pool',
      'ingest-finra-darkpool',
      'ingest-options-flow',
      'ingest-crypto-onchain',
      'ingest-pattern-recognition',
      'ingest-advanced-technicals',
      'ingest-forex-technicals',
      'ingest-forex-sentiment',
      'ingest-earnings',
      'ingest-economic-calendar',
      'ingest-fred-economics',
      'ingest-cot-reports',
      'ingest-cot-cftc',
      'ingest-google-trends',
      'ingest-search-trends',
      'ingest-reddit-sentiment',
      'ingest-stocktwits',
      'ingest-job-postings',
      'ingest-patents',
      'ingest-supply-chain',
      'ingest-ai-research',
      'ingest-short-interest',
      'ingest-smart-money'
    ];

    // Get all ingestion runs from last 24 hours for monitored functions
    const { data: logs, error } = await supabaseClient
      .from('ingest_logs')
      .select('etl_name, status')
      .in('etl_name', MONITORED_FUNCTIONS)
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    // Calculate success rates per function
    const functionStats = new Map<string, { total: number; success: number; failed: number }>();

    logs?.forEach(log => {
      if (!functionStats.has(log.etl_name)) {
        functionStats.set(log.etl_name, { total: 0, success: 0, failed: 0 });
      }
      const stats = functionStats.get(log.etl_name)!;
      stats.total++;
      if (log.status === 'success') {
        stats.success++;
      } else if (log.status === 'failed') {
        stats.failed++;
      }
    });

    const THRESHOLD = 95; // 95% success rate threshold
    const belowThreshold: Array<{ name: string; rate: number; total: number; failed: number }> = [];
    const results: Array<{ name: string; rate: number; total: number; status: string }> = [];

    functionStats.forEach((stats, name) => {
      const successRate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0;
      const status = successRate >= THRESHOLD ? '✅' : '⚠️';
      
      results.push({
        name,
        rate: parseFloat(successRate.toFixed(2)),
        total: stats.total,
        status
      });

      if (successRate < THRESHOLD && stats.total >= 3) { // Only alert if at least 3 runs
        belowThreshold.push({
          name,
          rate: parseFloat(successRate.toFixed(2)),
          total: stats.total,
          failed: stats.failed
        });
      }
    });

    // Sort by success rate (lowest first)
    results.sort((a, b) => a.rate - b.rate);

    // Send Slack alerts for functions below threshold
    if (belowThreshold.length > 0) {
      console.log(`⚠️ ${belowThreshold.length} functions below ${THRESHOLD}% success rate`);
      
      for (const func of belowThreshold) {
        await slackAlerter.sendCriticalAlert({
          type: 'sla_breach',
          etlName: func.name,
          message: `🚨 Ingestion Success Rate Alert: ${func.name}`,
          details: {
            success_rate: `${func.rate}%`,
            threshold: `${THRESHOLD}%`,
            total_runs: func.total,
            failed_runs: func.failed,
            status: 'BELOW THRESHOLD',
            action_required: 'Investigate and fix ingestion issues'
          }
        });
      }

      // Send summary alert
      const summaryMessage = belowThreshold
        .map(f => `• ${f.name}: ${f.rate}% (${f.failed}/${f.total} failed)`)
        .join('\n');

      await slackAlerter.sendCriticalAlert({
        type: 'sla_breach',
        etlName: 'monitor-ingestion-success-rates',
        message: `⚠️ ${belowThreshold.length} Ingestion Functions Below ${THRESHOLD}%`,
        details: {
          summary: summaryMessage,
          threshold: `${THRESHOLD}%`,
          time_window: 'Last 24 hours',
          total_functions_monitored: functionStats.size
        }
      });
    } else {
      console.log(`✅ All ${functionStats.size} functions above ${THRESHOLD}% success rate`);
      
      // Send success notification
      await slackAlerter.sendLiveAlert({
        etlName: 'monitor-ingestion-success-rates',
        status: 'success',
        duration: 0,
        metadata: {
          message: `✅ All ${functionStats.size} ingestion functions above ${THRESHOLD}% success rate`,
          total_functions: functionStats.size,
          threshold: `${THRESHOLD}%`,
          time_window: 'Last 24 hours',
          status: 'PRODUCTION READY'
        }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        threshold: THRESHOLD,
        total_functions: functionStats.size,
        below_threshold: belowThreshold.length,
        functions_below_threshold: belowThreshold,
        all_results: results,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('❌ Error monitoring ingestion rates:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
