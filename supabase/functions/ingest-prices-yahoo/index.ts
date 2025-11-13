import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
}

// Generate SHA256 checksum
async function generateChecksum(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Fetch with timeout using AbortController
async function fetchWithTimeout(url: string, timeoutMs: number, headers?: HeadersInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: headers || {}
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    const err = error as Error;
    if (err.name === 'AbortError') {
      throw new Error(`Fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Fetch from Alpha Vantage
async function fetchFromAlphaVantage(
  ticker: string,
  apiKey: string
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  console.log(`[ALPHA] Starting fetch for ${ticker}`);
  
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`;
    
    const response = await fetchWithTimeout(url, 30000); // 30 second timeout
    console.log(`[ALPHA] ${ticker} - Response status: ${response.status}`);
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const rawData = await response.json();
    
    if (rawData['Error Message']) {
      console.log(`[ALPHA] ${ticker} - API Error: ${rawData['Error Message']}`);
      return { success: false, error: rawData['Error Message'] };
    }
    
    if (rawData['Note']) {
      console.log(`[ALPHA] ${ticker} - Rate limit hit`);
      return { success: false, error: 'Rate limit exceeded' };
    }
    
    const timeSeries = rawData['Time Series (Daily)'];
    if (!timeSeries) {
      console.log(`[ALPHA] ${ticker} - No time series data`);
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
        last_updated_at: new Date().toISOString()
      });
    }
    
    console.log(`[ALPHA] ✅ ${ticker} - Success: ${prices.length} prices`);
    return { success: true, data: prices };
  } catch (error) {
    const err = error as Error;
    console.log(`[ALPHA] ❌ ${ticker} - Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// Fetch from Yahoo Finance with retry logic and browser-like headers
async function fetchFromYahoo(
  ticker: string,
  retryAttempt: number = 0
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  const MAX_RETRIES = 2;
  const RETRY_DELAYS = [300, 600]; // ms: exponential backoff
  
  console.log(`[YAHOO] Starting fetch for ${ticker} (attempt ${retryAttempt + 1}/${MAX_RETRIES + 1})`);
  
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`;
    
    // Browser-like headers to bypass anti-bot mechanisms
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://finance.yahoo.com',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
    
    const response = await fetchWithTimeout(url, 6000, browserHeaders); // 6 second timeout per request
    console.log(`[YAHOO] ${ticker} - Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[YAHOO] ${ticker} - HTTP ${response.status} error body: ${errorText.substring(0, 200)}`);
      
      // Retry on rate limit or server errors
      if ((response.status === 429 || response.status >= 500) && retryAttempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryAttempt];
        console.log(`[YAHOO] ${ticker} - Retrying after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchFromYahoo(ticker, retryAttempt + 1);
      }
      
      return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 100)}` };
    }
    
    let rawData;
    try {
      rawData = await response.json();
    } catch (jsonError) {
      const textBody = await response.text();
      console.log(`[YAHOO] ${ticker} - JSON parse error. Response body: ${textBody.substring(0, 500)}`);
      return { success: false, error: `JSON parse error: ${textBody.substring(0, 100)}` };
    }
    
    const result = rawData?.chart?.result?.[0];
    
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
      console.log(`[YAHOO] ${ticker} - Invalid response structure:`, JSON.stringify(rawData).substring(0, 200));
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
        last_updated_at: new Date().toISOString()
      });
    }
    
    console.log(`[YAHOO] ✅ ${ticker} - Success: ${prices.length} prices`);
    return { success: true, data: prices };
  } catch (error) {
    const err = error as Error;
    console.log(`[YAHOO] ❌ ${ticker} - Error: ${err.message}, Stack: ${err.stack?.substring(0, 200)}`);
    
    // Retry on network errors
    if (retryAttempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryAttempt];
      console.log(`[YAHOO] ${ticker} - Retrying after ${delay}ms delay due to error...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchFromYahoo(ticker, retryAttempt + 1);
    }
    
    return { success: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`🚀 [START] ${new Date().toISOString()}`);
  
  let inserted = 0;
  let skipped = 0;
  let alphaSuccessCount = 0;
  let yahooFallbackCount = 0;
  let yahooFallbackFailedCount = 0;
  let failedCount = 0;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');
    
    console.log(`[CONFIG] Supabase URL: ${supabaseUrl ? 'SET' : 'MISSING'}`);
    console.log(`[CONFIG] Supabase Key: ${supabaseKey ? 'SET' : 'MISSING'}`);
    console.log(`[CONFIG] Alpha Vantage Key: ${alphaVantageKey ? 'SET' : 'MISSING'}`);
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }
    
    if (!alphaVantageKey) {
      throw new Error('ALPHA_VANTAGE_API_KEY not configured');
    }

    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    
    // Log start
    console.log('[DB] Inserting start log...');
    await supabaseClient.from('ingest_logs').insert({
      etl_name: 'ingest-prices-yahoo',
      status: 'running',
      started_at: new Date().toISOString()
    });
    console.log('[DB] Start log inserted');
    
    // Fetch assets
    console.log('[DB] Fetching assets...');
    const { data: allAssets, error: assetsError } = await supabaseClient
      .from('assets')
      .select('*')
      .limit(1000);
    
    if (assetsError) {
      console.log(`[DB] ❌ Assets error: ${assetsError.message}`);
      throw assetsError;
    }
    
    console.log(`[DB] ✅ Fetched ${allAssets?.length || 0} assets`);
    
    // CRITICAL: Batch size = 5 max per batch, with delays between tickers
    const MAX_TICKERS = 5;
    const TIMEOUT_MS = 60000; // 60 seconds total for 5 tickers
    const DELAY_BETWEEN_TICKERS_MS = 400; // 400ms delay between each ticker
    const assets = (allAssets || []).slice(0, MAX_TICKERS);
    
    console.log(`📊 Processing ${assets.length} tickers (max ${MAX_TICKERS})`);
    console.log(`⏱️  Timeout: ${TIMEOUT_MS}ms (${TIMEOUT_MS/1000} seconds)`);
    console.log(`⏱️  Delay between tickers: ${DELAY_BETWEEN_TICKERS_MS}ms`);
    
    const timeoutAt = startTime + TIMEOUT_MS;
    
    // Validate ticker list (filter out known invalid tickers)
    const INVALID_TICKERS = new Set(['', 'N/A', 'INVALID', 'UNKNOWN']);
    const validAssets = assets.filter(asset => {
      const ticker = asset.ticker?.toUpperCase() || '';
      if (!ticker || INVALID_TICKERS.has(ticker) || ticker.length > 10) {
        console.log(`[SKIP] Invalid ticker: ${ticker}`);
        skipped++;
        return false;
      }
      return true;
    });
    
    console.log(`✅ ${validAssets.length} valid tickers (${assets.length - validAssets.length} skipped as invalid)`);
    
    for (let i = 0; i < validAssets.length; i++) {
      const asset = validAssets[i];
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (Date.now() >= timeoutAt) {
        console.log(`⏱️  TIMEOUT: Exceeded ${TIMEOUT_MS}ms (elapsed: ${elapsed}ms)`);
        throw new Error('INGESTION_TIMEOUT');
      }
      
      console.log(`\n--- Processing ${asset.ticker} (${elapsed}ms elapsed) ---`);
      const ticker = asset.ticker;
      
      // Try Alpha Vantage (Primary)
      const alphaResult = await fetchFromAlphaVantage(ticker, alphaVantageKey);
      
      let prices: PriceData[] | null = null;
      let sourceUsed = '';
      
      if (alphaResult.success && alphaResult.data) {
        prices = alphaResult.data;
        sourceUsed = 'Alpha Vantage';
        alphaSuccessCount++;
      } else {
        console.log(`[FALLBACK] 🔄 Alpha failed for ${ticker} (${alphaResult.error}), falling back to Yahoo...`);
        
        // Fallback to Yahoo with retry logic
        const yahooResult = await fetchFromYahoo(ticker, 0);
        
        if (yahooResult.success && yahooResult.data) {
          prices = yahooResult.data;
          sourceUsed = 'Yahoo Finance (Fallback)';
          yahooFallbackCount++;
          console.log(`[FALLBACK] ✅ Yahoo fallback succeeded for ${ticker}`);
        } else {
          console.log(`[FAIL] ❌ Both sources failed for ${ticker}. Alpha: ${alphaResult.error}, Yahoo: ${yahooResult.error}`);
          failedCount++;
          yahooFallbackFailedCount++;
          skipped++;
          continue;
        }
      }
      
      // Add delay between tickers to avoid rate limiting
      if (i < validAssets.length - 1) {
        const delay = DELAY_BETWEEN_TICKERS_MS + Math.random() * 200; // 400-600ms random delay
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      if (!prices || prices.length === 0) {
        console.log(`[SKIP] ${ticker} - No prices to insert`);
        skipped++;
        continue;
      }
      
      // Set asset_id
      prices.forEach(p => p.asset_id = asset.id);
      
      // Filter out dates that already exist to avoid duplicates
      console.log(`[DB] Checking existing dates for ${ticker}...`);
      const dates = prices.map(p => p.date);
      const { data: existing } = await supabaseClient
        .from('prices')
        .select('date')
        .eq('ticker', ticker)
        .in('date', dates);
      
      const existingDates = new Set(existing?.map(e => e.date) || []);
      const newPrices = prices.filter(p => !existingDates.has(p.date));
      const skippedPrices = prices.length - newPrices.length;
      
      if (newPrices.length === 0) {
        console.log(`[DB] ⏭️ ${ticker} - All ${prices.length} dates already exist, skipping`);
        skipped += prices.length;
        continue;
      }
      
      // Insert new prices using upsert with ON CONFLICT DO UPDATE
      console.log(`[DB] Inserting ${newPrices.length} new prices for ${ticker} (${skippedPrices} already exist)...`);
      const { error: insertError } = await supabaseClient
        .from('prices')
        .upsert(newPrices, { 
          onConflict: 'ticker,date',
          ignoreDuplicates: false // Update existing rows
        });
      
      if (insertError) {
        console.log(`[DB] ❌ Insert error for ${ticker}: ${insertError.message}`);
        skipped += newPrices.length;
      } else {
        inserted += newPrices.length;
        skipped += skippedPrices;
        console.log(`[DB] ✅ ${ticker}: Inserted ${newPrices.length} new, Skipped ${skippedPrices} existing (Source: ${sourceUsed})`);
      }
    }
    
    const duration = Date.now() - startTime;
    const totalProcessed = alphaSuccessCount + yahooFallbackCount + failedCount;
    const fallbackRate = totalProcessed > 0 
      ? ((yahooFallbackCount / totalProcessed) * 100).toFixed(1)
      : '0.0';
    const yahooSuccessRate = yahooFallbackCount > 0
      ? (((yahooFallbackCount / (yahooFallbackCount + yahooFallbackFailedCount)) * 100).toFixed(1))
      : '0.0';
    
    console.log(`\n✅ [COMPLETE] Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`📊 Stats: ${alphaSuccessCount} Alpha / ${yahooFallbackCount} Yahoo Success / ${yahooFallbackFailedCount} Yahoo Failed / ${failedCount} Total Failed`);
    console.log(`📈 Fallback rate: ${fallbackRate}% (${yahooFallbackCount}/${totalProcessed} used Yahoo)`);
    console.log(`📈 Yahoo success rate: ${yahooSuccessRate}% (${yahooFallbackCount}/${yahooFallbackCount + yahooFallbackFailedCount})`);
    console.log(`💾 Inserted: ${inserted} rows, Skipped: ${skipped} rows`);
    
    // @guard: Log to function_status heartbeat table for monitoring
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-prices-yahoo',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      fallback_used: yahooFallbackCount > 0 ? 'Yahoo Finance' : null,
      duration_ms: duration,
      source_used: alphaSuccessCount > yahooFallbackCount ? 'Alpha Vantage' : 'Yahoo Finance',
      metadata: {
        alpha_success: alphaSuccessCount,
        yahoo_fallback_success: yahooFallbackCount,
        yahoo_fallback_failed: yahooFallbackFailedCount,
        yahoo_success_rate: yahooSuccessRate,
        failed: failedCount,
        fallback_rate: fallbackRate,
        total_processed: totalProcessed
      }
    });
    
    // Log success
    console.log('[DB] Inserting success log...');
    await supabaseClient.from('ingest_logs').insert({
      etl_name: 'ingest-prices-yahoo',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      duration_seconds: Math.round(duration / 1000),
      rows_inserted: inserted,
      rows_updated: 0,
      rows_skipped: skipped,
      source_used: `Alpha: ${alphaSuccessCount}, Yahoo: ${yahooFallbackCount}`,
      fallback_count: yahooFallbackCount
    });
    console.log('[DB] Success log inserted');
    
    return new Response(JSON.stringify({ 
      success: true,
      inserted,
      skipped,
      alpha_success: alphaSuccessCount,
      yahoo_fallback_success: yahooFallbackCount,
      yahoo_fallback_failed: yahooFallbackFailedCount,
      yahoo_success_rate: `${yahooSuccessRate}%`,
      failed: failedCount,
      fallback_rate: `${fallbackRate}%`,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    
    console.log(`\n❌ [FATAL ERROR] ${errorMsg}`);
    console.log(`⏱️  Failed after ${(duration / 1000).toFixed(1)}s`);
    
    // Log failure
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      console.log('[DB] Inserting failure log...');
      await supabaseClient.from('ingest_logs').insert({
        etl_name: 'ingest-prices-yahoo',
        status: 'failure',
        started_at: new Date(startTime).toISOString(),
        duration_seconds: Math.round(duration / 1000),
        error_message: errorMsg
      });
      console.log('[DB] Failure log inserted');
    } catch (logError) {
      console.log(`[DB] ❌ Failed to log error: ${logError}`);
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMsg,
      inserted,
      skipped,
      duration_ms: duration
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
