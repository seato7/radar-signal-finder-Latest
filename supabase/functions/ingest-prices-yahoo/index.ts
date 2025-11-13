import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { redisCache } from "../_shared/redis-cache.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { logAPIUsage } from "../_shared/api-logger.ts";
import { CircuitBreaker } from "../_shared/circuit-breaker.ts";

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
      
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = exponentialDelay * 0.2 * Math.random();
      const totalDelay = exponentialDelay + jitter;
      
      console.log(`⏳ Retry ${attempt + 1}/${maxRetries} after ${totalDelay.toFixed(0)}ms`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
}

interface PriceData {
  ticker: string;
  asset_id: string;
  date: string;
  close: number;
  checksum: string;
  last_updated_at: string;
}

// Fetch from Alpha Vantage (Primary)
async function fetchFromAlphaVantage(
  ticker: string,
  apiKey: string,
  supabaseClient: any
): Promise<{ success: boolean; data?: PriceData[]; error?: string; responseTimeMs: number }> {
  const startTime = Date.now();
  
  try {
    // Use TIME_SERIES_DAILY_ADJUSTED for historical data
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const responseTimeMs = Date.now() - startTime;
    
    if (!response.ok) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: url,
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: responseTimeMs,
        error_message: `HTTP ${response.status}`
      });
      return { success: false, error: `HTTP ${response.status}`, responseTimeMs };
    }
    
    const rawData = await response.json();
    
    // Check for API errors
    if (rawData['Error Message']) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: url,
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: responseTimeMs,
        error_message: rawData['Error Message']
      });
      return { success: false, error: rawData['Error Message'], responseTimeMs };
    }
    
    // Check for rate limit
    if (rawData['Note']) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: url,
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: responseTimeMs,
        error_message: 'Rate limit exceeded'
      });
      return { success: false, error: 'Rate limit exceeded', responseTimeMs };
    }
    
    const timeSeries = rawData['Time Series (Daily)'];
    if (!timeSeries) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: url,
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: responseTimeMs,
        error_message: 'No time series data'
      });
      return { success: false, error: 'No time series data', responseTimeMs };
    }
    
    // Convert to our format
    const prices: PriceData[] = [];
    for (const [date, values] of Object.entries(timeSeries)) {
      const close = parseFloat((values as any)['5. adjusted close']);
      const checksumData = `${ticker}|${date}|${close}`;
      const checksum = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(checksumData)
      ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      prices.push({
        ticker,
        asset_id: '', // Will be set later
        date,
        close,
        checksum,
        last_updated_at: new Date().toISOString()
      });
    }
    
    await logAPIUsage(supabaseClient, {
      api_name: 'Alpha Vantage',
      endpoint: url,
      function_name: 'ingest-prices-yahoo',
      status: 'success',
      response_time_ms: responseTimeMs
    });
    
    return { success: true, data: prices, responseTimeMs };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    await logAPIUsage(supabaseClient, {
      api_name: 'Alpha Vantage',
      function_name: 'ingest-prices-yahoo',
      status: 'failure',
      response_time_ms: responseTimeMs,
      error_message: errorMsg
    });
    
    return { success: false, error: errorMsg, responseTimeMs };
  }
}

// Fetch from Yahoo Finance (Secondary/Fallback)
async function fetchFromYahoo(
  ticker: string,
  supabaseClient: any
): Promise<{ success: boolean; data?: PriceData[]; error?: string; responseTimeMs: number }> {
  const startTime = Date.now();
  
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const responseTimeMs = Date.now() - startTime;
    
    if (!response.ok) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Yahoo Finance',
        endpoint: url,
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: responseTimeMs,
        error_message: `HTTP ${response.status}`
      });
      return { success: false, error: `HTTP ${response.status}`, responseTimeMs };
    }
    
    const rawData = await response.json();
    
    const result = rawData?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Yahoo Finance',
        endpoint: url,
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: responseTimeMs,
        error_message: 'Invalid response structure'
      });
      return { success: false, error: 'Invalid response structure', responseTimeMs };
    }
    
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    
    const prices: PriceData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      
      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      const close = closes[i];
      const checksumData = `${ticker}|${date}|${close}`;
      const checksum = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(checksumData)
      ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      prices.push({
        ticker,
        asset_id: '',
        date,
        close,
        checksum,
        last_updated_at: new Date().toISOString()
      });
    }
    
    await logAPIUsage(supabaseClient, {
      api_name: 'Yahoo Finance',
      endpoint: url,
      function_name: 'ingest-prices-yahoo',
      status: 'success',
      response_time_ms: responseTimeMs
    });
    
    return { success: true, data: prices, responseTimeMs };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    await logAPIUsage(supabaseClient, {
      api_name: 'Yahoo Finance',
      function_name: 'ingest-prices-yahoo',
      status: 'failure',
      response_time_ms: responseTimeMs,
      error_message: errorMsg
    });
    
    return { success: false, error: errorMsg, responseTimeMs };
  }
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
  
  const slackAlerter = new SlackAlerter();
  const circuitBreaker = new CircuitBreaker(supabaseClient);
  
  // Check circuit breaker
  const isCircuitOpen = await circuitBreaker.isOpen('ingest-prices-yahoo');
  if (isCircuitOpen) {
    const status = await circuitBreaker.getStatus('ingest-prices-yahoo');
    const errorMsg = `⚠️ Circuit breaker OPEN: ${status?.reason || 'Too many failures'}`;
    console.error(errorMsg);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-prices-yahoo',
      message: 'Circuit breaker is OPEN - function disabled due to repeated failures',
      details: { reason: status?.reason, opened_at: status?.opened_at }
    });
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMsg,
      circuit_open: true
    }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  
  const runId = crypto.randomUUID();
  const startTime = Date.now();
  let inserted = 0;
  let skipped = 0;
  let alphaSuccessCount = 0;
  let yahooFallbackCount = 0;
  let failedCount = 0;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    
    if (!alphaVantageKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY not configured');
    }
    
    console.log('🚀 Start:', new Date().toISOString());
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-prices-yahoo',
      status: 'started',
      metadata: { trigger: 'cron', runId }
    });
    
    // Fetch assets with reduced batch size
    const assetsRes = await fetch(`${supabaseUrl}/rest/v1/assets?select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const allAssets = await assetsRes.json();
    
    // CRITICAL: Cap batch size to 20 to prevent timeouts
    const MAX_TICKERS = 20;
    const TIMEOUT_MS = 240000; // 4 minutes
    const WARN_THRESHOLD_MS = 180000; // 3 minutes
    const assets = allAssets.slice(0, MAX_TICKERS);
    
    console.log(`📊 Processing ${assets.length} of ${allAssets.length} total assets (max ${MAX_TICKERS})`);
    
    const timeoutAt = startTime + TIMEOUT_MS;
    let warned3Min = false;
    
    for (const asset of assets) {
      const elapsed = Date.now() - startTime;
      
      // Warn at 3 minutes
      if (!warned3Min && elapsed >= WARN_THRESHOLD_MS) {
        console.warn(`⚠️ WARNING: Execution time exceeded 3 minutes (${(elapsed / 1000).toFixed(1)}s)`);
        warned3Min = true;
      }
      
      // Hard timeout at 4 minutes
      if (Date.now() >= timeoutAt) {
        const timeoutMsg = `⏱️ TIMEOUT: Exceeded 4 minutes, aborting ingestion`;
        console.error(timeoutMsg);
        
        await slackAlerter.sendCriticalAlert({
          type: 'sla_breach',
          etlName: 'ingest-prices-yahoo',
          message: timeoutMsg,
          details: { 
            processed: inserted + skipped,
            total: assets.length,
            runtime_seconds: Math.round(elapsed / 1000)
          }
        });
        
        throw new Error('INGESTION_TIMEOUT');
      }
      
      const ticker = asset.ticker;
      
      // Check cache first
      const cacheKey = `prices:${ticker}`;
      const cached = await redisCache.get(cacheKey);
      
      if (cached.hit && cached.data) {
        console.log(`✅ Cache HIT for ${ticker}`);
        inserted += cached.data.length || 0;
        continue;
      }
      
      // Try Alpha Vantage (Primary)
      console.log(`📡 Fetching ${ticker} from Alpha Vantage (PRIMARY)`);
      const alphaResult = await retryWithBackoff(
        () => fetchFromAlphaVantage(ticker, alphaVantageKey, supabaseClient),
        2,
        1000
      );
      
      let prices: PriceData[] | null = null;
      let sourceUsed = '';
      
      if (alphaResult.success && alphaResult.data) {
        console.log(`✅ Alpha Vantage SUCCESS for ${ticker} (${alphaResult.responseTimeMs}ms, ${alphaResult.data.length} prices)`);
        prices = alphaResult.data;
        sourceUsed = 'Alpha Vantage';
        alphaSuccessCount++;
      } else {
        console.warn(`⚠️ Alpha Vantage FAILED for ${ticker}: ${alphaResult.error}`);
        
        // Fallback to Yahoo Finance
        console.log(`📡 Fetching ${ticker} from Yahoo Finance (FALLBACK)`);
        const yahooResult = await retryWithBackoff(
          () => fetchFromYahoo(ticker, supabaseClient),
          2,
          1000
        );
        
        if (yahooResult.success && yahooResult.data) {
          console.log(`✅ Yahoo Finance FALLBACK SUCCESS for ${ticker} (${yahooResult.responseTimeMs}ms, ${yahooResult.data.length} prices)`);
          prices = yahooResult.data;
          sourceUsed = 'Yahoo Finance (Fallback)';
          yahooFallbackCount++;
        } else {
          console.error(`❌ Both sources FAILED for ${ticker}. Alpha: ${alphaResult.error}, Yahoo: ${yahooResult.error}`);
          failedCount++;
          skipped++;
          continue;
        }
      }
      
      if (!prices || prices.length === 0) {
        console.warn(`⚠️ No prices for ${ticker}, skipping`);
        skipped++;
        continue;
      }
      
      // Set asset_id for all prices
      prices.forEach(p => p.asset_id = asset.id);
      
      // Insert into database
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/prices`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates'
        },
        body: JSON.stringify(prices)
      });
      
      if (insertRes.ok) {
        inserted += prices.length;
        console.log(`✅ Inserted ${prices.length} prices for ${ticker} from ${sourceUsed}`);
        
        // Cache result
        await redisCache.set(cacheKey, prices, sourceUsed);
      } else {
        const errorText = await insertRes.text();
        console.error(`❌ Failed to insert ${ticker}: ${errorText}`);
        skipped++;
      }
    }
    
    const duration = Date.now() - startTime;
    const fallbackRate = assets.length > 0 
      ? ((yahooFallbackCount / assets.length) * 100).toFixed(1)
      : '0.0';
    
    console.log(`✅ COMPLETED in ${(duration / 1000).toFixed(1)}s`);
    console.log(`📊 Stats: ${alphaSuccessCount} Alpha / ${yahooFallbackCount} Yahoo fallback / ${failedCount} failed`);
    console.log(`📈 Fallback rate: ${fallbackRate}%`);
    
    await logger.success({
      rows_inserted: inserted,
      rows_skipped: skipped,
      source_used: `Alpha Vantage: ${alphaSuccessCount}, Yahoo: ${yahooFallbackCount}`,
      fallback_count: yahooFallbackCount
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-prices-yahoo',
      status: 'success',
      metadata: {
        runId,
        inserted,
        skipped,
        alpha_success: alphaSuccessCount,
        yahoo_fallback: yahooFallbackCount,
        failed: failedCount,
        fallback_rate: `${fallbackRate}%`,
        duration_seconds: (duration / 1000).toFixed(1)
      }
    });
    
    // Alert if fallback rate is high
    if (parseFloat(fallbackRate) > 10) {
      await slackAlerter.sendCriticalAlert({
        type: 'api_reliability',
        etlName: 'ingest-prices-yahoo',
        message: `High fallback rate: ${fallbackRate}% of requests using Yahoo Finance fallback`,
        details: {
          alpha_success: alphaSuccessCount,
          yahoo_fallback: yahooFallbackCount,
          failed: failedCount,
          recommendation: 'Check Alpha Vantage API status and rate limits'
        }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      runId,
      inserted,
      skipped,
      alpha_success: alphaSuccessCount,
      yahoo_fallback: yahooFallbackCount,
      failed: failedCount,
      fallback_rate: `${fallbackRate}%`,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    
    console.error('❌ FATAL ERROR:', errorMsg);
    
    await logger.failure(error instanceof Error ? error : new Error(errorMsg));
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-prices-yahoo',
      message: `Fatal error: ${errorMsg}`,
      details: {
        runId,
        inserted,
        skipped,
        alpha_success: alphaSuccessCount,
        yahoo_fallback: yahooFallbackCount,
        failed: failedCount,
        duration_seconds: (duration / 1000).toFixed(1)
      }
    });
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMsg,
      runId,
      inserted,
      skipped,
      duration_ms: duration
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
