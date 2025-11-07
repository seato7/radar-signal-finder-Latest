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
        const consecutiveFailures = logs.filter(l => l.status === 'failure').length;
        
        if (consecutiveFailures >= 3) {
          alerts.push({
            severity: 'critical',
            type: 'etl_failure',
            etl_name: etlName,
            message: `${etlName} has failed ${consecutiveFailures} times in the last 5 runs`,
            last_error: logs.find(l => l.status === 'failure')?.error_message,
            last_failure_at: logs.find(l => l.status === 'failure')?.started_at,
            recommendation: `Investigate ${etlName} function immediately. Check logs and API quotas.`
          });
        }
      });
    }

    // Check diagnostics for stale critical tables
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
              type: 'stale_data',
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

    // If there are critical alerts, optionally send Slack notification
    if (summary.critical > 0) {
      const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
      if (slackWebhook) {
        try {
          await fetch(slackWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 *CRITICAL DATA PIPELINE ALERT*`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `*${summary.critical} critical alert(s) detected*\n\n${alerts
                      .filter(a => a.severity === 'critical')
                      .map(a => `• *${a.type}*: ${a.message}`)
                      .join('\n')}`
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
