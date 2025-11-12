import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    console.log('Starting cleanup of orphaned ingest logs...');
    
    // Find logs stuck in "running" status for >2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const { data: orphanedLogs, error: selectError } = await supabase
      .from('ingest_logs')
      .select('id, etl_name, started_at, duration_seconds')
      .eq('status', 'running')
      .lt('started_at', twoHoursAgo);
    
    if (selectError) {
      throw selectError;
    }
    
    if (!orphanedLogs || orphanedLogs.length === 0) {
      console.log('✅ No orphaned logs found');
      return new Response(JSON.stringify({ 
        success: true, 
        cleaned: 0,
        message: 'No orphaned logs found'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log(`Found ${orphanedLogs.length} orphaned logs to clean up`);
    
    // Calculate duration for each orphaned log
    const updates = orphanedLogs.map(log => {
      const startTime = new Date(log.started_at).getTime();
      const now = Date.now();
      const durationSeconds = Math.round((now - startTime) / 1000);
      
      return {
        id: log.id,
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        error_message: `Process orphaned after 2+ hours - marked as failed by cleanup job`,
        metadata: {
          cleanup_timestamp: new Date().toISOString(),
          original_started_at: log.started_at,
          cleanup_reason: 'stuck_in_running_status'
        }
      };
    });
    
    // Update all orphaned logs to "failed" status
    for (const update of updates) {
      const { error } = await supabase
        .from('ingest_logs')
        .update({
          status: update.status,
          completed_at: update.completed_at,
          duration_seconds: update.duration_seconds,
          error_message: update.error_message,
          metadata: update.metadata
        })
        .eq('id', update.id);
      
      if (error) {
        console.error(`Failed to update log ${update.id}:`, error);
      }
    }
    
    // Send Slack notification if significant cleanup performed
    if (orphanedLogs.length >= 5) {
      const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
      if (slackWebhook) {
        const etlSummary = orphanedLogs.reduce((acc: Record<string, number>, log) => {
          acc[log.etl_name] = (acc[log.etl_name] || 0) + 1;
          return acc;
        }, {});
        
        const summaryText = Object.entries(etlSummary)
          .map(([etl, count]) => `• ${etl}: ${count} orphaned logs`)
          .join('\n');
        
        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🧹 *Log Cleanup Alert*\n\nCleaned up ${orphanedLogs.length} orphaned ingest logs (stuck >2h):\n\n${summaryText}\n\n*Recommendation:* Review functions for missing completion handlers.`
          })
        });
      }
    }
    
    console.log(`✅ Cleaned up ${orphanedLogs.length} orphaned logs`);
    
    return new Response(JSON.stringify({ 
      success: true, 
      cleaned: orphanedLogs.length,
      affected_functions: [...new Set(orphanedLogs.map(l => l.etl_name))],
      message: `Marked ${orphanedLogs.length} orphaned logs as failed`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in cleanup-orphaned-logs:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
