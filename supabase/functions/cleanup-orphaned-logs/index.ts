import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  try {
    console.log('Starting cleanup of orphaned ingest logs...');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: orphanedLogs, error: selectError } = await supabase.from('ingest_logs').select('id, etl_name, started_at, duration_seconds').eq('status', 'running').lt('started_at', twoHoursAgo);
    if (selectError) throw selectError;

    if (!orphanedLogs || orphanedLogs.length === 0) {
      console.log('✅ No orphaned logs found');
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, { function_name: 'cleanup-orphaned-logs', status: 'success', rows_inserted: 0, duration_ms: duration, source_used: 'ingest_logs' });
      await slackAlerter.sendLiveAlert({ etlName: 'cleanup-orphaned-logs', status: 'success', duration, latencyMs: duration, rowsInserted: 0 });
      return new Response(JSON.stringify({ success: true, cleaned: 0, message: 'No orphaned logs found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Found ${orphanedLogs.length} orphaned logs to clean up`);
    for (const log of orphanedLogs) {
      const durationSeconds = Math.round((Date.now() - new Date(log.started_at).getTime()) / 1000);
      await supabase.from('ingest_logs').update({ status: 'failure', completed_at: new Date().toISOString(), duration_seconds: durationSeconds, error_message: 'Process orphaned after 2+ hours - marked as failure by cleanup job', metadata: { cleanup_timestamp: new Date().toISOString(), original_started_at: log.started_at, cleanup_reason: 'stuck_in_running_status' } }).eq('id', log.id);
    }

    if (orphanedLogs.length >= 5) {
      const etlSummary = orphanedLogs.reduce((acc: Record<string, number>, log) => { acc[log.etl_name] = (acc[log.etl_name] || 0) + 1; return acc; }, {});
      const summaryText = Object.entries(etlSummary).map(([etl, count]) => `• ${etl}: ${count} orphaned logs`).join('\n');
      await slackAlerter.sendCriticalAlert({ type: 'orphaned_logs', etlName: 'cleanup-orphaned-logs', message: `Cleaned up ${orphanedLogs.length} orphaned ingest logs (stuck >2h):\n${summaryText}` });
    }

    const duration = Date.now() - startTime;
    await logHeartbeat(supabase, { function_name: 'cleanup-orphaned-logs', status: 'success', rows_inserted: orphanedLogs.length, duration_ms: duration, source_used: 'ingest_logs' });
    await slackAlerter.sendLiveAlert({ etlName: 'cleanup-orphaned-logs', status: 'success', duration, latencyMs: duration, rowsInserted: orphanedLogs.length });
    console.log(`✅ Cleaned up ${orphanedLogs.length} orphaned logs`);

    return new Response(JSON.stringify({ success: true, cleaned: orphanedLogs.length, affected_functions: [...new Set(orphanedLogs.map(l => l.etl_name))], message: `Marked ${orphanedLogs.length} orphaned logs as failure` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error in cleanup-orphaned-logs:', error);
    const duration = Date.now() - startTime;
    await logHeartbeat(supabase, { function_name: 'cleanup-orphaned-logs', status: 'failure', duration_ms: duration, error_message: error instanceof Error ? error.message : 'Unknown error' });
    await slackAlerter.sendCriticalAlert({ type: 'halted', etlName: 'cleanup-orphaned-logs', message: error instanceof Error ? error.message : 'Unknown error' });
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
