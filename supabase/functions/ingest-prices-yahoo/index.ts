import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from '../_shared/slack-alerts.ts';
import { logAPIUsage } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceData {
  ticker: string;
  asset_id: string;
  date: string;
  close: number;
  checksum: string;
  last_updated_at: string;
  updated_at: string;
}

// === PRODUCTION HARDENING: User-Agent Rotation ===
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Generate SHA256 checksum
async function generateChecksum(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// === PRODUCTION HARDENING: Enhanced Fetch with Retry Logic ===
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (!isLastAttempt) {
        // Exponential backoff: 500ms, 1s, 2s
        const backoffMs = 500 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  throw lastError || new Error('Fetch failed after retries');
}

// === Fetch from Alpha Vantage with Enhanced Error Handling ===
async function fetchFromAlphaVantage(
  ticker: string,
  apiKey: string,
  supabaseClient: any
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  const apiStartTime = Date.now();
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`;
    
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: '/query',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: `HTTP ${response.status}`
      });
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const rawData = await response.json();
    
    // Handle API-specific errors
    if (rawData['Error Message']) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: '/query',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: rawData['Error Message']
      });
      return { success: false, error: rawData['Error Message'] };
    }
    
    if (rawData['Note']) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: '/query',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: 'Rate limit exceeded'
      });
      return { success: false, error: 'Rate limit exceeded' };
    }
    
    if (rawData['Information']) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: '/query',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: 'API limit reached'
      });
      return { success: false, error: 'API limit reached' };
    }
    
    const timeSeries = rawData['Time Series (Daily)'];
    if (!timeSeries) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Alpha Vantage',
        endpoint: '/query',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: 'No time series data'
      });
      return { success: false, error: 'No time series data' };
    }
    
    const prices: PriceData[] = [];
    for (const [date, values] of Object.entries(timeSeries)) {
      const close = parseFloat((values as any)['5. adjusted close']);
      const checksum = await generateChecksum(`${ticker}|${date}|${close}`);
      
      prices.push({
        ticker,
        asset_id: '',
        date,
        close,
        checksum,
        last_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    // Log successful API call
    await logAPIUsage(supabaseClient, {
      api_name: 'Alpha Vantage',
      endpoint: '/query',
      function_name: 'ingest-prices-yahoo',
      status: 'success',
      response_time_ms: Date.now() - apiStartTime
    });
    
    return { success: true, data: prices };
  } catch (error) {
    await logAPIUsage(supabaseClient, {
      api_name: 'Alpha Vantage',
      endpoint: '/query',
      function_name: 'ingest-prices-yahoo',
      status: 'failure',
      response_time_ms: Date.now() - apiStartTime,
      error_message: (error as Error).message
    });
    return { success: false, error: (error as Error).message };
  }
}

// === Fetch from Yahoo Finance with Enhanced Retry and Rate Limiting ===
async function fetchFromYahoo(
  ticker: string,
  supabaseClient: any
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  const apiStartTime = Date.now();
  try {
    // Yahoo Finance uses hyphens, not dots (BRK.B → BRK-B)
    const yahooTicker = ticker.replace(/\./g, '-');
    
    // Use range parameter for most current data (query2 domain is more reliable)
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=1y&interval=1d`;
    
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com'
      }
    }, 5); // Yahoo gets 5 retries (more reliable)
    
    if (!response.ok) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Yahoo Finance',
        endpoint: '/v8/finance/chart',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: `HTTP ${response.status}`
      });
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const rawData = await response.json();
    const result = rawData?.chart?.result?.[0];
    
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Yahoo Finance',
        endpoint: '/v8/finance/chart',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: 'Invalid response structure'
      });
      return { success: false, error: 'Invalid response structure' };
    }
    
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    
    const prices: PriceData[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      
      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      const close = closes[i];
      const checksum = await generateChecksum(`${ticker}|${date}|${close}`);
      
      prices.push({
        ticker,
        asset_id: '',
        date,
        close,
        checksum,
        last_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    // Log successful API call
    await logAPIUsage(supabaseClient, {
      api_name: 'Yahoo Finance',
      endpoint: '/v8/finance/chart',
      function_name: 'ingest-prices-yahoo',
      status: 'success',
      response_time_ms: Date.now() - apiStartTime
    });
    
    return { success: true, data: prices };
  } catch (error) {
    await logAPIUsage(supabaseClient, {
      api_name: 'Yahoo Finance',
      endpoint: '/v8/finance/chart',
      function_name: 'ingest-prices-yahoo',
      status: 'failure',
      response_time_ms: Date.now() - apiStartTime,
      error_message: (error as Error).message
    });
    return { success: false, error: (error as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const executionId = crypto.randomUUID();
  const slackAlerter = new SlackAlerter();
  console.log(`🚀 [${executionId}] START @ ${new Date().toISOString()}`);
  
  let inserted = 0;
  let skipped = 0;
  let alphaSuccessCount = 0;
  let yahooFallbackCount = 0;
  let failedCount = 0;
  let tickersProcessed = 0;
  let errorDetails: string[] = [];

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
    if (!alphaVantageKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY not configured');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    
    // === PRODUCTION HARDENING: Log start to ingest_logs ===
    await supabaseClient.from('ingest_logs').insert({
      etl_name: 'ingest-prices-yahoo',
      status: 'running',
      started_at: new Date().toISOString(),
      metadata: { execution_id: executionId }
    });
    
    // === Fetch assets with defensive limits ===
    const { data: allAssets, error: assetsError } = await supabaseClient
      .from('assets')
      .select('*')
      .limit(1000);
    
    if (assetsError) {
      throw new Error(`Assets fetch failed: ${assetsError.message}`);
    }
    
    // === PRODUCTION HARDENING: Granular batching (15 tickers per run) ===
    const BATCH_SIZE = 15;
    const TICKER_DELAY_MS = 350; // 350ms base delay
    const MAX_EXECUTION_TIME_MS = 50000; // 50 second hard limit
    
    const assets = (allAssets || []).slice(0, BATCH_SIZE);
    console.log(`📊 Processing ${assets.length} tickers (batch size: ${BATCH_SIZE})`);
    
    const executionDeadline = startTime + MAX_EXECUTION_TIME_MS;
    
    for (let i = 0; i < assets.length; i++) {
      // === PRODUCTION HARDENING: Hard timeout check ===
      if (Date.now() >= executionDeadline) {
        console.log(`⏱️ DEADLINE REACHED: Stopping after ${tickersProcessed} tickers`);
        errorDetails.push(`Stopped early: deadline reached after ${tickersProcessed} tickers`);
        break;
      }
      
      const asset = assets[i];
      const ticker = asset.ticker;
      
      if (!ticker || ticker.length > 10) {
        skipped++;
        continue;
      }
      
      console.log(`\n[${i+1}/${assets.length}] ${ticker}`);
      tickersProcessed++;
      
      // === Try Alpha Vantage first ===
      const alphaResult = await fetchFromAlphaVantage(ticker, alphaVantageKey, supabaseClient);
      
      let prices: PriceData[] | null = null;
      let sourceUsed = '';
      
      if (alphaResult.success && alphaResult.data) {
        prices = alphaResult.data;
        sourceUsed = 'Alpha Vantage';
        alphaSuccessCount++;
        console.log(`✅ ${ticker} - Alpha Vantage: ${prices.length} prices`);
      } else {
        // === Fallback to Yahoo ===
        console.log(`⚠️ ${ticker} - Alpha failed (${alphaResult.error}), trying Yahoo...`);
        
        const yahooResult = await fetchFromYahoo(ticker, supabaseClient);
        
        if (yahooResult.success && yahooResult.data) {
          prices = yahooResult.data;
          sourceUsed = 'Yahoo Finance';
          yahooFallbackCount++;
          console.log(`✅ ${ticker} - Yahoo Fallback: ${prices.length} prices`);
        } else {
          console.log(`❌ ${ticker} - Both sources failed. Alpha: ${alphaResult.error}, Yahoo: ${yahooResult.error}`);
          failedCount++;
          errorDetails.push(`${ticker}: ${alphaResult.error} | ${yahooResult.error}`);
          skipped++;
          
          // === PRODUCTION HARDENING: Rate limit pause on failures ===
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      }
      
      if (!prices || prices.length === 0) {
        skipped++;
        continue;
      }
      
      // Set asset_id
      prices.forEach(p => p.asset_id = asset.id);
      
      // === Upsert all data (let database handle duplicates) ===
      const { error: insertError } = await supabaseClient
        .from('prices')
        .upsert(prices, { 
          onConflict: 'ticker,date',
          ignoreDuplicates: false
        });
      
      if (insertError) {
        console.log(`❌ ${ticker} - Upsert error: ${insertError.message}`);
        errorDetails.push(`${ticker}: upsert failed - ${insertError.message}`);
        skipped += prices.length;
      } else {
        inserted += prices.length;
        console.log(`✅ ${ticker} - Upserted ${prices.length} prices (${sourceUsed})`);
      }
      
      // === PRODUCTION HARDENING: Adaptive delay between tickers ===
      if (i < assets.length - 1) {
        const jitter = Math.random() * 150; // 0-150ms random jitter
        const delay = TICKER_DELAY_MS + jitter;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    const duration = Date.now() - startTime;
    const totalProcessed = alphaSuccessCount + yahooFallbackCount + failedCount;
    const fallbackRate = totalProcessed > 0 
      ? ((yahooFallbackCount / totalProcessed) * 100).toFixed(1)
      : '0.0';
    
    // === PRODUCTION HARDENING: Comprehensive logging to function_status ===
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-prices-yahoo',
      status: failedCount === totalProcessed ? 'failure' : 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: inserted,
      rows_skipped: skipped,
      source_used: `Alpha: ${alphaSuccessCount}, Yahoo: ${yahooFallbackCount}`,
      fallback_used: yahooFallbackCount > 0 ? 'Yahoo Finance' : null,
      error_message: errorDetails.length > 0 ? errorDetails.slice(0, 3).join('; ') : null,
      metadata: {
        execution_id: executionId,
        tickers_processed: tickersProcessed,
        alpha_success: alphaSuccessCount,
        yahoo_fallback: yahooFallbackCount,
        failed: failedCount,
        fallback_rate: parseFloat(fallbackRate),
        batch_size: BATCH_SIZE,
        avg_time_per_ticker: totalProcessed > 0 ? (duration / totalProcessed).toFixed(0) : 0
      }
    });
    
    // === Update ingest_logs with completion ===
    await supabaseClient
      .from('ingest_logs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round(duration / 1000),
        rows_inserted: inserted,
        rows_skipped: skipped,
        source_used: `Alpha: ${alphaSuccessCount}, Yahoo: ${yahooFallbackCount}`,
        fallback_count: yahooFallbackCount,
        metadata: { execution_id: executionId }
      })
      .eq('etl_name', 'ingest-prices-yahoo')
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1);
    
    console.log(`\n✅ [${executionId}] COMPLETE`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Tickers: ${tickersProcessed}`);
    console.log(`   Alpha: ${alphaSuccessCount}, Yahoo: ${yahooFallbackCount}, Failed: ${failedCount}`);
    console.log(`   Inserted: ${inserted}, Skipped: ${skipped}`);
    console.log(`   Fallback Rate: ${fallbackRate}%`);
    
    // === SEND SLACK ALERT ===
    console.log('📣 Attempting to send Slack alert...');
    try {
      await slackAlerter.sendLiveAlert({
        etlName: 'ingest-prices-yahoo',
        status: failedCount === totalProcessed ? 'failed' : 'success',
        duration,
        latencyMs: totalProcessed > 0 ? duration / totalProcessed : 0,
        sourceUsed: yahooFallbackCount > 0 ? 'Yahoo Finance (Fallback)' : 'Alpha Vantage',
        fallbackRatio: parseFloat(fallbackRate) / 100,
        rowsInserted: inserted,
        rowsSkipped: skipped,
        metadata: {
          execution_id: executionId,
          tickers_processed: tickersProcessed,
          alpha_success: alphaSuccessCount,
          yahoo_fallback: yahooFallbackCount,
          failed: failedCount,
          avg_time_per_ticker: totalProcessed > 0 ? (duration / totalProcessed).toFixed(0) : 0
        }
      });
      console.log('✅ Slack alert sent successfully');
    } catch (slackError) {
      console.error('❌ Failed to send Slack alert:', slackError);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        execution_id: executionId,
        duration_ms: duration,
        tickers_processed: tickersProcessed,
        inserted,
        skipped,
        alpha_success: alphaSuccessCount,
        yahoo_fallback: yahooFallbackCount,
        failed: failedCount,
        fallback_rate: parseFloat(fallbackRate)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;
    
    console.error(`❌ [${executionId}] FATAL ERROR: ${err.message}`);
    
    // === SEND SLACK CRITICAL ALERT ===
    try {
      const slackAlerter = new SlackAlerter();
      await slackAlerter.sendCriticalAlert({
        type: 'auth_error',
        etlName: 'ingest-prices-yahoo',
        message: `FATAL: ${err.message}`,
        details: {
          execution_id: executionId,
          duration_ms: duration,
          tickers_processed: tickersProcessed,
          stack: err.stack?.substring(0, 500)
        }
      });
    } catch (slackError) {
      console.error('Failed to send Slack alert:', slackError);
    }
    
    // === PRODUCTION HARDENING: Log failures to function_status ===
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseKey) {
        const supabaseClient = createClient(supabaseUrl, supabaseKey);
        
        await supabaseClient.from('function_status').insert({
          function_name: 'ingest-prices-yahoo',
          status: 'failure',
          executed_at: new Date().toISOString(),
          duration_ms: duration,
          error_message: err.message,
          metadata: {
            execution_id: executionId,
            tickers_processed: tickersProcessed,
            stack_trace: err.stack?.substring(0, 500)
          }
        });
        
        await supabaseClient
          .from('ingest_logs')
          .update({
            status: 'failure',
            completed_at: new Date().toISOString(),
            duration_seconds: Math.round(duration / 1000),
            error_message: err.message
          })
          .eq('etl_name', 'ingest-prices-yahoo')
          .eq('status', 'running')
          .order('started_at', { ascending: false })
          .limit(1);
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        execution_id: executionId,
        error: err.message,
        duration_ms: duration,
        tickers_processed: tickersProcessed
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
