/**
 * Exponential backoff retry wrapper for ingestion functions
 * Automatically logs to ingest_logs on final failure
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        // Final retry failed, throw error
        console.error(`Final retry attempt ${attempt + 1} failed:`, lastError);
        throw lastError;
      }

      // Log retry attempt
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} failed:`, lastError.message);
      console.log(`Waiting ${delay}ms before retry...`);

      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, delay));

      // Exponential backoff with max delay cap
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Log ETL execution to ingest_logs table
 */
export async function logIngestion(
  supabase: any,
  etlName: string,
  status: 'running' | 'success' | 'failed',
  metadata: {
    rowsInserted?: number;
    rowsUpdated?: number;
    rowsSkipped?: number;
    errorMessage?: string;
    startedAt: Date;
    completedAt?: Date;
  }
) {
  const durationSeconds = metadata.completedAt 
    ? Math.round((metadata.completedAt.getTime() - metadata.startedAt.getTime()) / 1000)
    : null;

  const logData = {
    etl_name: etlName,
    status,
    started_at: metadata.startedAt.toISOString(),
    completed_at: metadata.completedAt?.toISOString() || null,
    duration_seconds: durationSeconds,
    rows_inserted: metadata.rowsInserted || 0,
    rows_updated: metadata.rowsUpdated || 0,
    rows_skipped: metadata.rowsSkipped || 0,
    error_message: metadata.errorMessage || null,
    metadata: {
      timestamp: new Date().toISOString(),
    },
  };

  const { error } = await supabase
    .from('ingest_logs')
    .insert(logData);

  if (error) {
    console.error('Failed to log ingestion:', error);
  }
}

/**
 * Send Slack alert for critical failures
 */
export async function sendSlackAlert(message: string, webhookUrl?: string) {
  if (!webhookUrl) {
    console.log('Slack webhook not configured, skipping alert');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 *Ingestion Alert*\n${message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *Ingestion Alert*\n${message}`,
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Failed to send Slack alert:', await response.text());
    }
  } catch (error) {
    console.error('Error sending Slack alert:', error);
  }
}

/**
 * Wrapper function that combines retry logic, logging, and alerting
 */
export async function executeWithMonitoring<T>(
  etlName: string,
  fn: () => Promise<{ rowsInserted?: number; rowsUpdated?: number; rowsSkipped?: number }>,
  supabase: any,
  options: {
    retryOptions?: RetryOptions;
    slackWebhook?: string;
    criticalFunction?: boolean;
  } = {}
): Promise<T> {
  const startedAt = new Date();
  const { retryOptions, slackWebhook, criticalFunction = false } = options;

  // Log running status
  await logIngestion(supabase, etlName, 'running', { startedAt });

  try {
    // Execute with retry
    const result = await withRetry(fn, retryOptions);
    const completedAt = new Date();

    // Log success
    await logIngestion(supabase, etlName, 'success', {
      ...result,
      startedAt,
      completedAt,
    });

    return result as T;

  } catch (error) {
    const completedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log failure
    await logIngestion(supabase, etlName, 'failed', {
      startedAt,
      completedAt,
      errorMessage,
    });

    // Send Slack alert for critical functions or after max retries
    if (criticalFunction || slackWebhook) {
      const alertMessage = `*Function:* ${etlName}\n*Status:* Failed after all retries\n*Error:* ${errorMessage}\n*Time:* ${completedAt.toISOString()}`;
      await sendSlackAlert(alertMessage, slackWebhook);
    }

    throw error;
  }
}
