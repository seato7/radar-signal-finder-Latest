/**
 * Shared Ingest Logging Utility
 * 
 * Ensures all ingest functions log consistently to ingest_logs table
 * with all required fields for SLA monitoring.
 */

export interface IngestLogData {
  etl_name: string;
  status: 'running' | 'success' | 'failure' | 'error';
  ticker?: string;
  source_used?: string;
  cache_hit?: boolean;
  fallback_count?: number;
  latency_ms?: number;
  verified_source?: string;
  rows_inserted?: number;
  rows_updated?: number;
  rows_skipped?: number;
  duration_seconds?: number;
  error_message?: string;
  metadata?: Record<string, any>;
}

export class IngestLogger {
  private supabaseClient: any;
  private logId: string;
  private startTime: number;
  private etlName: string;

  constructor(supabaseClient: any, etlName: string) {
    this.supabaseClient = supabaseClient;
    this.logId = crypto.randomUUID();
    this.startTime = Date.now();
    this.etlName = etlName;
  }

  /**
   * Start logging (insert initial "running" entry)
   */
  async start() {
    await this.supabaseClient.from('ingest_logs').insert({
      id: this.logId,
      etl_name: this.etlName,
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  /**
   * Complete logging with success status
   */
  async success(data: Omit<IngestLogData, 'etl_name' | 'status'> = {}) {
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    
    await this.supabaseClient.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
      source_used: data.source_used || 'unknown',
      cache_hit: data.cache_hit !== undefined ? data.cache_hit : null,
      fallback_count: data.fallback_count || 0,
      latency_ms: data.latency_ms || null,
      verified_source: data.verified_source || null,
      rows_inserted: data.rows_inserted || 0,
      rows_updated: data.rows_updated || 0,
      rows_skipped: data.rows_skipped || 0,
      metadata: data.metadata || null,
    }).eq('id', this.logId);
  }

  /**
   * Complete logging with failure status
   */
  async failure(error: Error | string, data: Omit<IngestLogData, 'etl_name' | 'status' | 'error_message'> = {}) {
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    await this.supabaseClient.from('ingest_logs').update({
      status: 'failure',
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
      error_message: errorMessage,
      source_used: data.source_used || 'unknown',
      cache_hit: data.cache_hit !== undefined ? data.cache_hit : null,
      fallback_count: data.fallback_count || 0,
      latency_ms: data.latency_ms || null,
      verified_source: data.verified_source || null,
      rows_inserted: data.rows_inserted || 0,
      rows_updated: data.rows_updated || 0,
      rows_skipped: data.rows_skipped || 0,
      metadata: data.metadata || null,
    }).eq('id', this.logId);
  }

  /**
   * Log a single fetch operation (for per-ticker logging)
   */
  static async logFetch(
    supabaseClient: any,
    etlName: string,
    ticker: string,
    data: {
      source_used: string;
      cache_hit: boolean;
      fallback_used: boolean;
      latency_ms: number;
      verified_source?: string;
    }
  ) {
    await supabaseClient.from('ingest_logs').insert({
      id: crypto.randomUUID(),
      etl_name: etlName,
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      source_used: data.source_used,
      cache_hit: data.cache_hit,
      fallback_count: data.fallback_used ? 1 : 0,
      latency_ms: data.latency_ms,
      verified_source: data.verified_source || null,
      duration_seconds: Math.floor(data.latency_ms / 1000),
      metadata: { ticker },
    });
  }
}
