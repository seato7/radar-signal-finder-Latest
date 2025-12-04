import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWELVEDATA_API_KEY = Deno.env.get('TWELVEDATA_API_KEY') || '';
const MAX_CREDITS_PER_MINUTE = 50; // Safe limit (actual 55)
const MAX_SYMBOLS_PER_BATCH = 20;
const BATCH_DELAY_MS = 3500; // 3.5s between batches for safety

interface Asset {
  id: string;
  ticker: string;
  asset_class: string;
}

interface CreditAcquireResult {
  acquired: boolean;
  current_credits: number;
  wait_seconds: number;
}

// Ticker normalization for TwelveData
const TICKER_MAPPINGS: Record<string, string> = {
  'CRUDE': 'CL1', 'BRENT': 'BRN1', 'NATGAS': 'NG1',
  'XAUUSD': 'XAU/USD', 'XAGUSD': 'XAG/USD', 'XPTUSD': 'XPT/USD', 'XPDUSD': 'XPD/USD',
  'GOLD': 'XAU/USD', 'SILVER': 'XAG/USD', 'OIL': 'CL1', 'WTI': 'CL1',
  'COPPER': 'HG1', 'PLATINUM': 'XPT/USD', 'PALLADIUM': 'XPD/USD',
  'WHEAT': 'ZW1', 'CORN': 'ZC1', 'SOYBEANS': 'ZS1',
  'COFFEE': 'KC1', 'SUGAR': 'SB1', 'COTTON': 'CT1', 'VIX': 'VIX'
};

function normalizeTickerForTwelveData(ticker: string, assetClass: string): string {
  const upper = ticker.toUpperCase().trim();
  
  if (TICKER_MAPPINGS[upper]) return TICKER_MAPPINGS[upper];
  
  if (assetClass === 'crypto') {
    if (upper.includes('/USDT')) return upper.replace('/USDT', '/USD');
    if (!upper.includes('/USD') && !upper.includes('-USD')) {
      const base = upper.replace('-', '').replace('/', '');
      return `${base}/USD`;
    }
    return upper.replace('-', '/');
  }
  
  if (assetClass === 'forex') {
    const clean = upper.replace('=X', '');
    if (!clean.includes('/') && clean.length === 6) {
      return `${clean.slice(0, 3)}/${clean.slice(3)}`;
    }
    return clean;
  }
  
  return upper;
}

async function acquireCredits(
  supabaseClient: any,
  creditsNeeded: number
): Promise<boolean> {
  const maxAttempts = 10;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabaseClient.rpc('acquire_twelvedata_credits', {
      credits_needed: creditsNeeded,
      max_credits: MAX_CREDITS_PER_MINUTE
    }) as { data: CreditAcquireResult[] | null; error: any };
    
    if (error) {
      console.error('❌ Error acquiring credits:', error);
      return false;
    }
    
    const result = data?.[0];
    if (!result) {
      console.error('❌ No result from acquire_twelvedata_credits');
      return false;
    }
    
    if (result.acquired) {
      console.log(`✅ Acquired ${creditsNeeded} credits. Total: ${result.current_credits}/${MAX_CREDITS_PER_MINUTE}`);
      return true;
    }
    
    console.log(`⏳ Credit limit (${result.current_credits}/${MAX_CREDITS_PER_MINUTE}). Waiting ${result.wait_seconds}s...`);
    await new Promise(resolve => setTimeout(resolve, result.wait_seconds * 1000));
  }
  
  console.error('❌ Failed to acquire credits after max attempts');
  return false;
}

async function fetchPriceBatch(
  symbols: string[],
  supabaseClient: any
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  
  if (symbols.length === 0) return results;
  if (symbols.length > MAX_SYMBOLS_PER_BATCH) {
    symbols = symbols.slice(0, MAX_SYMBOLS_PER_BATCH);
  }
  
  // Acquire credits
  const acquired = await acquireCredits(supabaseClient, symbols.length);
  if (!acquired) {
    console.log(`⚠️ Could not acquire credits for batch of ${symbols.length}`);
    return results;
  }
  
  const symbolStr = symbols.join(',');
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbolStr)}&apikey=${TWELVEDATA_API_KEY}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 429) {
        console.warn('⚠️ Rate limited by TwelveData API');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      return results;
    }
    
    const data = await response.json();
    
    if (symbols.length === 1) {
      if (data.price) {
        results.set(symbols[0], parseFloat(data.price));
      }
    } else {
      for (const [symbol, priceData] of Object.entries(data)) {
        if (typeof priceData === 'object' && priceData !== null && 'price' in priceData) {
          results.set(symbol, parseFloat((priceData as any).price));
        }
      }
    }
    
  } catch (error) {
    console.error(`Error fetching batch: ${error}`);
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const slackAlerter = new SlackAlerter();

  // Parse request body for optional asset_class filter
  let targetAssetClass: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    targetAssetClass = body.asset_class || null;
  } catch {
    // No body or invalid JSON
  }

  try {
    console.log(`📊 Starting TwelveData price ingestion${targetAssetClass ? ` for ${targetAssetClass}` : ' for all assets'}...`);

    if (!TWELVEDATA_API_KEY) {
      throw new Error('TWELVEDATA_API_KEY not configured');
    }

    // Get assets
    let query = supabaseClient.from('assets').select('id, ticker, asset_class');
    if (targetAssetClass) {
      query = query.eq('asset_class', targetAssetClass);
    }
    
    const { data: assets, error: assetsError } = await query;
    if (assetsError) throw assetsError;

    console.log(`Found ${assets.length} assets to process`);

    // Group by asset class and normalize tickers
    const tickerToAsset = new Map<string, Asset>();
    for (const asset of assets as Asset[]) {
      const tdTicker = normalizeTickerForTwelveData(asset.ticker, asset.asset_class);
      tickerToAsset.set(tdTicker, asset);
    }

    const allTickers = Array.from(tickerToAsset.keys());
    const totalBatches = Math.ceil(allTickers.length / MAX_SYMBOLS_PER_BATCH);
    
    console.log(`📦 Processing ${allTickers.length} tickers in ${totalBatches} batches`);

    let successCount = 0;
    let failCount = 0;
    const today = new Date().toISOString().split('T')[0];
    const priceRecords: any[] = [];

    // Process in batches
    for (let i = 0; i < allTickers.length; i += MAX_SYMBOLS_PER_BATCH) {
      const batch = allTickers.slice(i, i + MAX_SYMBOLS_PER_BATCH);
      const batchNum = Math.floor(i / MAX_SYMBOLS_PER_BATCH) + 1;
      
      console.log(`📦 Batch ${batchNum}/${totalBatches}: ${batch.length} symbols`);
      
      const prices = await fetchPriceBatch(batch, supabaseClient);
      
      for (const [tdTicker, price] of prices) {
        const asset = tickerToAsset.get(tdTicker);
        if (asset && price > 0) {
          priceRecords.push({
            asset_id: asset.id,
            ticker: asset.ticker,
            date: today,
            close: price,
            provider: 'twelvedata',
            updated_at: new Date().toISOString()
          });
          successCount++;
        }
      }
      
      failCount += batch.length - prices.size;
      
      // Delay between batches
      if (i + MAX_SYMBOLS_PER_BATCH < allTickers.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Upsert prices to database
    if (priceRecords.length > 0) {
      const { error: upsertError } = await supabaseClient
        .from('prices')
        .upsert(priceRecords, { 
          onConflict: 'asset_id,date',
          ignoreDuplicates: false 
        });
      
      if (upsertError) {
        console.error('❌ Error upserting prices:', upsertError);
      } else {
        console.log(`✅ Upserted ${priceRecords.length} prices`);
      }
    }

    const duration = Date.now() - startTime;
    const etlName = targetAssetClass 
      ? `ingest-prices-twelvedata-${targetAssetClass}` 
      : 'ingest-prices-twelvedata';

    // Log to function_status
    await supabaseClient.from('function_status').insert({
      function_name: etlName,
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: failCount,
      duration_ms: duration,
      source_used: 'TwelveData',
      metadata: { 
        total_assets: assets.length,
        batches_processed: totalBatches,
        target_asset_class: targetAssetClass
      }
    });

    // Log to ingest_logs
    await supabaseClient.from('ingest_logs').insert({
      etl_name: etlName,
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round(duration / 1000),
      rows_inserted: successCount,
      rows_skipped: failCount,
      source_used: 'TwelveData',
      metadata: { total_assets: assets.length, batches: totalBatches }
    });

    // Slack notification
    await slackAlerter.sendLiveAlert({
      etlName,
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: failCount,
      sourceUsed: 'TwelveData',
      metadata: { total_assets: assets.length }
    });

    console.log(`✅ Completed: ${successCount}/${assets.length} prices in ${(duration/1000).toFixed(1)}s`);

    return new Response(
      JSON.stringify({
        success: true,
        total_assets: assets.length,
        prices_fetched: successCount,
        failed: failCount,
        duration_ms: duration,
        batches: totalBatches
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Fatal error:', error);

    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-prices-twelvedata',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      duration_ms: duration,
      source_used: 'TwelveData',
      error_message: (error as Error).message
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-prices-twelvedata',
      status: 'failed',
      duration,
      rowsInserted: 0,
      rowsSkipped: 0,
      sourceUsed: 'TwelveData',
      metadata: { error: (error as Error).message }
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
