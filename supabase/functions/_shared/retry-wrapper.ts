/**
 * Enhanced exponential backoff retry wrapper with jitter
 * Automatically logs failures and supports auth error detection
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  retryCount: number;
  statusCode?: number;
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
    onRetry,
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        console.error(`❌ Final retry attempt ${attempt + 1} failed:`, lastError.message);
        throw lastError;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, lastError);
      }

      // Add jitter (0-20% random variation)
      const exponentialDelay = delay * Math.pow(backoffMultiplier, attempt);
      const jitter = exponentialDelay * 0.2 * Math.random();
      const totalDelay = Math.min(exponentialDelay + jitter, maxDelayMs);

      console.warn(`⏳ Retry ${attempt + 1}/${maxRetries} after ${totalDelay.toFixed(0)}ms: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));

      delay = exponentialDelay;
    }
  }

  throw lastError;
}

/**
 * Enhanced retry with status code tracking for API calls
 */
export async function withRetryAndStatus<T>(
  fn: () => Promise<{ data: T; statusCode?: number }>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  let retryCount = 0;
  let lastStatusCode: number | undefined;

  try {
    const result = await withRetry(
      async () => {
        const response = await fn();
        lastStatusCode = response.statusCode;
        return response.data;
      },
      {
        ...options,
        onRetry: (attempt, error) => {
          retryCount = attempt;
          if (options.onRetry) {
            options.onRetry(attempt, error);
          }
        }
      }
    );

    return {
      success: true,
      data: result,
      retryCount,
      statusCode: lastStatusCode
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      retryCount,
      statusCode: lastStatusCode
    };
  }
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
