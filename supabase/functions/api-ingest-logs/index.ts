// redeployed 2026-03-17
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const etlName = url.searchParams.get('etl_name');
    const status = url.searchParams.get('status');

    let query = supabaseClient
      .from('ingest_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (etlName) {
      query = query.eq('etl_name', etlName);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: logs, error } = await query;

    if (error) throw error;

    // Calculate summary stats
    const summary = {
      total_runs: logs.length,
      successful: logs.filter(l => l.status === 'success').length,
      failed: logs.filter(l => l.status === 'failure').length,
      running: logs.filter(l => l.status === 'running').length,
      avg_duration: logs.length > 0
        ? logs.filter(l => l.duration_seconds).reduce((acc, l) => acc + (l.duration_seconds || 0), 0) / logs.length
        : 0,
      total_rows_inserted: logs
        .reduce((acc, l) => acc + (l.rows_inserted || 0), 0),
    };

    // Group by ETL name
    const byEtl: Record<string, any> = {};
    logs.forEach(log => {
      if (!byEtl[log.etl_name]) {
        byEtl[log.etl_name] = {
          etl_name: log.etl_name,
          total_runs: 0,
          successful: 0,
          failed: 0,
          last_run: null,
          last_success: null,
          last_failure: null,
          avg_duration: 0,
          total_rows: 0
        };
      }
      
      const etl = byEtl[log.etl_name];
      etl.total_runs++;
      if (log.status === 'success') etl.successful++;
      if (log.status === 'failure') etl.failed++;
      if (!etl.last_run || log.started_at > etl.last_run) {
        etl.last_run = log.started_at;
      }
      if (log.status === 'success' && (!etl.last_success || log.started_at > etl.last_success)) {
        etl.last_success = log.started_at;
      }
      if (log.status === 'failure' && (!etl.last_failure || log.started_at > etl.last_failure)) {
        etl.last_failure = log.started_at;
      }
      etl.total_rows += (log.rows_inserted || 0);
    });

    // Calculate avg durations
    Object.keys(byEtl).forEach(key => {
      const etlLogs = logs.filter(l => l.etl_name === key && l.duration_seconds);
      byEtl[key].avg_duration = etlLogs.length > 0
        ? etlLogs.reduce((acc, l) => acc + (l.duration_seconds || 0), 0) / etlLogs.length
        : 0;
    });

    return new Response(JSON.stringify({
      summary,
      by_etl: Object.values(byEtl),
      recent_logs: logs.slice(0, 20),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching logs:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
