import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { CircuitBreaker } from "../_shared/circuit-breaker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngestionHealthStatus {
  function_name: string;
  last_run_at?: string;
  last_success_at?: string;
  last_error?: string;
  avg_duration_24h?: number;
  success_rate_24h?: number;
  is_circuit_open: boolean;
  circuit_reason?: string;
  primary_api?: string;
  status: 'healthy' | 'degraded' | 'failing' | 'disabled' | 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const url = new URL(req.url);
    const failedOnly = url.searchParams.get('failedOnly') === 'true';
    const functionName = url.searchParams.get('function');

    // Initialize circuit breaker
    const circuitBreaker = new CircuitBreaker(supabaseClient);

    // Get all ingestion functions from ingest_logs
    const { data: recentLogs, error: logsError } = await supabaseClient
      .from('ingest_logs')
      .select('*')
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('started_at', { ascending: false });

    if (logsError) throw logsError;

    // Get circuit breaker statuses
    const circuitStatuses = await circuitBreaker.getAllStatus();
    const circuitMap = new Map(circuitStatuses.map(s => [s.function_name, s]));

    // Get unique function names
    const functionNames = [...new Set(recentLogs?.map(log => log.etl_name) || [])];

    // Build health status for each function
    const healthStatuses: IngestionHealthStatus[] = [];

    for (const fname of functionNames) {
      // Filter by specific function if requested
      if (functionName && fname !== functionName) continue;

      const functionLogs = recentLogs?.filter(log => log.etl_name === fname) || [];
      const successLogs = functionLogs.filter(log => log.status === 'success');
      const failedLogs = functionLogs.filter(log => log.status === 'failed');
      
      const mostRecent = functionLogs[0];
      const lastSuccess = successLogs[0];
      const lastFailure = failedLogs[0];

      // Calculate avg duration
      const completedLogs = functionLogs.filter(log => log.completed_at && log.started_at);
      const durations = completedLogs.map(log => 
        new Date(log.completed_at!).getTime() - new Date(log.started_at).getTime()
      );
      const avgDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : undefined;

      // Calculate success rate
      const successRate = functionLogs.length > 0
        ? (successLogs.length / functionLogs.length) * 100
        : undefined;

      // Get circuit breaker status
      const circuit = circuitMap.get(fname);

      // Determine overall status
      let status: IngestionHealthStatus['status'] = 'unknown';
      if (circuit?.is_open) {
        status = 'disabled';
      } else if (successRate !== undefined) {
        if (successRate >= 95) status = 'healthy';
        else if (successRate >= 70) status = 'degraded';
        else status = 'failing';
      }

      const healthStatus: IngestionHealthStatus = {
        function_name: fname,
        last_run_at: mostRecent?.started_at,
        last_success_at: lastSuccess?.started_at,
        last_error: lastFailure?.error_message,
        avg_duration_24h: avgDuration ? Math.round(avgDuration) : undefined,
        success_rate_24h: successRate ? Math.round(successRate * 10) / 10 : undefined,
        is_circuit_open: circuit?.is_open || false,
        circuit_reason: circuit?.reason || undefined,
        primary_api: mostRecent?.source_used,
        status
      };

      // Filter by failed only if requested
      if (failedOnly && status === 'healthy') continue;

      healthStatuses.push(healthStatus);
    }

    // Sort by status (failing first) then by name
    healthStatuses.sort((a, b) => {
      const statusOrder = { failing: 0, disabled: 1, degraded: 2, healthy: 3, unknown: 4 };
      const aOrder = statusOrder[a.status];
      const bOrder = statusOrder[b.status];
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.function_name.localeCompare(b.function_name);
    });

    // Calculate summary stats
    const summary = {
      total_functions: healthStatuses.length,
      healthy: healthStatuses.filter(s => s.status === 'healthy').length,
      degraded: healthStatuses.filter(s => s.status === 'degraded').length,
      failing: healthStatuses.filter(s => s.status === 'failing').length,
      disabled: healthStatuses.filter(s => s.status === 'disabled').length,
      unknown: healthStatuses.filter(s => s.status === 'unknown').length,
      overall_health: healthStatuses.length > 0
        ? Math.round((healthStatuses.filter(s => s.status === 'healthy').length / healthStatuses.length) * 100)
        : 0
    };

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        functions: healthStatuses,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Ingestion health error:', error);
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
