/**
 * Comprehensive Slack alerting system for ingestion pipeline monitoring
 */

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
  type: 'fallback_exceeded' | 'auth_error' | 'orphaned_logs' | 'duplicate_keys' | 'sla_breach' | 'halted' | 'missing_source' | 'empty_table' | 'api_reliability';
  etlName?: string;
  message: string;
  details?: Record<string, any>;
}

export class SlackAlerter {
  private webhookUrl: string | undefined;
  private enabled: boolean;
  private redisCache: any;
  private runId: string;

  constructor() {
    this.webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    this.enabled = !!this.webhookUrl;
    this.runId = crypto.randomUUID();
    
    // Dynamically import Redis cache for deduplication
    import('../_shared/redis-cache.ts').then(module => {
      this.redisCache = module.redisCache;
    }).catch(() => {
      console.log('⚠️ Redis cache not available for alert deduplication');
    });
    
    if (!this.enabled) {
      console.log('⚠️ SLACK_WEBHOOK_URL not configured - alerts disabled');
    }
  }
  
  /**
   * Check if this alert was recently sent (within 60s) to prevent duplicates
   */
  private async isDuplicateAlert(alertKey: string): Promise<boolean> {
    if (!this.redisCache) return false;
    
    try {
      const cacheKey = `slack_alert:${alertKey}`;
      const cached = await this.redisCache.get(cacheKey);
      
      if (cached.hit) {
        console.log(`🔕 Duplicate alert suppressed: ${alertKey}`);
        return true;
      }
      
      // Mark this alert as sent for 60 seconds
      await this.redisCache.set(cacheKey, { sent_at: new Date().toISOString(), run_id: this.runId }, 'alert_dedup');
      return false;
    } catch (e) {
      console.error('Alert dedup check failed:', e);
      return false;
    }
  }

  /**
   * Send live ingestion status update
   */
  async sendLiveAlert(alert: SlackAlert, options?: { suppressDuplicates?: boolean }): Promise<void> {
    if (!this.enabled) return;
    
    // Check for duplicate alerts
    const alertKey = `${alert.etlName}:${alert.status}:${Date.now()}`;
    if (options?.suppressDuplicates !== false) {
      const isDupe = await this.isDuplicateAlert(alertKey);
      if (isDupe) return;
    }

    const emoji = this.getStatusEmoji(alert.status);
    const color = this.getStatusColor(alert.status);
    
    let text = `${emoji} *${alert.etlName}* - ${alert.status.toUpperCase()}`;
    
    if (alert.ticker) {
      text += ` (${alert.ticker})`;
    }

    const fields: any[] = [];
    
    if (alert.sourceUsed) {
      fields.push({
        title: 'Source',
        value: alert.sourceUsed,
        short: true
      });
    }
    
    if (alert.latencyMs !== undefined) {
      fields.push({
        title: 'Latency',
        value: `${alert.latencyMs}ms`,
        short: true
      });
    }
    
    if (alert.fallbackRatio !== undefined) {
      fields.push({
        title: 'Fallback Ratio',
        value: `${(alert.fallbackRatio * 100).toFixed(1)}%`,
        short: true
      });
    }
    
    if (alert.duration !== undefined) {
      fields.push({
        title: 'Duration',
        value: `${alert.duration}s`,
        short: true
      });
    }

    if (alert.rowsInserted !== undefined) {
      fields.push({
        title: 'Rows Inserted',
        value: alert.rowsInserted.toString(),
        short: true
      });
    }

    if (alert.rowsSkipped !== undefined) {
      fields.push({
        title: 'Rows Skipped',
        value: alert.rowsSkipped.toString(),
        short: true
      });
    }

    if (alert.errorMessage) {
      fields.push({
        title: 'Error',
        value: alert.errorMessage.substring(0, 200),
        short: false
      });
    }

    await this.send({
      text,
      attachments: [{
        color,
        fields,
        footer: `Run ID: ${this.runId} | Ingestion Pipeline Monitor`,
        ts: Math.floor(Date.now() / 1000)
      }]
    });
  }

  /**
   * Send critical alert (100% fallback, auth errors, etc.)
   */
  async sendCriticalAlert(alert: CriticalAlert, options?: { suppressDuplicates?: boolean }): Promise<void> {
    if (!this.enabled) return;
    
    // Check for duplicate critical alerts
    const alertKey = `critical:${alert.etlName}:${alert.type}`;
    if (options?.suppressDuplicates !== false) {
      const isDupe = await this.isDuplicateAlert(alertKey);
      if (isDupe) return;
    }

    const emoji = this.getCriticalEmoji(alert.type);
    let text = `${emoji} *CRITICAL ALERT: ${alert.type.toUpperCase().replace(/_/g, ' ')}*`;
    
    if (alert.etlName) {
      text += `\n*Function:* ${alert.etlName}`;
    }
    
    text += `\n${alert.message}`;

    const fields: any[] = [];
    
    if (alert.details) {
      for (const [key, value] of Object.entries(alert.details)) {
        fields.push({
          title: key,
          value: String(value),
          short: true
        });
      }
    }

    await this.send({
      text,
      attachments: [{
        color: '#ff0000',
        fields,
        footer: `Run ID: ${this.runId} | CRITICAL`,
        ts: Math.floor(Date.now() / 1000)
      }]
    });
  }

  /**
   * Send daily digest report
   */
  async sendDailyDigest(report: {
    totalRuns: number;
    succeeded: number;
    partial: number;
    failed: number;
    halted: number;
    topErrors: Array<{ etl_name: string; error_type: string; count: number; example: string }>;
    duplicateKeyErrors: Array<{ etl_name: string; count: number }>;
    haltedFunctions: string[];
    staleTickers: Array<{ ticker: string; hours_stale: number }>;
  }): Promise<void> {
    if (!this.enabled) return;

    const successRate = report.totalRuns > 0 
      ? ((report.succeeded / report.totalRuns) * 100).toFixed(1) 
      : '0.0';

    let text = `📊 *Daily Ingestion Report* - ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}\n\n`;
    text += `*Overall:* ${report.totalRuns} runs | ${successRate}% success rate\n`;
    text += `✅ Succeeded: ${report.succeeded}\n`;
    text += `⚠️ Partial: ${report.partial}\n`;
    text += `❌ Failed: ${report.failed}\n`;
    text += `🛑 Halted: ${report.halted}\n\n`;

    if (report.topErrors.length > 0) {
      text += `*Top 3 Errors:*\n`;
      report.topErrors.forEach((err, i) => {
        text += `${i + 1}. ${err.etl_name} - ${err.error_type} (${err.count}x)\n`;
        text += `   _"${err.example.substring(0, 100)}"_\n`;
      });
      text += '\n';
    }

    if (report.duplicateKeyErrors.length > 0) {
      text += `*Duplicate Key Errors:*\n`;
      report.duplicateKeyErrors.forEach(err => {
        text += `• ${err.etl_name}: ${err.count} errors\n`;
      });
      text += '\n';
    }

    if (report.haltedFunctions.length > 0) {
      text += `🛑 *Halted Functions (require manual reset):*\n`;
      report.haltedFunctions.forEach(fn => {
        text += `• ${fn}\n`;
      });
      text += '\n';
    }

    if (report.staleTickers.length > 0) {
      text += `⏰ *Stale Data Alerts:*\n`;
      report.staleTickers.forEach(ticker => {
        text += `• ${ticker.ticker}: ${ticker.hours_stale.toFixed(1)}h old\n`;
      });
    }

    await this.send({
      text,
      username: 'Ingestion Health Monitor',
      icon_emoji: ':bar_chart:'
    });
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'started': return '▶️';
      case 'success': return '✅';
      case 'partial': return '⚠️';
      case 'failed': return '❌';
      case 'halted': return '🛑';
      default: return '❓';
    }
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'success': return '#00ff00';
      case 'partial': return '#ffaa00';
      case 'failed': return '#ff0000';
      case 'halted': return '#990000';
      default: return '#cccccc';
    }
  }

  private getCriticalEmoji(type: string): string {
    switch (type) {
      case 'fallback_exceeded': return '🔄';
      case 'auth_error': return '🔐';
      case 'orphaned_logs': return '👻';
      case 'duplicate_keys': return '🔑';
      case 'sla_breach': return '⏰';
      case 'halted': return '🛑';
      case 'missing_source': return '❓';
      case 'empty_table': return '📭';
      default: return '🚨';
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
