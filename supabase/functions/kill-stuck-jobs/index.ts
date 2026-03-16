import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Kill Stuck Jobs Edge Function with Auto-Recovery
 * Automatically terminates ingestion jobs stuck for >8 minutes
 * and attempts to retry them up to 3 times before escalating
 * 
 * @guard: Production failsafe - kills stuck jobs, tracks failures, auto-retries
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const slackAlerter = new SlackAlerter();
    const STUCK_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes - allows distributed batch processing
    const stuckTimestamp = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

    console.log(`🔍 Searching for jobs stuck since before ${stuckTimestamp}`);

    // Find stuck jobs (running for >8 minutes)
    const { data: stuckJobs, error: selectError } = await supabaseClient
      .from('ingest_logs')
      .select('*')
      .eq('status', 'running')
      .lt('started_at', stuckTimestamp);

    if (selectError) {
      throw new Error(`Failed to query stuck jobs: ${selectError.message}`);
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log('✅ No stuck jobs found (20-minute threshold)');
      return new Response(
        JSON.stringify({
          success: true,
          killed: 0,
          retried: 0,
          message: 'No stuck jobs found (20-minute threshold)',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`⚠️ Found ${stuckJobs.length} stuck jobs`);

    // Check failure history for auto-recovery
    const functionFailureCounts = new Map<string, number>();
    
    // Query failures in last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recentFailures } = await supabaseClient
      .from('ingest_logs')
      .select('etl_name')
      .eq('status', 'failure')
      .gte('started_at', sixHoursAgo);

    if (recentFailures) {
      for (const failure of recentFailures) {
        const count = functionFailureCounts.get(failure.etl_name) || 0;
        functionFailureCounts.set(failure.etl_name, count + 1);
      }
    }

    // Kill each stuck job and determine retry strategy
    let killed = 0;
    let retried = 0;
    const retriedJobs = [];
    
    for (const job of stuckJobs) {
      const duration = Math.floor(
        (Date.now() - new Date(job.started_at).getTime()) / 1000
      );

      console.log(
        `🔪 Killing stuck job: ${job.etl_name} (running for ${Math.floor(duration / 60)} minutes)`
      );

      // Mark as failed
      const { error: updateError } = await supabaseClient
        .from('ingest_logs')
        .update({
          status: 'failure',
          completed_at: new Date().toISOString(),
          duration_seconds: duration,
          error_message: `Job killed after ${Math.floor(duration / 60)} minutes (stuck threshold: 20 minutes)`,
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`Failed to kill job ${job.id}:`, updateError);
        continue;
      }

      killed++;

      // @guard: Auto-recovery logic - retry if <3 failures in 6h
      const failureCount = functionFailureCounts.get(job.etl_name) || 0;
      const shouldRetry = failureCount < 3;

      if (shouldRetry) {
        console.log(`🔄 Auto-recovery: Retrying ${job.etl_name} (${failureCount}/3 failures)`);
        
        // Attempt to invoke the function again
        try {
          // SUPABASE_URL points to the DB (postgres), not edge functions. Construct the correct functions URL.
          const supabaseRef = (Deno.env.get('SUPABASE_URL') ?? '').replace('https://', '').replace('.supabase.co', '');
          const functionUrl = `https://${supabaseRef}.supabase.co/functions/v1/${job.etl_name}`;
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          });

          if (response.ok) {
            console.log(`✅ Successfully retried ${job.etl_name}`);
            retried++;
            retriedJobs.push(job.etl_name);
          } else {
            console.error(`❌ Retry failed for ${job.etl_name}: ${response.status}`);
          }
        } catch (retryError) {
          console.error(`❌ Retry error for ${job.etl_name}:`, retryError);
        }
      } else {
        // Escalate - too many failures
        console.log(`🚨 ESCALATION: ${job.etl_name} has ${failureCount} failures in 6h - not retrying`);
        
        await slackAlerter.sendCriticalAlert({
          type: 'sla_breach',
          etlName: job.etl_name,
          message: `Function failing repeatedly: ${failureCount} failures in 6h. Manual intervention required.`,
          details: {
            job_id: job.id,
            started_at: job.started_at,
            duration_minutes: Math.floor(duration / 60),
            recent_failures: failureCount,
          },
        });
      }

      // Send Slack alert for stuck job
      await slackAlerter.sendCriticalAlert({
        type: 'halted',
        etlName: job.etl_name,
        message: `Stuck job killed after ${Math.floor(duration / 60)} minutes${shouldRetry ? ' - auto-retry attempted' : ' - escalated'}`,
        details: {
          job_id: job.id,
          started_at: job.started_at,
          duration_minutes: Math.floor(duration / 60),
          auto_retry: shouldRetry,
          failure_count_6h: failureCount,
        },
      });
    }

    console.log(`✅ Killed ${killed} stuck jobs, retried ${retried}`);

    const duration = Date.now() - startTime;

    // Log to function_status for monitoring
    await supabaseClient.from('function_status').insert({
      function_name: 'kill-stuck-jobs',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      metadata: {
        killed_count: killed,
        retried_count: retried
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        killed,
        retried,
        retried_jobs: retriedJobs,
        jobs: stuckJobs.map((j) => ({
          etl_name: j.etl_name,
          started_at: j.started_at,
          duration_minutes: Math.floor(
            (Date.now() - new Date(j.started_at).getTime()) / (60 * 1000)
          ),
        })),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in kill-stuck-jobs:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
