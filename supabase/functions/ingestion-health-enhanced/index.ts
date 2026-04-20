import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { CircuitBreaker } from "../_shared/circuit-breaker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IngestionHealthStatus {
  function_name: string;
  last_run: string | null;
  last_success: string | null;
  last_error: string | null;
  error_message: string | null;
  avg_duration_seconds: number;
  success_rate: number;
  total_runs_24h: number;
  failures_24h: number;
  circuit_breaker_open: boolean;
  circuit_breaker_reason: string | null;
  status: 'healthy' | 'degraded' | 'failing' | 'disabled' | 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const failedOnly = url.searchParams.get('failedOnly') === 'true';
    const functionName = url.searchParams.get('function');

    const circuitBreaker = new CircuitBreaker(supabaseClient);

    // Get all logs from last 24 hours
    const { data: logs } = await supabaseClient
      .from('ingest_logs')
      .select('*')
      .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('started_at', { ascending: false });

    if (!logs) {
      throw new Error('Failed to fetch logs');
    }

    // Get circuit breaker statuses
    const circuitBreakerStatuses = await circuitBreaker.getAllStatus();
    const cbStatusMap = new Map(
      circuitBreakerStatuses.map((s) => [s.function_name, s])
    );

    // Get unique function names
    const functionNames = Array.from(new Set(logs.map((log) => log.etl_name)));

    const healthStatuses: IngestionHealthStatus[] = [];

    for (const fname of functionNames) {
      if (functionName && fname !== functionName) continue;

      const functionLogs = logs.filter((log) => log.etl_name === fname);
      const lastRun = functionLogs[0];
      const lastSuccess = functionLogs.find((log) => log.status === 'success');
      const lastError = functionLogs.find((log) => log.status === 'failure');

      const successCount = functionLogs.filter((log) => log.status === 'success').length;
      const failureCount = functionLogs.filter((log) => log.status === 'failure').length;
      const totalRuns = functionLogs.length;
      const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;

      const avgDuration =
        functionLogs.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) /
        (functionLogs.length || 1);

      const cbStatus = cbStatusMap.get(fname);
      const circuitOpen = cbStatus?.is_open || false;

      // Determine overall status
      let status: 'healthy' | 'degraded' | 'failing' | 'disabled' | 'unknown' = 'unknown';
      
      if (circuitOpen) {
        status = 'disabled';
      } else if (totalRuns === 0) {
        status = 'unknown';
      } else if (successRate === 0 && failureCount > 0) {
        status = 'failing';
      } else if (successRate < 50) {
        status = 'failing';
      } else if (successRate < 90) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      healthStatuses.push({
        function_name: fname,
        last_run: lastRun?.started_at || null,
        last_success: lastSuccess?.started_at || null,
        last_error: lastError?.started_at || null,
        error_message: lastError?.error_message || null,
        avg_duration_seconds: Math.round(avgDuration * 100) / 100,
        success_rate: Math.round(successRate * 100) / 100,
        total_runs_24h: totalRuns,
        failures_24h: failureCount,
        circuit_breaker_open: circuitOpen,
        circuit_breaker_reason: cbStatus?.reason || null,
        status,
      });
    }

    // Filter if failedOnly
    const filteredStatuses = failedOnly
      ? healthStatuses.filter(
          (s) => s.status === 'failing' || s.status === 'degraded' || s.status === 'disabled'
        )
      : healthStatuses;

    // Sort by status priority (failing > degraded > disabled > unknown > healthy)
    const statusPriority = { failing: 0, degraded: 1, disabled: 2, unknown: 3, healthy: 4 };
    filteredStatuses.sort(
      (a, b) =>
        statusPriority[a.status] - statusPriority[b.status] ||
        a.function_name.localeCompare(b.function_name)
    );

    // Calculate summary
    const summary = {
      total: healthStatuses.length,
      healthy: healthStatuses.filter((s) => s.status === 'healthy').length,
      degraded: healthStatuses.filter((s) => s.status === 'degraded').length,
      failing: healthStatuses.filter((s) => s.status === 'failing').length,
      disabled: healthStatuses.filter((s) => s.status === 'disabled').length,
      unknown: healthStatuses.filter((s) => s.status === 'unknown').length,
    };

    return new Response(
      JSON.stringify({
        status: 'success',
        functions: filteredStatuses,
        summary,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in ingestion-health-enhanced:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
