/**
 * Standardized Heartbeat Logger for Function Status Monitoring
 * 
 * Use this for functions that don't use IngestLogger but still need
 * to report their status for watchdog monitoring.
 * 
 * @guard: All ingestion functions MUST report heartbeat for production monitoring
 */

export interface HeartbeatData {
  function_name: string;
  status: 'success' | 'failure';
  rows_inserted?: number;
  rows_skipped?: number;
  fallback_used?: string | null;
  duration_ms: number;
  source_used?: string;
  error_message?: string | null;
  metadata?: Record<string, any>;
}

export async function logHeartbeat(
  supabaseClient: any,
  data: HeartbeatData
) {
  await supabaseClient.from('function_status').insert({
    function_name: data.function_name,
    executed_at: new Date().toISOString(),
    status: data.status,
    rows_inserted: data.rows_inserted || 0,
    rows_skipped: data.rows_skipped || 0,
    fallback_used: data.fallback_used || null,
    duration_ms: data.duration_ms,
    source_used: data.source_used || 'unknown',
    error_message: data.error_message || null,
    metadata: data.metadata || {}
  });
}
