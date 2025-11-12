import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { YahooResponseSchema, PerplexityResponseSchema, safeValidate } from "../_shared/zod-schemas.ts";
import { redisCache } from "../_shared/redis-cache.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { 
  validateAuthHeaders, 
  validateAuthResponse,
  logAuthFailure 
} from "../_shared/auth-validator.ts";
import { withRetry } from "../_shared/retry-wrapper.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Exponential backoff with jitter
async function retryWithBackoff(
  fn: () => Promise<any>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff with jitter (0-20% random variation)
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = exponentialDelay * 0.2 * Math.random();
      const totalDelay = exponentialDelay + jitter;
      
      console.log(`⏳ Retry ${attempt + 1}/${maxRetries} after ${totalDelay.toFixed(0)}ms`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
}

// Helper: Log to ingest_failures table
async function logFailure(
  supabase: any,
  etlName: string,
  ticker: string | null,
  errorType: string,
  errorMessage: string,
  statusCode: number | null,
  retryCount: number
) {
  await supabase.from('ingest_failures').insert({
    etl_name: etlName,
    ticker,
    error_type: errorType,
    error_message: errorMessage,
    status_code: statusCode,
    retry_count: retryCount,
    failed_at: new Date().toISOString(),
    metadata: { timestamp: new Date().toISOString() }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { IngestLogger } = await import('../_shared/log-ingest.ts');
  const logger = new IngestLogger(supabaseClient, 'ingest-prices-yahoo');
  await logger.start();
  
  // Initialize Slack alerter
  const slackAlerter = new SlackAlerter();
  
  // Declare variables outside try-catch for error handler access
  const runId = crypto.randomUUID();
  const startTime = Date.now();
  let inserted = 0;
  let skipped = 0;
  let fallbackUsed = 0;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Starting Yahoo Finance price ingestion...');
    
    // Send start alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-prices-yahoo',
      status: 'started',
      metadata: { trigger: 'manual' }
    });
    
    // Check last 3 runs for consecutive fallback-only pattern
    const { data: recentLogs } = await supabaseClient
      .from('ingest_logs')
      .select('source_used, fallback_count')
      .eq('etl_name', 'ingest-prices-yahoo')
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(3);
    
    if (recentLogs && recentLogs.length >= 3) {
      const allFallbackOnly = recentLogs.every(log => 
        log.source_used?.includes('AI Fallback') && log.fallback_count > 20
      );
      
      if (allFallbackOnly) {
        const errorMsg = '⚠️ Stopped: 3 consecutive runs used 100% AI fallback - primary Yahoo Finance API appears down';
        console.error(errorMsg);
        await logger.failure(new Error(errorMsg));
        
        // Send critical Slack alert
        await slackAlerter.sendCriticalAlert({
          type: 'halted',
          etlName: 'ingest-prices-yahoo',
          message: '3 consecutive runs used 100% AI fallback',
          details: { recommendation: 'Check Yahoo Finance API status and authentication' }
        });
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: errorMsg,
          recommendation: 'Check Yahoo Finance API credentials and rate limits'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Fetch all assets
    const assetsRes = await fetch(`${supabaseUrl}/rest/v1/assets?select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const allAssets = await assetsRes.json();
    
    // CRITICAL: Cap batch size to prevent timeouts
    const MAX_TICKERS = 1000;
    const TIMEOUT_MS = 300000; // 5 minutes max runtime
    const assets = allAssets.slice(0, MAX_TICKERS);
    
    console.log(`📊 Processing ${assets.length} of ${allAssets.length} total assets (max ${MAX_TICKERS})`);
    
    let cacheHits = 0;
    const errors: string[] = [];
    const duplicateKeyErrors: { ticker: string; count: number }[] = [];
    const timeoutAt = startTime + TIMEOUT_MS;
    
    // Process each asset with timeout guard
    for (const asset of assets) {
      // CRITICAL: Check timeout guard
      if (Date.now() >= timeoutAt) {
        const timeoutMsg = `⏱️ TIMEOUT: Exceeded ${TIMEOUT_MS / 1000}s runtime, aborting ingestion`;
        console.error(timeoutMsg);
        
        await slackAlerter.sendCriticalAlert({
          type: 'sla_breach',
          etlName: 'ingest-prices-yahoo',
          message: timeoutMsg,
          details: { 
            processed: inserted + skipped,
            total: assets.length,
            runtime_seconds: Math.round((Date.now() - startTime) / 1000)
          }
        });
        
        throw new Error('INGESTION_TIMEOUT');
      }
      try {
        const symbol = asset.ticker;
        
        // Check Redis cache first (5s TTL)
        const cacheKey = `prices:${symbol}`;
        const cached = await redisCache.get(cacheKey);
        
        if (cached.hit && cached.data) {
          console.log(`✅ Cache HIT for ${symbol} (${cached.age_seconds?.toFixed(1)}s old)`);
          cacheHits++;
          inserted += cached.data.length || 0;
          continue;
        }
        
        console.log(`❌ Cache MISS for ${symbol}`);
        
        const period = '1d';
        const range = '1y';
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${period}&range=${range}`;
        
        let data = null;
        let fetchError = null;
        let sourceUsed = 'Yahoo Finance';
        let statusCode: number | null = null;

        // Try Yahoo Finance with retry logic
        try {
          const result = await withRetry(
            async () => {
              const response = await fetch(yahooUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
              
              statusCode = response.status;
              
              // Handle authentication errors
              if (response.status === 401 || response.status === 403) {
                console.error(`❌ AUTH ERROR for ${symbol}: Yahoo Finance returned ${response.status}`);
                await logAuthFailure(supabaseClient, 'ingest-prices-yahoo', 'Yahoo Finance',
                  { isValid: false, errors: [`Yahoo Finance returned ${response.status}`], warnings: [], statusCode: response.status },
                  { ticker: symbol }
                );
                throw new Error(`AUTH_ERROR:${response.status}`);
              }
              
              // Handle rate limits
              if (response.status === 429) {
                console.log(`⚠️ Rate limit hit for ${symbol}, will retry with backoff`);
                throw new Error(`RATE_LIMIT:429`);
              }
              
              if (!response.ok) {
                throw new Error(`Yahoo Finance returned ${response.status}`);
              }
              
              const rawData = await response.json();
              
              // Validate response isn't HTML masquerading as JSON
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('text/html')) {
                const errorMsg = `Yahoo Finance returned HTML instead of JSON for ${symbol}`;
                console.error(`❌ ${errorMsg}`);
                await logAuthFailure(supabaseClient, 'ingest-prices-yahoo', 'Yahoo Finance',
                  { isValid: false, errors: ['HTML response instead of JSON'], warnings: [], statusCode: response.status },
                  { ticker: symbol, content_type: contentType }
                );
                await slackAlerter.sendCriticalAlert({
                  type: 'auth_error',
                  etlName: 'ingest-prices-yahoo',
                  message: `Yahoo Finance returning HTML instead of JSON for ${symbol}`,
                  details: { ticker: symbol, content_type: contentType, issue: 'html_masquerade' }
                });
                throw new Error('HTML_MASQUERADE');
              }
              
              return rawData;
            },
            {
              maxRetries: 3,
              initialDelayMs: 1000,
              onRetry: (attempt, error) => {
                console.log(`⏳ Retry ${attempt}/3 for ${symbol}: ${error.message}`);
              }
            }
          );
          
          const rawData = result;
          
          // CRITICAL: Validate Yahoo Finance response
          const validation = safeValidate(YahooResponseSchema, rawData, 'Yahoo Finance');
          if (validation.success) {
            data = validation.data;
          } else {
            fetchError = `Invalid Yahoo response: ${validation.error}`;
            console.error(fetchError);
            await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, 'validation', fetchError, statusCode, 3);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fetchError = errorMsg;
          
          // Classify error type
          let errorType = 'network';
          if (errorMsg.includes('AUTH_ERROR')) errorType = 'api_auth';
          else if (errorMsg.includes('RATE_LIMIT')) errorType = 'rate_limit';
          else if (errorMsg.includes('Invalid')) errorType = 'validation';
          
          console.error(`Yahoo Finance error for ${symbol}:`, errorMsg);
          await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, errorType, errorMsg, statusCode, 3);
        }
        
        // If Yahoo failed, skip (no fallback for cost optimization)
        if (!data?.chart?.result?.[0]) {
          console.log(`❌ No data from Yahoo for ${symbol}, skipping (fallback disabled)`);
          skipped++;
          continue;
        }
        
        const result = data.chart.result[0];
        const timestamps = result.timestamp || [];
        const quote = result.indicators.quote[0];
        
        const priceDataBatch = [];
        
        // Process each price point
        for (let i = 0; i < timestamps.length; i++) {
          const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
          const close = quote.close[i];
          
          if (!close || close <= 0) continue;
          
          // Generate checksum for idempotency
          const checksum = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`${symbol}|${date}|${close}`)
          ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
          
          priceDataBatch.push({
            ticker: symbol,
            asset_id: asset.id,
            date,
            close,
            checksum,
            last_updated_at: new Date().toISOString(),
          });
        }
        
        // Batch insert with ON CONFLICT handling
        if (priceDataBatch.length > 0) {
          try {
            const upsertRes = await fetch(`${supabaseUrl}/rest/v1/prices`, {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=ignore-duplicates'
              },
              body: JSON.stringify(priceDataBatch)
            });
            
            if (upsertRes.ok) {
              inserted += priceDataBatch.length;
              
              // Cache the Yahoo Finance result
              await redisCache.set(cacheKey, priceDataBatch, sourceUsed);
            } else {
              const errorText = await upsertRes.text();
              // Track duplicate key errors
              if (errorText.includes('duplicate key')) {
                console.warn(`Duplicate key for ${symbol}, using ON CONFLICT`);
                const existing = duplicateKeyErrors.find(e => e.ticker === symbol);
                if (existing) {
                  existing.count++;
                } else {
                  duplicateKeyErrors.push({ ticker: symbol, count: 1 });
                }
                await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, 'duplicate_key', errorText, upsertRes.status, 0);
              }
              skipped += priceDataBatch.length;
            }
          } catch (insertErr) {
            console.error(`Insert error for ${symbol}:`, insertErr);
            await logFailure(
              supabaseClient,
              'ingest-prices-yahoo',
              symbol,
              'unknown',
              insertErr instanceof Error ? insertErr.message : String(insertErr),
              null,
              0
            );
            skipped += priceDataBatch.length;
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        console.error(`Error processing ${asset.ticker}:`, err);
        errors.push(`${asset.ticker}: ${err instanceof Error ? err.message : String(err)}`);
        await logFailure(
          supabaseClient,
          'ingest-prices-yahoo',
          asset.ticker,
          'unknown',
          err instanceof Error ? err.message : String(err),
          null,
          0
        );
      }
    }
    
    const finalSourceUsed = fallbackUsed > 0 ? 'Yahoo Finance + AI Fallback' : 'Yahoo Finance';
    const latency = Date.now() - startTime;
    const fallbackRatio = assets.length > 0 ? (fallbackUsed / assets.length) * 100 : 0;
    
    // Report top duplicate key offenders
    if (duplicateKeyErrors.length > 0) {
      const topOffenders = duplicateKeyErrors
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(e => `${e.ticker}(${e.count})`);
      console.log(`🔑 Top duplicate key offenders: ${topOffenders.join(', ')}`);
    }
    
    await logger.success({
      source_used: finalSourceUsed,
      cache_hit: cacheHits > 0,
      fallback_count: fallbackUsed,
      latency_ms: latency,
      rows_inserted: inserted,
      rows_skipped: skipped,
    });
    
    // Send comprehensive success/partial alert to Slack
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-prices-yahoo',
      status: fallbackUsed > 0 ? 'partial' : 'success',
      duration: Math.round(latency / 1000),
      latencyMs: latency,
      sourceUsed: finalSourceUsed,
      fallbackRatio: fallbackRatio / 100, // Convert back to decimal for Slack
      rowsInserted: inserted,
      rowsSkipped: skipped,
      metadata: { 
        run_id: runId,
        fallback_percentage: fallbackRatio.toFixed(1) + '%',
        cache_hits: cacheHits,
        errors_count: errors.length,
        total_assets: assets.length,
        duplicate_key_errors: duplicateKeyErrors.length,
        top_duplicate_offenders: duplicateKeyErrors
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(e => `${e.ticker}(${e.count})`)
          .join(', ') || 'none'
      }
    });

    return new Response(JSON.stringify({
      success: true,
      processed: assets.length,
      inserted,
      skipped,
      fallbacks: fallbackUsed,
      errors: errors.length,
      source: finalSourceUsed,
      note: fallbackUsed > 0 ? 'Partial AI fallback used' : 'Real data from Yahoo Finance'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    
    // Log failure with full context
    await logger.failure(error as Error);
    
    // Send comprehensive failure alert to Slack
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-prices-yahoo',
      status: 'failed',
      duration: Math.round(duration / 1000),
      latencyMs: duration,
      errorMessage,
      metadata: {
        run_id: runId,
        rows_inserted: inserted,
        rows_skipped: skipped,
        fallback_used: fallbackUsed,
        is_timeout: errorMessage.includes('TIMEOUT')
      }
    });

    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      partial_results: {
        inserted,
        skipped,
        duration_ms: duration
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
