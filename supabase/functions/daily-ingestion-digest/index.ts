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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    console.log('📊 Generating daily ingestion digest...');
    
    const slackAlerter = new SlackAlerter();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get all ingestion runs from last 24 hours
    const { data: logs, error: logsError } = await supabase
      .from('ingest_logs')
      .select('*')
      .gte('started_at', yesterday.toISOString())
      .order('started_at', { ascending: false });

    if (logsError) throw logsError;

    const totalRuns = logs?.length || 0;
    const succeeded = logs?.filter(l => l.status === 'success' && (l.fallback_count || 0) === 0).length || 0;
    const partial = logs?.filter(l => l.status === 'success' && (l.fallback_count || 0) > 0).length || 0;
    const failed = logs?.filter(l => l.status === 'failed').length || 0;
    const halted = logs?.filter(l => l.status === 'halted').length || 0;

    // Get top 3 errors
    const { data: failures, error: failuresError } = await supabase
      .from('ingest_failures')
      .select('*')
      .gte('failed_at', yesterday.toISOString())
      .order('failed_at', { ascending: false });

    if (failuresError) throw failuresError;

    const errorGroups = new Map<string, { etl_name: string; error_type: string; count: number; example: string }>();
    
    failures?.forEach(f => {
      const key = `${f.etl_name}:${f.error_type}`;
      if (errorGroups.has(key)) {
        const group = errorGroups.get(key)!;
        group.count++;
      } else {
        errorGroups.set(key, {
          etl_name: f.etl_name,
          error_type: f.error_type,
          count: 1,
          example: f.error_message || 'No message'
        });
      }
    });

    const topErrors = Array.from(errorGroups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Get duplicate key errors from view
    const { data: dupKeyErrors } = await supabase
      .from('view_duplicate_key_errors')
      .select('*')
      .gte('first_seen', yesterday.toISOString())
      .order('error_count', { ascending: false })
      .limit(5);

    const duplicateKeyErrors = dupKeyErrors?.map(e => ({
      etl_name: e.etl_name || 'unknown',
      count: e.error_count || 0
    })) || [];

    // Get halted functions
    const haltedFunctions = logs
      ?.filter(l => l.status === 'halted')
      .map(l => l.etl_name)
      .filter((v, i, a) => a.indexOf(v) === i) || [];

    // Get stale tickers (>10 seconds old)
    const { data: staleTickers } = await supabase
      .rpc('get_stale_tickers')
      .gte('seconds_stale', 10)
      .limit(5);

    const staleTickersList = staleTickers?.map((t: any) => ({
      ticker: t.ticker,
      hours_stale: (t.seconds_stale || 0) / 3600
    })) || [];

    // Send daily digest
    await slackAlerter.sendDailyDigest({
      totalRuns,
      succeeded,
      partial,
      failed,
      halted,
      topErrors,
      duplicateKeyErrors,
      haltedFunctions,
      staleTickers: staleTickersList
    });

    console.log('✅ Daily digest sent successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        summary: { totalRuns, succeeded, partial, failed, halted },
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating daily digest:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
