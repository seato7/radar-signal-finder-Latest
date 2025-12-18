/**
 * Streamlined Slack alerting system for ingestion pipeline monitoring
 * Focused on clear cron completion notifications for all 31 functions
 */

// 19 functions that process ALL 8201 assets
const FULL_SCOPE_FUNCTIONS = [
  'ingest-google-trends',
  'ingest-news-sentiment', 
  'ingest-options-flow',
  'ingest-dark-pool',
  'ingest-finra-darkpool',
  'ingest-pattern-recognition',
  'ingest-advanced-technicals',
  'ingest-job-postings',
  'ingest-reddit-sentiment',
  'ingest-short-interest',
  'ingest-smart-money',
  'ingest-stocktwits',
  'ingest-supply-chain',
  'ingest-forex-technicals',
  'ingest-forex-sentiment',
  'ingest-crypto-onchain',
  'ingest-cot-reports',
  'ingest-etf-flows',
  'ingest-search-trends'
];

// 12 event-based/feed-based functions
const EVENT_BASED_FUNCTIONS = [
  'ingest-13f-holdings',
  'ingest-form4',
  'ingest-breaking-news',
  'ingest-ai-research',
  'ingest-congressional-trades',
  'ingest-policy-feeds',
  'ingest-economic-calendar',
  'ingest-fred-economics',
  'ingest-cot-cftc',
  'ingest-prices-csv',
  'ingest-prices-twelvedata',
  'ingest-earnings'
];

interface CronCompletionAlert {
  functionName: string;
  status: 'success' | 'partial' | 'failed';
  assetsProcessed?: number;
  totalAssets?: number;
  rowsInserted: number;
  rowsSkipped: number;
  durationMs: number;
  sourceUsed?: string;
  errorMessage?: string;
}

interface SlackAlert {
  etlName: string;
  status: 'started' | 'success' | 'partial' | 'failed' | 'halted';
  duration?: number;
  latencyMs?: number;
  sourceUsed?: string;
  fallbackRatio?: number;
  ticker?: string;
  errorMessage?: string;
  rowsInserted?: number;
  rowsSkipped?: number;
  metadata?: Record<string, any>;
}

interface CriticalAlert {
  type: 'fallback_exceeded' | 'auth_error' | 'orphaned_logs' | 'duplicate_keys' | 'sla_breach' | 'halted' | 'missing_source' | 'empty_table' | 'api_reliability' | 'no_data_found';
  etlName?: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Send a "no data found" alert when a function runs but extracts zero records
 * This is important because these functions should NOT estimate data
 */
export async function sendNoDataFoundAlert(
  alerter: SlackAlerter,
  functionName: string,
  details: { sourcesAttempted: string[]; contentSizes?: number[]; reason?: string }
): Promise<void> {
  await alerter.sendCriticalAlert({
    type: 'no_data_found',
    etlName: functionName,
    message: `Function completed but extracted 0 records. This may indicate: (1) scraping issues, (2) page structure changed, or (3) data genuinely unavailable. NO ESTIMATION was used.`,
    details: {
      sources: details.sourcesAttempted.join(', '),
      contentSizes: details.contentSizes?.join(', ') || 'unknown',
      reason: details.reason || 'No extractable data in scraped content'
    }
  });
}

export class SlackAlerter {
  private webhookUrl: string | undefined;
  private enabled: boolean;
  private supabaseClientPromise: Promise<any>;
  private runId: string;

  constructor() {
    this.webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    this.enabled = !!this.webhookUrl;
    this.runId = crypto.randomUUID();
    
    // Initialize Supabase client for alert_history logging
    this.supabaseClientPromise = (async () => {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        return createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
      } catch (e) {
        console.error('⚠️ Failed to initialize Supabase client for alert logging:', e);
        return null;
      }
    })();
    
    if (!this.enabled) {
      console.log('⚠️ SLACK_WEBHOOK_URL not configured - alerts disabled');
    }
  }

  /**
   * Send cron completion notification - the main alert type
   * Shows clear status for each of the 31 functions
   */
  async sendCronCompletion(alert: CronCompletionAlert): Promise<void> {
    const isFullScope = FULL_SCOPE_FUNCTIONS.includes(alert.functionName);
    const isEventBased = EVENT_BASED_FUNCTIONS.includes(alert.functionName);
    
    // Log to database
    await this.logToDatabase(alert);
    
    if (!this.enabled) return;

    const emoji = alert.status === 'success' ? '✅' : alert.status === 'partial' ? '⚠️' : '❌';
    const durationSec = (alert.durationMs / 1000).toFixed(1);
    
    let coverageText: string;
    if (isFullScope && alert.assetsProcessed !== undefined && alert.totalAssets !== undefined) {
      const pct = ((alert.assetsProcessed / alert.totalAssets) * 100).toFixed(0);
      coverageText = `${alert.assetsProcessed.toLocaleString()}/${alert.totalAssets.toLocaleString()} assets (${pct}%)`;
    } else if (isEventBased) {
      coverageText = `Applied to ${alert.rowsInserted} relevant assets`;
    } else {
      coverageText = `${alert.rowsInserted} rows`;
    }

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${alert.functionName}* completed`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Coverage:*\n${coverageText}` },
          { type: 'mrkdwn', text: `*Duration:*\n${durationSec}s` },
          { type: 'mrkdwn', text: `*Inserted:*\n${alert.rowsInserted.toLocaleString()}` },
          { type: 'mrkdwn', text: `*Skipped:*\n${alert.rowsSkipped.toLocaleString()}` }
        ]
      }
    ];

    if (alert.sourceUsed) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Source: ${alert.sourceUsed}` }]
      } as any);
    }

    if (alert.errorMessage) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Error:* ${alert.errorMessage.substring(0, 200)}` }
      } as any);
    }

    await this.send({ blocks });
  }

  /**
   * Send critical alert for failures that need immediate attention
   */
  async sendCriticalAlert(alert: CriticalAlert, options?: { suppressDuplicates?: boolean }): Promise<void> {
    if (!this.enabled) return;

    const emoji = '🚨';
    const text = `${emoji} *CRITICAL: ${alert.type.toUpperCase().replace(/_/g, ' ')}*` +
      (alert.etlName ? `\n*Function:* ${alert.etlName}` : '') +
      `\n${alert.message}`;

    await this.send({
      text,
      attachments: [{
        color: '#ff0000',
        fields: alert.details ? Object.entries(alert.details).map(([k, v]) => ({
          title: k,
          value: String(v),
          short: true
        })) : [],
        footer: 'Critical Alert',
        ts: Math.floor(Date.now() / 1000)
      }]
    });
  }

  /**
   * Send live ingestion status update - backward compatible method
   */
  async sendLiveAlert(alert: SlackAlert, options?: { suppressDuplicates?: boolean }): Promise<void> {
    // Only send completion alerts, not started alerts
    if (alert.status === 'started') return;
    
    await this.sendCronCompletion({
      functionName: alert.etlName,
      status: alert.status === 'success' ? 'success' : alert.status === 'partial' ? 'partial' : 'failed',
      rowsInserted: alert.rowsInserted ?? 0,
      rowsSkipped: alert.rowsSkipped ?? 0,
      durationMs: alert.latencyMs ?? (alert.duration ? alert.duration * 1000 : 0),
      sourceUsed: alert.sourceUsed,
      errorMessage: alert.errorMessage,
      assetsProcessed: alert.metadata?.assetsProcessed,
      totalAssets: alert.metadata?.totalAssets
    });
  }

  /**
   * Send daily digest summary - backward compatible
   */
  async sendDailyDigest(report: {
    totalRuns: number;
    succeeded: number;
    partial: number;
    failed: number;
    halted?: number;
    topErrors?: Array<{ etl_name: string; error_type: string; count: number; example: string }>;
    duplicateKeyErrors?: Array<{ etl_name: string; count: number }>;
    haltedFunctions?: string[];
    staleTickers?: Array<{ ticker: string; hours_stale: number }>;
    fullScopeFunctions?: { name: string; lastRun: string; coverage: string }[];
    eventBasedFunctions?: { name: string; lastRun: string; recordsApplied: number }[];
  }): Promise<void> {
    if (!this.enabled) return;

    const successRate = report.totalRuns > 0 
      ? ((report.succeeded / report.totalRuns) * 100).toFixed(1) 
      : '0.0';

    let text = `📊 *Daily Ingestion Summary* - ${new Date().toISOString().split('T')[0]}\n\n`;
    text += `*Total Runs:* ${report.totalRuns} | *Success Rate:* ${successRate}%\n`;
    text += `✅ ${report.succeeded} | ⚠️ ${report.partial} | ❌ ${report.failed}`;
    if (report.halted !== undefined) {
      text += ` | 🛑 ${report.halted}`;
    }
    text += `\n\n`;

    if (report.fullScopeFunctions && report.fullScopeFunctions.length > 0) {
      text += `*Full-Scope Functions (8201 assets):*\n`;
      for (const fn of report.fullScopeFunctions.slice(0, 5)) {
        text += `• ${fn.name}: ${fn.coverage} (${fn.lastRun})\n`;
      }
      if (report.fullScopeFunctions.length > 5) {
        text += `  _...and ${report.fullScopeFunctions.length - 5} more_\n`;
      }
      text += '\n';
    }

    if (report.eventBasedFunctions && report.eventBasedFunctions.length > 0) {
      text += `*Event-Based Functions:*\n`;
      for (const fn of report.eventBasedFunctions.slice(0, 5)) {
        text += `• ${fn.name}: ${fn.recordsApplied} records (${fn.lastRun})\n`;
      }
      if (report.eventBasedFunctions.length > 5) {
        text += `  _...and ${report.eventBasedFunctions.length - 5} more_\n`;
      }
      text += '\n';
    }

    if (report.topErrors && report.topErrors.length > 0) {
      text += `*Top Errors:*\n`;
      report.topErrors.forEach((err, i) => {
        text += `${i + 1}. ${err.etl_name} - ${err.error_type} (${err.count}x)\n`;
      });
      text += '\n';
    }

    if (report.haltedFunctions && report.haltedFunctions.length > 0) {
      text += `🛑 *Halted Functions:*\n`;
      report.haltedFunctions.forEach(fn => {
        text += `• ${fn}\n`;
      });
    }

    await this.send({ text });
  }

  private async logToDatabase(alert: CronCompletionAlert): Promise<void> {
    const client = await this.supabaseClientPromise;
    if (!client) return;
    
    try {
      await client.from('alert_history').insert({
        alert_type: `cron_${alert.status}`,
        function_name: alert.functionName,
        severity: alert.status === 'failed' ? 'critical' : alert.status === 'partial' ? 'warning' : 'info',
        message: `${alert.functionName} completed: ${alert.rowsInserted} inserted, ${alert.rowsSkipped} skipped`,
        metadata: {
          assetsProcessed: alert.assetsProcessed,
          totalAssets: alert.totalAssets,
          rowsInserted: alert.rowsInserted,
          rowsSkipped: alert.rowsSkipped,
          durationMs: alert.durationMs,
          sourceUsed: alert.sourceUsed
        }
      });
    } catch (e) {
      console.error('❌ Failed to log alert:', e);
    }
  }

  private async send(payload: any): Promise<void> {
    if (!this.enabled || !this.webhookUrl) return;

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('Failed to send Slack alert:', await response.text());
      }
    } catch (error) {
      console.error('Error sending Slack alert:', error);
    }
  }
}
