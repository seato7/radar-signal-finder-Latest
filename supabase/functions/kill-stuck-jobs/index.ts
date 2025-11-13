import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Kill Stuck Jobs Edge Function
 * Automatically terminates ingestion jobs stuck for >8 minutes
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const slackAlerter = new SlackAlerter();
    const STUCK_THRESHOLD_MS = 8 * 60 * 1000; // 8 minutes
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
      console.log('✅ No stuck jobs found');
      return new Response(
        JSON.stringify({
          success: true,
          killed: 0,
          message: 'No stuck jobs found',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`⚠️ Found ${stuckJobs.length} stuck jobs`);

    // Kill each stuck job
    let killed = 0;
    for (const job of stuckJobs) {
      const duration = Math.floor(
        (Date.now() - new Date(job.started_at).getTime()) / 1000
      );

      console.log(
        `🔪 Killing stuck job: ${job.etl_name} (running for ${Math.floor(duration / 60)} minutes)`
      );

      const { error: updateError } = await supabaseClient
        .from('ingest_logs')
        .update({
          status: 'failure',
          completed_at: new Date().toISOString(),
          duration_seconds: duration,
          error_message: `Job killed after ${Math.floor(duration / 60)} minutes (stuck threshold: 8 minutes)`,
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`Failed to kill job ${job.id}:`, updateError);
        continue;
      }

      killed++;

      // Send Slack alert
      await slackAlerter.sendCriticalAlert({
        type: 'halted',
        etlName: job.etl_name,
        message: `Stuck job killed after ${Math.floor(duration / 60)} minutes`,
        details: {
          job_id: job.id,
          started_at: job.started_at,
          duration_minutes: Math.floor(duration / 60),
        },
      });
    }

    console.log(`✅ Killed ${killed} stuck jobs`);

    return new Response(
      JSON.stringify({
        success: true,
        killed,
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
