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

// Simple retry with exponential backoff
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// Generate SHA256 checksum
async function generateChecksum(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Fetch from Alpha Vantage (Primary)
async function fetchFromAlphaVantage(
  ticker: string,
  apiKey: string
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const rawData = await response.json();
    
    if (rawData['Error Message']) {
      return { success: false, error: rawData['Error Message'] };
    }
    
    if (rawData['Note']) {
      return { success: false, error: 'Rate limit exceeded' };
    }
    
    const timeSeries = rawData['Time Series (Daily)'];
    if (!timeSeries) {
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
    
    return { success: true, data: prices };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

// Fetch from Yahoo Finance (Fallback)
async function fetchFromYahoo(
  ticker: string
): Promise<{ success: boolean; data?: PriceData[]; error?: string }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const rawData = await response.json();
    const result = rawData?.chart?.result?.[0];
    
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
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
    
    return { success: true, data: prices };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    
    console.log('🚀 Start:', new Date().toISOString());
    
    // Log start
    await supabaseClient.from('ingest_logs').insert({
      etl_name: 'ingest-prices-yahoo',
      status: 'running',
      started_at: new Date().toISOString()
    });
    
    // Fetch assets
    const { data: allAssets, error: assetsError } = await supabaseClient
      .from('assets')
      .select('*')
      .limit(1000);
    
    if (assetsError) throw assetsError;
    
    // CRITICAL: Cap to 20 tickers to prevent timeouts
    const MAX_TICKERS = 20;
    const TIMEOUT_MS = 240000; // 4 minutes
    const assets = (allAssets || []).slice(0, MAX_TICKERS);
    
    console.log(`📊 Processing ${assets.length} of ${allAssets?.length || 0} total assets`);
    
    const timeoutAt = startTime + TIMEOUT_MS;
    
    for (const asset of assets) {
      // Check timeout
      if (Date.now() >= timeoutAt) {
        console.error('⏱️ TIMEOUT: Exceeded 4 minutes');
        throw new Error('INGESTION_TIMEOUT');
      }
      
      const ticker = asset.ticker;
      
      // Try Alpha Vantage (Primary)
      console.log(`📡 Fetching ${ticker} from Alpha Vantage (PRIMARY)`);
      const alphaResult = await retry(() => fetchFromAlphaVantage(ticker, alphaVantageKey));
      
      let prices: PriceData[] | null = null;
      let sourceUsed = '';
      
      if (alphaResult.success && alphaResult.data) {
        console.log(`✅ Alpha Vantage SUCCESS for ${ticker} (${alphaResult.data.length} prices)`);
        prices = alphaResult.data;
        sourceUsed = 'Alpha Vantage';
        alphaSuccessCount++;
      } else {
        console.warn(`⚠️ Alpha Vantage FAILED for ${ticker}: ${alphaResult.error}`);
        
        // Fallback to Yahoo
        console.log(`📡 Fetching ${ticker} from Yahoo Finance (FALLBACK)`);
        const yahooResult = await retry(() => fetchFromYahoo(ticker));
        
        if (yahooResult.success && yahooResult.data) {
          console.log(`✅ Yahoo Finance FALLBACK SUCCESS for ${ticker} (${yahooResult.data.length} prices)`);
          prices = yahooResult.data;
          sourceUsed = 'Yahoo Finance (Fallback)';
          yahooFallbackCount++;
        } else {
          console.error(`❌ Both sources FAILED for ${ticker}`);
          failedCount++;
          skipped++;
          continue;
        }
      }
      
      if (!prices || prices.length === 0) {
        skipped++;
        continue;
      }
      
      // Set asset_id
      prices.forEach(p => p.asset_id = asset.id);
      
      // Insert into database
      const { error: insertError } = await supabaseClient
        .from('prices')
        .upsert(prices, { onConflict: 'checksum', ignoreDuplicates: true });
      
      if (insertError) {
        console.error(`❌ Failed to insert ${ticker}: ${insertError.message}`);
        skipped++;
      } else {
        inserted += prices.length;
        console.log(`✅ Inserted ${prices.length} prices for ${ticker} from ${sourceUsed}`);
      }
    }
    
    const duration = Date.now() - startTime;
    const fallbackRate = assets.length > 0 
      ? ((yahooFallbackCount / assets.length) * 100).toFixed(1)
      : '0.0';
    
    console.log(`✅ COMPLETED in ${(duration / 1000).toFixed(1)}s`);
    console.log(`📊 Stats: ${alphaSuccessCount} Alpha / ${yahooFallbackCount} Yahoo / ${failedCount} failed`);
    console.log(`📈 Fallback rate: ${fallbackRate}%`);
    
    // Log success
    await supabaseClient.from('ingest_logs').insert({
      etl_name: 'ingest-prices-yahoo',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      finished_at: new Date().toISOString(),
      rows_inserted: inserted,
      rows_updated: 0,
      rows_skipped: skipped,
      source_used: `Alpha: ${alphaSuccessCount}, Yahoo: ${yahooFallbackCount}`,
      fallback_count: yahooFallbackCount
    });
    
    return new Response(JSON.stringify({ 
      success: true,
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
    
    // Log failure
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      await supabaseClient.from('ingest_logs').insert({
        etl_name: 'ingest-prices-yahoo',
        status: 'failed',
        started_at: new Date(startTime).toISOString(),
        finished_at: new Date().toISOString(),
        error_message: errorMsg
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
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
