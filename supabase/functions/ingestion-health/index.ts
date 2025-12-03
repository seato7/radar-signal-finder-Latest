import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { CircuitBreaker } from "../_shared/circuit-breaker.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @guard: Expected function intervals for freshness monitoring
// NOTE: ingest-prices-yahoo REMOVED - price ingestion handled by Railway backend (Twelve Data)
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
  'ingest-13f-holdings': 360,
  'ingest-google-trends': 360,
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
  freshness_minutes?: number;
  expected_interval_minutes: number;
  total_runs_24h: number;
  rows_inserted_24h: number;
  fallback_usage_24h: number;
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

    // @guard: Query function_status for enhanced monitoring
    const { data: functionStats, error: statsError } = await supabaseClient
      .from('function_status')
      .select('*')
      .gte('executed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('executed_at', { ascending: false });

    if (statsError) {
      console.warn('[INGESTION-HEALTH] ⚠️ Error querying function_status:', statsError);
    }

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

    // Group function_status by function name
    const statsByFunction = new Map<string, typeof functionStats>();
    for (const stat of (functionStats || [])) {
      if (!statsByFunction.has(stat.function_name)) {
        statsByFunction.set(stat.function_name, []);
      }
      statsByFunction.get(stat.function_name)!.push(stat);
    }

    // Get all tracked function names
    const allFunctionNames = Object.keys(FUNCTION_INTERVALS);
    
    // Build health status for each function
    const healthStatuses: IngestionHealthStatus[] = [];
    const now = new Date();

    for (const fname of allFunctionNames) {
      // Filter by specific function if requested
      if (functionName && fname !== functionName) continue;

      const functionLogs = recentLogs?.filter(log => log.etl_name === fname) || [];
      const functionStatsData = statsByFunction.get(fname) || [];
      
      // Use function_status for metrics if available, fallback to ingest_logs
      const dataSource = functionStatsData.length > 0 ? functionStatsData : functionLogs;
      
      const successData = dataSource.filter((d: any) => d.status === 'success');
      const failedData = dataSource.filter((d: any) => d.status === 'failed' || d.status === 'failure');
      
      const mostRecent = dataSource[0];
      const lastSuccess = successData[0];
      const lastFailure = failedData[0];

      // Calculate freshness
      const lastRunTime = mostRecent ? new Date((mostRecent as any).executed_at || (mostRecent as any).started_at) : null;
      const freshness_minutes = lastRunTime 
        ? Math.round((now.getTime() - lastRunTime.getTime()) / 60000)
        : null;

      // Calculate avg duration from function_status (more accurate)
      const durations = functionStatsData
        .filter((s: any) => s.duration_ms)
        .map((s: any) => s.duration_ms);
      const avgDuration = durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : undefined;

      // Calculate success rate
      const successRate = dataSource.length > 0
        ? (successData.length / dataSource.length) * 100
        : undefined;

      // Calculate additional metrics from function_status
      const rows_inserted_24h = functionStatsData.reduce((sum: number, s: any) => sum + (s.rows_inserted || 0), 0);
      const fallback_usage_24h = functionStatsData.filter((s: any) => s.fallback_used).length;

      // Get circuit breaker status
      const circuit = circuitMap.get(fname);
      const expectedInterval = FUNCTION_INTERVALS[fname];

      // @guard: Enhanced status determination with freshness checks
      let status: IngestionHealthStatus['status'] = 'unknown';
      if (circuit?.is_open) {
        status = 'disabled';
      } else if (!lastRunTime) {
        status = 'disabled';
      } else if (freshness_minutes && freshness_minutes > expectedInterval * 3) {
        status = 'failing'; // Stale (>3x expected)
      } else if (successRate !== undefined && successRate < 50) {
        status = 'failing'; // Low success rate
      } else if (freshness_minutes && freshness_minutes > expectedInterval * 2) {
        status = 'degraded'; // Somewhat stale (>2x expected)
      } else if (successRate !== undefined && successRate < 90) {
        status = 'degraded'; // Moderate success rate
      } else if (successRate !== undefined && successRate >= 90) {
        status = 'healthy';
      }

      const healthStatus: IngestionHealthStatus = {
        function_name: fname,
        last_run_at: mostRecent ? ((mostRecent as any).executed_at || (mostRecent as any).started_at) : undefined,
        last_success_at: lastSuccess ? ((lastSuccess as any).executed_at || (lastSuccess as any).started_at) : undefined,
        last_error: lastFailure ? ((lastFailure as any).error_message) : undefined,
        avg_duration_24h: avgDuration ? Math.round(avgDuration) : undefined,
        success_rate_24h: successRate ? Math.round(successRate * 10) / 10 : undefined,
        is_circuit_open: circuit?.is_open || false,
        circuit_reason: circuit?.reason || undefined,
        primary_api: (mostRecent as any)?.source_used,
        status,
        freshness_minutes: freshness_minutes ?? undefined,
        expected_interval_minutes: expectedInterval,
        total_runs_24h: dataSource.length,
        rows_inserted_24h,
        fallback_usage_24h,
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
