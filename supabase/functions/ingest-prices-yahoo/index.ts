import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from '../_shared/slack-alerts.ts';
import { logAPIUsage } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Exotic commodities that need Perplexity fallback (no reliable Yahoo data)
const EXOTIC_TICKERS = new Set([
  'COBALT', 'LITHIUM', 'NICKEL', 'RHODIUM', 'STEEL', 'TIN', 'URANIUM', 
  'ZINC', 'LBS', 'MWE', 'ZO', 'ZW', 'COPPER', 'XPTUSD', 'XPDUSD'
]);

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

// Perplexity fallback for exotic commodities
async function fetchFromPerplexity(
  ticker: string,
  assetName: string,
  supabaseClient: any
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  const apiStartTime = Date.now();
  const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
  
  if (!perplexityKey) {
    return { success: false, error: 'Perplexity API key not configured' };
  }
  
  try {
    const prompt = `What is the current spot price of ${assetName} (${ticker}) in USD? 
    Return ONLY a JSON object with this exact format: {"price": <number>, "date": "<YYYY-MM-DD>"}
    No explanation, just the JSON.`;
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: 'You are a financial data assistant. Return only valid JSON with no markdown formatting.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 100,
      }),
    });
    
    if (!response.ok) {
      await logAPIUsage(supabaseClient, {
        api_name: 'Perplexity',
        endpoint: '/chat/completions',
        function_name: 'ingest-prices-yahoo',
        status: 'failure',
        response_time_ms: Date.now() - apiStartTime,
        error_message: `HTTP ${response.status}`
      });
      return { success: false, error: `Perplexity HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return { success: false, error: 'Could not parse Perplexity response' };
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    const price = parseFloat(parsed.price);
    const date = parsed.date || new Date().toISOString().split('T')[0];
    
    if (isNaN(price) || price <= 0) {
      return { success: false, error: 'Invalid price from Perplexity' };
    }
    
    const checksum = await generateChecksum(`${ticker}|${date}|${price}`);
    
    await logAPIUsage(supabaseClient, {
      api_name: 'Perplexity',
      endpoint: '/chat/completions',
      function_name: 'ingest-prices-yahoo',
      status: 'success',
      response_time_ms: Date.now() - apiStartTime
    });
    
    return {
      success: true,
      data: [{
        ticker,
        asset_id: '',
        date,
        close: price,
        checksum,
        last_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]
    };
  } catch (error) {
    await logAPIUsage(supabaseClient, {
      api_name: 'Perplexity',
      endpoint: '/chat/completions',
      function_name: 'ingest-prices-yahoo',
      status: 'failure',
      response_time_ms: Date.now() - apiStartTime,
      error_message: (error as Error).message
    });
    return { success: false, error: (error as Error).message };
  }
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

// Comprehensive ticker mappings for Yahoo Finance
const TICKER_MAPPINGS: Record<string, string> = {
  // Commodities - Yahoo uses futures symbols
  'CRUDE': 'CL=F',
  'BRENT': 'BZ=F',
  'NATGAS': 'NG=F',
  'XAUUSD': 'GC=F',
  'XAGUSD': 'SI=F',
  'XPTUSD': 'PL=F',
  'XPDUSD': 'PA=F',
  'COPPER': 'HG=F',
  'LITHIUM': 'ALB',  // Use Albemarle as proxy
  'COBALT': 'SBSW',  // Use Sibanye as proxy
  'NICKEL': 'VALE',  // Use Vale as proxy
  'URANIUM': 'CCJ',  // Use Cameco as proxy
  'STEEL': 'X',      // US Steel as proxy
  'ZINC': 'ZINC.L',  // London zinc ETF
  'TIN': 'TIN.L',    // London tin
  'RHODIUM': 'SBSW', // Proxy
  'VIX': '^VIX',
  'LBS': 'LBS=F',    // Lumber
  'MWE': 'MWE=F',    // Spring Wheat
  'ZO': 'ZO=F',      // Oats
  'ZW': 'ZW=F',      // Wheat
  
  // Crypto - Convert USDT pairs to USD pairs
  'BTC/USDT': 'BTC-USD',
  'ETH/USDT': 'ETH-USD',
  'SOL/USDT': 'SOL-USD',
  'XRP/USDT': 'XRP-USD',
  'ADA/USDT': 'ADA-USD',
  'DOGE/USDT': 'DOGE-USD',
  'DOT/USDT': 'DOT-USD',
  'AVAX/USDT': 'AVAX-USD',
  'MATIC/USDT': 'MATIC-USD',
  'LINK/USDT': 'LINK-USD',
  'LTC/USDT': 'LTC-USD',
  'UNI/USDT': 'UNI-USD',
  'ATOM/USDT': 'ATOM-USD',
  'XLM/USDT': 'XLM-USD',
  'ALGO/USDT': 'ALGO-USD',
  'NEAR/USDT': 'NEAR-USD',
  'FIL/USDT': 'FIL-USD',
  'AAVE/USDT': 'AAVE-USD',
  'MANA/USDT': 'MANA-USD',
  'SAND/USDT': 'SAND-USD',
  'AXS/USDT': 'AXS-USD',
  'THETA/USDT': 'THETA-USD',
  'VET/USDT': 'VET-USD',
  'FTM/USDT': 'FTM-USD',
  'HBAR/USDT': 'HBAR-USD',
  'ICP/USDT': 'ICP-USD',
  'GRT/USDT': 'GRT-USD',
  'GRT/USD': 'GRT-USD',
  'CRV/USDT': 'CRV-USD',
  'MKR/USDT': 'MKR-USD',
  'SNX/USDT': 'SNX-USD',
  'COMP/USDT': 'COMP-USD',
  'COMP/USD': 'COMP-USD',
  'YFI/USDT': 'YFI-USD',
  'YFI/USD': 'YFI-USD',
  'SUSHI/USDT': 'SUSHI-USD',
  'ENJ/USDT': 'ENJ-USD',
  'BAT/USDT': 'BAT-USD',
  'ZRX/USDT': 'ZRX-USD',
  'ZRX/USD': 'ZRX-USD',
  'ZEC/USDT': 'ZEC-USD',
  'ZEC/USD': 'ZEC-USD',
  'DASH/USDT': 'DASH-USD',
  'XMR/USDT': 'XMR-USD',
  'XMR/USD': 'XMR-USD',
  'WAVES/USDT': 'WAVES-USD',
  'ZIL/USDT': 'ZIL-USD',
  'ZIL/USD': 'ZIL-USD',
  'ONE/USDT': 'ONE-USD',
  'KAVA/USDT': 'KAVA-USD',
  'CELO/USDT': 'CELO-USD',
  'ANKR/USDT': 'ANKR-USD',
  'STORJ/USDT': 'STORJ-USD',
  'SKL/USDT': 'SKL-USD',
  'REN/USDT': 'REN-USD',
  'BAND/USDT': 'BAND-USD',
  'BAL/USDT': 'BAL-USD',
  'APE/USDT': 'APE-USD',
  'OP/USDT': 'OP-USD',
  'ARB/USDT': 'ARB-USD',
  'IMX/USDT': 'IMX-USD',
  'IMX/USD': 'IMX-USD',
  'LDO/USDT': 'LDO-USD',
  'APT/USDT': 'APT-USD',
  'SHIB/USDT': 'SHIB-USD',
  'PEPE/USDT': 'PEPE-USD',
  'PEPE/USD': 'PEPE-USD',
  'FLOKI/USDT': 'FLOKI-USD',
  'BNB/USDT': 'BNB-USD',
  'TRX/USDT': 'TRX-USD',
  'EGLD/USDT': 'EGLD-USD',
  'FLOW/USDT': 'FLOW-USD',
  'MINA/USDT': 'MINA-USD',
  'OCEAN/USDT': 'OCEAN-USD',
  'FET/USDT': 'FET-USD',
  'AGIX/USDT': 'AGIX-USD',
  'RUNE/USDT': 'RUNE-USD',
  'GALA/USDT': 'GALA-USD',
  'ROSE/USDT': 'ROSE-USD',
  'CKB/USDT': 'CKB-USD',
  'ICX/USDT': 'ICX-USD',
  'DCR/USDT': 'DCR-USD',
  '1INCH/USDT': '1INCH-USD',
  'STRK/USDT': 'STRK-USD',
  'XRP/BTC': 'XRP-USD',
  'XRP/EUR': 'XRP-EUR',
  'UNI/ETH': 'UNI-USD',
};

function normalizeTickerForYahoo(ticker: string, assetClass?: string): string {
  // Check for direct mapping first
  if (TICKER_MAPPINGS[ticker]) {
    return TICKER_MAPPINGS[ticker];
  }
  
  // Crypto - convert USDT to USD
  if (assetClass === 'crypto' || ticker.includes('/USDT')) {
    const converted = ticker.replace('/USDT', '-USD').replace(/\//g, '-');
    return converted;
  }
  
  // Crypto USD pairs
  if (ticker.includes('/USD') && !ticker.includes('/USDT')) {
    return ticker.replace('/', '-');
  }
  
  // Forex pairs
  if (assetClass === 'forex' || /^[A-Z]{3}\/[A-Z]{3}$/.test(ticker)) {
    return ticker.replace('/', '') + '=X';
  }
  
  // Commodities - add futures suffix
  if (assetClass === 'commodity' && !ticker.endsWith('=F') && !ticker.includes('=') && ticker.length <= 6) {
    return ticker + '=F';
  }
  
  // Default - replace dots with dashes
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
    }, 3);
    
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

// Upsert prices in small chunks to avoid DB timeouts
async function upsertPricesInChunks(
  supabaseClient: any,
  prices: PriceData[],
  chunkSize: number = 50
): Promise<{ success: boolean; error?: string }> {
  for (let i = 0; i < prices.length; i += chunkSize) {
    const chunk = prices.slice(i, i + chunkSize);
    
    const { error } = await supabaseClient
      .from('prices')
      .upsert(chunk, {
        onConflict: 'ticker,date',
        ignoreDuplicates: false
      });
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    // Small delay between chunks
    if (i + chunkSize < prices.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return { success: true };
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
    const BATCH_SIZE = 10; // Reduced from 20 to 10
    
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
    
    const { data: logEntry, error: logError } = await supabaseClient
      .from('ingest_logs')
      .insert({
        etl_name: 'ingest-prices-yahoo',
        status: 'running',
        started_at: new Date().toISOString(),
        metadata: { execution_id: executionId, batch_id: batchId, batch_size: batchAssets.length }
      })
      .select()
      .single();
    
    if (logError || !logEntry) {
      console.error(`⚠️ Failed to create log entry: ${logError?.message}`);
      throw new Error(`Failed to create log entry: ${logError?.message}`);
    }
    
    const logId = logEntry.id;
    console.log(`📝 Created log entry with ID: ${logId}`);
    
    let inserted = 0;
    let successCount = 0;
    let failedCount = 0;
    const errorDetails: string[] = [];
    
    // SEQUENTIAL processing - one ticker at a time to avoid DB overload
    for (const asset of batchAssets) {
      const ticker = asset.ticker;
      
      if (!ticker || ticker.length > 10) {
        failedCount++;
        errorDetails.push(`${ticker}: Invalid ticker`);
        continue;
      }
      
      console.log(`  📈 Processing ${ticker}...`);
      
      let result = await fetchFromYahoo(ticker, asset.asset_class || 'stock', supabaseClient);
      let sourceUsed = 'Yahoo Finance';
      
      // If Yahoo fails, try Perplexity fallback for exotic commodities OR crypto that failed
      const shouldTryPerplexity = !result.success || !result.data || result.data.length === 0;
      const isExoticOrCrypto = EXOTIC_TICKERS.has(ticker) || asset.asset_class === 'crypto' || asset.asset_class === 'commodity';
      
      if (shouldTryPerplexity && isExoticOrCrypto) {
        console.log(`  🔄 Yahoo failed for ${ticker}, trying Perplexity fallback...`);
        result = await fetchFromPerplexity(ticker, asset.name || ticker, supabaseClient);
        sourceUsed = 'Perplexity';
      }
      
      if (!result.success || !result.data || result.data.length === 0) {
        failedCount++;
        errorDetails.push(`${ticker}: ${result.error || 'No data'}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }
      
      const prices: PriceData[] = result.data!;
      prices.forEach((p: PriceData) => p.asset_id = asset.id);
      
      // Upsert in small chunks
      const upsertResult = await upsertPricesInChunks(supabaseClient, prices, 50);
      
      if (!upsertResult.success) {
        failedCount++;
        errorDetails.push(`${ticker}: ${upsertResult.error}`);
      } else {
        inserted += prices.length;
        successCount++;
        console.log(`  ✅ ${ticker}: ${prices.length} prices`);
      }
      
      // Delay between tickers to prevent DB overload
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    const duration = Date.now() - startTime;
    const successRate = batchAssets.length > 0 ? successCount / batchAssets.length : 0;
    const logStatus = successRate >= 0.5 ? 'success' : 'failure'; // 50%+ is success
    const functionStatus = successRate >= 0.5 ? 'success' : 'failure';
    
    console.log(`🔄 Updating log ${logId} with status: ${logStatus} (${successCount}/${batchAssets.length} = ${(successRate * 100).toFixed(1)}%)`);
    
    // UPDATE the existing log entry
    const { data: updateData, error: updateError } = await supabaseClient
      .from('ingest_logs')
      .update({
        status: logStatus,
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round(duration / 1000),
        rows_inserted: inserted,
        rows_skipped: failedCount,
        source_used: 'Yahoo Finance',
        metadata: {
          execution_id: executionId,
          batch_id: batchId,
          batch_size: batchAssets.length,
          tickers_processed: successCount + failedCount,
          success: successCount,
          failed: failedCount,
          success_rate: (successRate * 100).toFixed(1),
          error_sample: errorDetails.slice(0, 5),
          partial_success: failedCount > 0 && successCount > 0
        }
      })
      .eq('id', logId)
      .select();
    
    if (updateError) {
      console.error(`❌ UPDATE ERROR for log ${logId}: ${updateError.message}`);
    } else if (!updateData || updateData.length === 0) {
      console.error(`⚠️ UPDATE returned no rows for log ${logId}`);
    } else {
      console.log(`✅ Successfully updated log ${logId}`);
    }
    
    // Insert function_status heartbeat
    await supabaseClient
      .from('function_status')
      .insert({
        function_name: 'ingest-prices-yahoo',
        status: functionStatus,
        executed_at: new Date().toISOString(),
        duration_ms: Math.round(duration),
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
    
    // Send Slack alert on failures
    if (logStatus !== 'success') {
      await slackAlerter.sendLiveAlert({
        etlName: `ingest-prices-yahoo-batch-${batchId}`,
        status: 'failed',
        duration,
        sourceUsed: 'Yahoo Finance',
        rowsInserted: inserted,
        rowsSkipped: failedCount,
        metadata: {
          execution_id: executionId,
          batch_id: batchId,
          error_sample: errorDetails.slice(0, 3)
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
