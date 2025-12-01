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

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function generateChecksum(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error('Fetch failed after retries');
}

function normalizeTickerForYahoo(ticker: string, assetClass?: string): string {
  if (assetClass === 'crypto' || ticker.includes('/USD') || ticker.includes('/EUR') || ticker.includes('/USDT')) {
    return ticker.replace(/\//g, '-');
  }
  
  if (assetClass === 'forex' || /^[A-Z]{3}\/[A-Z]{3}$/.test(ticker)) {
    return ticker.replace('/', '') + '=X';
  }
  
  if (assetClass === 'commodity' && !ticker.endsWith('=F') && !ticker.includes('=') && ticker.length <= 6) {
    return ticker + '=F';
  }
  
  return ticker.replace(/\./g, '-');
}

async function fetchFromYahoo(
  ticker: string,
  assetClass: string,
  supabaseClient: any
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  const apiStartTime = Date.now();
  try {
    const yahooTicker = normalizeTickerForYahoo(ticker, assetClass);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=1y&interval=1d`;
    
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com'
      }
    }, 5);
    
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    
    // Get batch_id from request body or default to 0
    const body = await req.json().catch(() => ({}));
    const batchId = body.batch_id ?? 0;
    const BATCH_SIZE = 20;
    
    console.log(`🚀 [${executionId}] BATCH ${batchId} START @ ${new Date().toISOString()}`);
    
    // Fetch ALL assets and slice by batch
    const { data: allAssets, error: assetsError } = await supabaseClient
      .from('assets')
      .select(`id, ticker, name, exchange, asset_class`)
      .order('ticker');
    
    if (assetsError || !allAssets || allAssets.length === 0) {
      throw new Error(`Assets fetch failed: ${assetsError?.message || 'No assets found'}`);
    }
    
    // Calculate batch boundaries
    const startIdx = batchId * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, allAssets.length);
    const batchAssets = allAssets.slice(startIdx, endIdx);
    
    console.log(`📦 Processing batch ${batchId}: assets ${startIdx}-${endIdx-1} (${batchAssets.length} assets)`);
    
    if (batchAssets.length === 0) {
      console.log(`⚠️ Batch ${batchId} is empty (total assets: ${allAssets.length})`);
      return new Response(
        JSON.stringify({
          success: true,
          batch_id: batchId,
          message: 'Batch empty - no assets to process',
          total_assets: allAssets.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    await supabaseClient.from('ingest_logs').insert({
      etl_name: 'ingest-prices-yahoo',
      status: 'running',
      started_at: new Date().toISOString(),
      metadata: { execution_id: executionId, batch_id: batchId, batch_size: batchAssets.length }
    });
    
    let inserted = 0;
    let successCount = 0;
    let failedCount = 0;
    const errorDetails: string[] = [];
    
    // Process batch concurrently
    const results = await Promise.allSettled(
      batchAssets.map(async (asset) => {
        const ticker = asset.ticker;
        
        if (!ticker || ticker.length > 10) {
          return { success: false, ticker, error: 'Invalid ticker', count: 0 };
        }
        
        const yahooResult = await fetchFromYahoo(ticker, asset.asset_class || 'stock', supabaseClient);
        
        if (!yahooResult.success || !yahooResult.data || yahooResult.data.length === 0) {
          return { success: false, ticker, error: yahooResult.error || 'No data', count: 0 };
        }
        
        const prices = yahooResult.data;
        prices.forEach(p => p.asset_id = asset.id);
        
        const { error: upsertError } = await supabaseClient
          .from('prices')
          .upsert(prices, {
            onConflict: 'ticker,date',
            ignoreDuplicates: false
          });
        
        if (upsertError) {
          return { success: false, ticker, error: upsertError.message, count: 0 };
        }
        
        return { success: true, ticker, count: prices.length };
      })
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        inserted += result.value.count;
        successCount++;
      } else {
        const error = result.status === 'fulfilled' ? result.value.error : (result.reason as Error).message;
        const ticker = result.status === 'fulfilled' ? result.value.ticker : 'unknown';
        failedCount++;
        errorDetails.push(`${ticker}: ${error}`);
      }
    }
    
    const duration = Date.now() - startTime;
    const status = failedCount === 0 ? 'success' : failedCount === batchAssets.length ? 'failure' : 'partial_success';
    
    await supabaseClient.from('ingest_logs').insert({
      etl_name: 'ingest-prices-yahoo',
      status,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: duration / 1000,
      rows_inserted: inserted,
      rows_skipped: failedCount,
      source_used: 'Yahoo Finance',
      metadata: {
        execution_id: executionId,
        batch_id: batchId,
        tickers_processed: successCount + failedCount,
        success: successCount,
        failed: failedCount,
        error_sample: errorDetails.slice(0, 5)
      }
    });
    
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-prices-yahoo',
      status,
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: inserted,
      rows_skipped: failedCount,
      source_used: 'Yahoo Finance',
      metadata: {
        execution_id: executionId,
        batch_id: batchId,
        tickers_processed: successCount + failedCount,
        success: successCount,
        failed: failedCount
      }
    });
    
    console.log(`✅ [${executionId}] BATCH ${batchId} COMPLETE in ${(duration/1000).toFixed(1)}s`);
    console.log(`   📊 ${successCount}/${batchAssets.length} tickers | ${inserted} prices | ${failedCount} failed`);
    
    // Only send Slack alert on failure or partial success
    if (status !== 'success') {
      await slackAlerter.sendLiveAlert({
        etlName: `ingest-prices-yahoo-batch-${batchId}`,
        status: status === 'failure' ? 'failed' : 'partial',
        duration,
        sourceUsed: 'Yahoo Finance',
        rowsInserted: inserted,
        rowsSkipped: failedCount,
        metadata: {
          execution_id: executionId,
          batch_id: batchId,
          tickers_processed: successCount + failedCount
        }
      });
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        execution_id: executionId,
        batch_id: batchId,
        assets_processed: batchAssets.length,
        prices_inserted: inserted,
        success_count: successCount,
        failed_count: failedCount,
        duration_s: (duration / 1000).toFixed(1)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000;
    const err = error as Error;
    
    console.error(`❌ [${executionId}] FATAL: ${err.message}`);
    
    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-prices-yahoo',
      message: err.message,
      details: { execution_id: executionId }
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        execution_id: executionId,
        error: err.message,
        duration_s: duration
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
