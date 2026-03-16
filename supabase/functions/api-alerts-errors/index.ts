import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CRITICAL_TABLES = [
  'prices',
  'signals', 
  'forex_sentiment',
  'economic_indicators',
  'advanced_technicals',
  'news_sentiment_aggregate'
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const alerts: any[] = [];
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check for ETL failures (>3 consecutive failures)
    const { data: recentLogs } = await supabaseClient
      .from('ingest_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);

    if (recentLogs) {
      const byEtl: Record<string, any[]> = {};
      recentLogs.forEach(log => {
        if (!byEtl[log.etl_name]) byEtl[log.etl_name] = [];
        byEtl[log.etl_name].push(log);
      });

      Object.keys(byEtl).forEach(etlName => {
        const logs = byEtl[etlName].slice(0, 5);
        const consecutiveFailures = logs.filter(l => l.status === 'failure' || l.status === 'failed' || l.status === 'error').length;
        
        if (consecutiveFailures >= 3) {
          alerts.push({
            severity: 'critical',
            type: 'etl_failure',
            etl_name: etlName,
            message: `${etlName} has failed ${consecutiveFailures} times in the last 5 runs`,
            last_error: logs.find(l => l.status === 'failure' || l.status === 'failed' || l.status === 'error')?.error_message,
            last_failure_at: logs.find(l => l.status === 'failure' || l.status === 'failed' || l.status === 'error')?.started_at,
            recommendation: `Investigate ${etlName} function immediately. Check logs and API quotas.`
          });
        }
      });
    }

    // PHASE 2 & 4: Check for excessive AI fallback usage (>80% in 24h OR >2% in 10min)
    const { data: fallbackAlerts24h, error: fallbackError24h } = await supabaseClient
      .rpc('check_ai_fallback_usage');

    if (!fallbackError24h && fallbackAlerts24h) {
      fallbackAlerts24h.forEach((alert: any) => {
        if (alert.is_excessive) {
          alerts.push({
            severity: 'high',
            type: 'ai_fallback_overuse_24h',
            etl_name: alert.etl_name,
            message: alert.message,
            fallback_percentage: alert.fallback_percentage,
            total_runs: alert.total_runs,
            fallback_runs: alert.fallback_runs,
            recommendation: `Primary data source for ${alert.etl_name} may be down or rate limited. Check API status and quotas.`
          });
        }
      });
    }

    // NEW: Check for excessive fallback usage in last 10 minutes (>2% threshold)
    const { data: fallbackAlerts10min, error: fallbackError10min } = await supabaseClient
      .rpc('check_excessive_fallback_usage');

    if (!fallbackError10min && fallbackAlerts10min) {
      fallbackAlerts10min.forEach((alert: any) => {
        alerts.push({
          severity: 'critical',
          type: 'ai_fallback_spike',
          etl_name: alert.etl_name,
          message: alert.message,
          fallback_percentage: alert.fallback_percentage,
          total_runs: alert.total_runs,
          recommendation: `⚠️ IMMEDIATE ACTION REQUIRED: ${alert.etl_name} exceeding 2% AI fallback threshold. Primary source likely down.`
        });
      });
    }

    // PHASE 4: Check for signal distribution skew
    const { data: skewAlerts, error: skewError } = await supabaseClient
      .rpc('check_signal_distribution_skew');

    if (!skewError && skewAlerts) {
      skewAlerts.forEach((alert: any) => {
        if (alert.is_skewed) {
          alerts.push({
            severity: 'high',
            type: 'signal_skew',
            message: alert.message,
            buy_count: alert.buy_count,
            sell_count: alert.sell_count,
            neutral_count: alert.neutral_count,
            buy_percentage: alert.buy_percentage,
            sell_percentage: alert.sell_percentage,
            recommendation: 'Data quality issue detected. Review signal generation logic and data sources.'
          });
        }
      });
    }

    // Check for stale data (>10 seconds) - Enhanced SLA monitoring
    const { data: staleTickers } = await supabaseClient
      .rpc('get_stale_tickers');
    
    if (staleTickers && staleTickers.length > 0) {
      const criticallyStale = staleTickers.filter((t: any) => t.seconds_stale > 10);
      
      if (criticallyStale.length > 0) {
        const maxStaleness = Math.max(...criticallyStale.map((t: any) => t.seconds_stale));
        const byAssetClass = criticallyStale.reduce((acc: any, t: any) => {
          if (!acc[t.asset_class]) acc[t.asset_class] = [];
          acc[t.asset_class].push(t.ticker);
          return acc;
        }, {});
        
        alerts.push({
          severity: 'critical',
          type: 'sla_breach',
          message: `🚨 SLA BREACH: ${criticallyStale.length} tickers have data >10s old (max: ${maxStaleness.toFixed(1)}s)`,
          total_stale: criticallyStale.length,
          max_staleness: maxStaleness,
          by_asset_class: byAssetClass,
          affected_tickers: criticallyStale.slice(0, 10).map((t: any) => `${t.ticker} (${t.seconds_stale.toFixed(0)}s)`),
          recommendation: 'IMMEDIATE: Data freshness SLA violated. Check Redis cache and primary API sources.'
        });
      }
    }

    // NEW: Check for duplicate key errors (>5 per hour threshold)
    const { data: duplicateErrors } = await supabaseClient
      .from('view_duplicate_key_errors')
      .select('*');
    
    if (duplicateErrors && duplicateErrors.length > 0) {
      duplicateErrors.forEach((dupError: any) => {
        alerts.push({
          severity: 'high',
          type: 'duplicate_key_errors',
          etl_name: dupError.etl_name,
          message: `⚠️ DUPLICATE KEY: ${dupError.etl_name} had ${dupError.error_count} duplicate key errors in hour ${new Date(dupError.error_hour).toLocaleString()}`,
          error_count: dupError.error_count,
          last_occurrence: dupError.last_occurrence,
          recommendation: `Review ${dupError.etl_name} checksum generation and add ON CONFLICT handling`
        });
      });
    }

    // Check diagnostics for stale critical tables (legacy 24h check)
    const diagUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-diagnostics`;
    const diagResponse = await fetch(diagUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      }
    });

    if (diagResponse.ok) {
      const diagnostics = await diagResponse.json();
      
      diagnostics.tables?.forEach((table: any) => {
        if (CRITICAL_TABLES.includes(table.table)) {
          // Empty table alert
          if (table.total_rows === 0) {
            alerts.push({
              severity: 'critical',
              type: 'empty_table',
              table: table.table,
              message: `CRITICAL: ${table.table} table is empty`,
              recommendation: `Run orchestrator immediately to populate ${table.table}`
            });
          }
          // Stale data alert (>24h)
          else if (table.status === 'very_stale') {
            alerts.push({
              severity: 'high',
              type: 'stale_data_24h',
              table: table.table,
              message: `${table.table} has no updates for ${table.hours_old?.toFixed(1)} hours`,
              last_updated: table.last_updated,
              recommendation: `Check ETL function for ${table.table} and schedule regular refreshes`
            });
          }
        }
      });
    }

    // Check for running jobs stuck for >1 hour
    const { data: stuckJobs } = await supabaseClient
      .from('ingest_logs')
      .select('*')
      .eq('status', 'running')
      .lt('started_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString());

    if (stuckJobs && stuckJobs.length > 0) {
      stuckJobs.forEach(job => {
        alerts.push({
          severity: 'high',
          type: 'stuck_job',
          etl_name: job.etl_name,
          message: `${job.etl_name} has been running for over 1 hour`,
          started_at: job.started_at,
          recommendation: 'Job may be stuck. Consider killing and restarting.'
        });
      });
    }

    // Summary
    const summary = {
      total_alerts: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      timestamp: now.toISOString()
    };

    // If there are critical or high alerts, send Slack notification
    if (summary.critical > 0 || summary.high > 0) {
      const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
      if (slackWebhook) {
        try {
          const criticalAlerts = alerts.filter(a => a.severity === 'critical');
          const highAlerts = alerts.filter(a => a.severity === 'high');
          
          let alertText = '';
          if (criticalAlerts.length > 0) {
            alertText += '*CRITICAL ALERTS:*\n' + criticalAlerts.map(a => `• ${a.message}`).join('\n') + '\n\n';
          }
          if (highAlerts.length > 0) {
            alertText += '*HIGH PRIORITY ALERTS:*\n' + highAlerts.map(a => `• ${a.message}`).join('\n');
          }

          await fetch(slackWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 *DATA PIPELINE ALERT* (${summary.critical} critical, ${summary.high} high)`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: alertText
                  }
                }
              ]
            })
          });
        } catch (err) {
          console.error('Failed to send Slack alert:', err);
        }
      }
    }

    return new Response(JSON.stringify({
      summary,
      alerts: alerts.sort((a, b) => {
        const severityOrder: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      }),
      health_status: summary.critical > 0 ? 'critical' : summary.high > 0 ? 'degraded' : 'healthy'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: summary.critical > 0 ? 503 : 200
    });

  } catch (error) {
    console.error('Error generating alerts:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
