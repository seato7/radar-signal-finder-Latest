// redeployed 2026-03-17
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Expected function intervals in minutes
// NOTE: Price ingestion moved to Railway backend (Twelve Data) - not monitored here
const FUNCTION_INTERVALS: Record<string, number> = {
  'ingest-breaking-news': 180,
  'ingest-news-sentiment': 180,
  'ingest-smart-money': 360,
  'ingest-pattern-recognition': 360,
  'ingest-advanced-technicals': 360,
  'ingest-ai-research': 360,
  'ingest-etf-flows': 360,
  'ingest-form4': 360,
  'ingest-policy-feeds': 360,
  'ingest-forex-sentiment': 360,
  'ingest-forex-technicals': 360,
  'ingest-crypto-onchain': 360,
  'ingest-dark-pool': 360,
  'ingest-sec-13f-edgar': 360,
  'ingest-short-interest': 360,
  'ingest-earnings': 360,
  'ingest-stocktwits': 360,
  'ingest-supply-chain': 360,
  'ingest-job-postings': 360,
  'ingest-congressional-trades': 360,
  'ingest-options-flow': 360,
  'ingest-reddit-sentiment': 360,
  'ingest-cot-reports': 360,
  'ingest-cot-cftc': 360,
  'ingest-finra-darkpool': 360,
  'ingest-patents': 360,
  'ingest-search-trends': 360,
  'ingest-economic-calendar': 360,
  'ingest-fred-economics': 360,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const slackAlerter = new SlackAlerter();
    console.log('[WATCHDOG] 🐕 Starting health check...')

    const startTime = Date.now();

    const alerts: Array<{
      severity: string
      function_name: string
      issue: string
      last_run: string | null
      minutes_stale: number | null
    }> = []

    // Check for stale functions
    const { data: stalenessData, error: stalenessError } = await supabaseClient
      .rpc('get_stale_functions')

    if (stalenessError) {
      console.error('[WATCHDOG] ❌ Error checking staleness:', stalenessError)
    } else if (stalenessData && stalenessData.length > 0) {
      for (const stale of stalenessData) {
        alerts.push({
          severity: stale.alert_severity,
          function_name: stale.function_name,
          issue: `Function is stale (${stale.minutes_stale} min since last run, expected every ${stale.expected_interval_minutes} min)`,
          last_run: stale.last_run,
          minutes_stale: stale.minutes_stale,
        })
        console.log(`[WATCHDOG] ⚠️ ${stale.alert_severity}: ${stale.function_name} is stale (${stale.minutes_stale} min)`)
      }
    }

    // Check for repeated failures (3+ failures in last 6 hours)
    const { data: failureData, error: failureError } = await supabaseClient
      .from('function_status')
      .select('function_name, status, executed_at, error_message')
      .eq('status', 'failure')
      .gte('executed_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('executed_at', { ascending: false })

    if (failureError) {
      console.error('[WATCHDOG] ❌ Error checking failures:', failureError)
    } else if (failureData) {
      const failureCounts: Record<string, number> = {}
      for (const failure of failureData) {
        failureCounts[failure.function_name] = (failureCounts[failure.function_name] || 0) + 1
      }

      for (const [funcName, count] of Object.entries(failureCounts)) {
        if (count >= 3) {
          alerts.push({
            severity: 'CRITICAL',
            function_name: funcName,
            issue: `${count} failures in last 6 hours`,
            last_run: null,
            minutes_stale: null,
          })
          console.log(`[WATCHDOG] 🚨 CRITICAL: ${funcName} has ${count} failures in 6h`)
        }
      }
    }

    // Check for fallback overuse (>80% fallback usage)
    // FIX: Fetch ALL recent runs (not just those with fallback_used set) so denominator is correct
    const { data: fallbackData, error: fallbackError } = await supabaseClient
      .from('function_status')
      .select('function_name, fallback_used')
      .gte('executed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (fallbackError) {
      console.error('[WATCHDOG] ❌ Error checking fallback usage:', fallbackError)
    } else if (fallbackData) {
      const fallbackCounts: Record<string, { fallback: number; total: number }> = {}
      
      for (const record of fallbackData) {
        if (!fallbackCounts[record.function_name]) {
          fallbackCounts[record.function_name] = { fallback: 0, total: 0 }
        }
        // FIX: Check actual boolean true OR non-empty/non-null string (DB stores as text)
        // Check both strict boolean true AND string 'true' (Supabase may return either)
        const isFallback = record.fallback_used === true || record.fallback_used === 'true' ||
          (typeof record.fallback_used === 'string' && record.fallback_used !== 'null' && record.fallback_used !== '' && record.fallback_used !== 'false');
        if (isFallback) {
          fallbackCounts[record.function_name].fallback++
        }
        fallbackCounts[record.function_name].total++
      }

      for (const [funcName, counts] of Object.entries(fallbackCounts)) {
        if (counts.total === 0) continue
        const fallbackPct = (counts.fallback / counts.total) * 100
        if (fallbackPct > 80) {
          alerts.push({
            severity: 'WARNING',
            function_name: funcName,
            issue: `High fallback usage: ${fallbackPct.toFixed(1)}% (${counts.fallback}/${counts.total} runs)`,
            last_run: null,
            minutes_stale: null,
          })
          console.log(`[WATCHDOG] ⚠️ WARNING: ${funcName} using fallback ${fallbackPct.toFixed(1)}%`)
        }
      }
    }

    // Check for silent failures (0 inserts + 0 skips + no error)
    const { data: silentData, error: silentError } = await supabaseClient
      .from('function_status')
      .select('function_name, executed_at, rows_inserted, rows_skipped, error_message')
      .eq('status', 'success')
      .eq('rows_inserted', 0)
      .eq('rows_skipped', 0)
      .gte('executed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if (silentError) {
      console.error('[WATCHDOG] ❌ Error checking silent failures:', silentError)
    } else if (silentData && silentData.length > 0) {
      for (const silent of silentData) {
        alerts.push({
          severity: 'WARNING',
          function_name: silent.function_name,
          issue: `Silent success: 0 inserts, 0 skips (possible no-op)`,
          last_run: silent.executed_at,
          minutes_stale: null,
        })
        console.log(`[WATCHDOG] ⚠️ WARNING: ${silent.function_name} succeeded with 0 inserts/skips`)
      }
    }

    // Get overall health stats
    const { data: healthData } = await supabaseClient
      .from('view_function_freshness')
      .select('*')

    const healthSummary = {
      total_functions_monitored: healthData?.length || 0,
      alerts_critical: alerts.filter(a => a.severity === 'CRITICAL').length,
      alerts_warning: alerts.filter(a => a.severity === 'WARNING').length,
      alerts_ok: alerts.filter(a => a.severity === 'OK').length,
      overall_health: alerts.filter(a => a.severity === 'CRITICAL').length === 0 ? 'HEALTHY' : 'DEGRADED',
    }

    console.log(`[WATCHDOG] ✅ Health check complete: ${healthSummary.overall_health}`)
    console.log(`[WATCHDOG] 📊 Alerts: ${healthSummary.alerts_critical} critical, ${healthSummary.alerts_warning} warnings`)

    // If there are critical alerts, send Slack notifications
    if (healthSummary.alerts_critical > 0) {
      console.log('[WATCHDOG] 🚨 CRITICAL ALERTS DETECTED - SENDING SLACK NOTIFICATIONS')
      
      // Send alert for each critical issue
      const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL');
      for (const alert of criticalAlerts) {
        if (alert.issue.includes('failures in last 6 hours')) {
          await slackAlerter.sendCriticalAlert({
            type: 'sla_breach',
            etlName: alert.function_name,
            message: alert.issue,
            details: { last_run: alert.last_run }
          }, { suppressDuplicates: true });
        } else if (alert.minutes_stale && alert.minutes_stale > (FUNCTION_INTERVALS[alert.function_name] || 360) * 3) {
          await slackAlerter.sendCriticalAlert({
            type: 'halted',
            etlName: alert.function_name,
            message: `Function stale for ${alert.minutes_stale} minutes`,
            details: { last_run: alert.last_run, expected_interval: FUNCTION_INTERVALS[alert.function_name] }
          }, { suppressDuplicates: true });
        }
      }
    }
    
    // Send alert for high fallback usage
    const fallbackWarnings = alerts.filter(a => a.severity === 'WARNING' && a.issue.includes('fallback'));
    for (const alert of fallbackWarnings) {
      await slackAlerter.sendCriticalAlert({
        type: 'fallback_exceeded',
        etlName: alert.function_name,
        message: alert.issue,
        details: {}
      }, { suppressDuplicates: true });
    }

    const duration = Date.now() - startTime;

    // Log to function_status for monitoring
    await supabaseClient.from('function_status').insert({
      function_name: 'watchdog-ingestion-health',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      metadata: {
        alerts_count: alerts.length,
        critical_alerts: alerts.filter(a => a.severity === 'CRITICAL').length,
        warning_alerts: alerts.filter(a => a.severity === 'WARNING').length,
        health_summary: healthSummary
      }
    });
    
    // Send Slack summary notification every 6 hours (only if there are issues)
    const currentHour = new Date().getHours();
    if ((currentHour === 0 || currentHour === 6 || currentHour === 12 || currentHour === 18) && (healthSummary.alerts_critical > 0 || healthSummary.alerts_warning > 0)) {
      await slackAlerter.sendLiveAlert({
        etlName: 'watchdog-ingestion-health',
        status: healthSummary.overall_health === 'HEALTHY' ? 'success' : 'partial',
        duration: duration,
        sourceUsed: 'Watchdog Monitor',
        metadata: {
          total_functions: healthSummary.total_functions_monitored,
          critical_alerts: healthSummary.alerts_critical,
          warning_alerts: healthSummary.alerts_warning,
          overall_health: healthSummary.overall_health
        }
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        health: healthSummary,
        alerts,
        function_stats: healthData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[WATCHDOG] 💥 Fatal error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
