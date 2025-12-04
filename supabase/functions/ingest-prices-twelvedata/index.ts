import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Unified Twelve Data Price Ingestion - SINGLE BATCH PER CALL
 * Version: 2025-12-04-v3 (with checksum fix)
 * 
 * STRICT RATE LIMIT: Exactly 50 symbols per invocation
 * Called once per minute via cron, processes next batch of 50 assets
 * Uses database cursor to track position across all ~1043 assets
 * Full cycle completes in ~21 minutes
 */

const BATCH_SIZE = 50; // STRICT: Stay under 55 credit limit
const TWELVEDATA_API_KEY = Deno.env.get('TWELVEDATA_API_KEY') || '';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    if (!TWELVEDATA_API_KEY) {
      throw new Error('TWELVEDATA_API_KEY not configured');
    }

    // Get current batch offset from database
    const { data: cursorData } = await supabase
      .from('twelvedata_rate_limits')
      .select('credits_used')
      .eq('id', 'batch_cursor')
      .single();
    
    let batchOffset = cursorData?.credits_used ?? 0;
    
    console.log(`🚀 Price ingestion - Batch offset: ${batchOffset}`);

    // Fetch ALL assets with consistent ordering
    const { data: allAssets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker, asset_class')
      .order('asset_class', { ascending: true })
      .order('ticker', { ascending: true });
    
    if (assetsError || !allAssets) {
      throw new Error(`Failed to fetch assets: ${assetsError?.message}`);
    }

    const totalAssets = allAssets.length;
    const totalBatches = Math.ceil(totalAssets / BATCH_SIZE);
    
    // Calculate which assets to process this batch
    const currentBatch = batchOffset % totalBatches;
    const startIndex = currentBatch * BATCH_SIZE;
    const endIndex = Math.min(startIndex + BATCH_SIZE, totalAssets);
    const batchAssets = allAssets.slice(startIndex, endIndex);
    
    console.log(`📊 Processing assets ${startIndex}-${endIndex} of ${totalAssets} (batch ${currentBatch + 1}/${totalBatches})`);

    if (batchAssets.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No assets to process',
        batch_offset: batchOffset
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build symbol mapping
    const tickerToAsset = new Map<string, any>();
    const symbols: string[] = [];
    
    for (const asset of batchAssets) {
      const tdTicker = normalizeTickerForTwelveData(asset.ticker, asset.asset_class);
      tickerToAsset.set(tdTicker, asset);
      symbols.push(tdTicker);
    }

    // SINGLE API call with exactly up to 50 symbols
    console.log(`📡 Fetching ${symbols.length} prices from Twelve Data...`);
    
    const symbolStr = symbols.join(',');
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbolStr)}&apikey=${TWELVEDATA_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`TwelveData API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Parse prices
    const prices = new Map<string, number>();
    
    if (symbols.length === 1 && data.price) {
      prices.set(symbols[0], parseFloat(data.price));
    } else {
      for (const [symbol, priceData] of Object.entries(data)) {
        if (typeof priceData === 'object' && priceData !== null && 'price' in priceData) {
          const price = parseFloat((priceData as any).price);
          if (!isNaN(price) && price > 0) {
            prices.set(symbol, price);
          }
        }
      }
    }
    
    console.log(`✅ Received ${prices.size} prices`);

    // Build price records
    const today = new Date().toISOString().split('T')[0];
    const priceRecords: any[] = [];
    
    for (const [tdTicker, price] of prices) {
      const asset = tickerToAsset.get(tdTicker);
      if (asset && price > 0) {
        // Generate checksum as hash of ticker+date+price
        const checksum = `${asset.ticker}-${today}-${price}`;
        priceRecords.push({
          asset_id: asset.id,
          ticker: asset.ticker,
          date: today,
          close: price,
          checksum: checksum,
          last_updated_at: new Date().toISOString()
        });
      }
    }

    // Upsert to database
    let inserted = 0;
    if (priceRecords.length > 0) {
      const { error: upsertError } = await supabase
        .from('prices')
        .upsert(priceRecords, { 
          onConflict: 'ticker,date',
          ignoreDuplicates: false 
        });
      
      if (upsertError) {
        console.error('❌ Upsert error:', upsertError);
      } else {
        inserted = priceRecords.length;
        console.log(`✅ Upserted ${inserted} prices`);
      }
    }

    // Update batch cursor for next run
    const nextBatchOffset = batchOffset + 1;
    await supabase
      .from('twelvedata_rate_limits')
      .upsert({
        id: 'batch_cursor',
        minute_key: new Date().toISOString(),
        credits_used: nextBatchOffset,
        last_updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    const duration = Date.now() - startTime;

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'ingest-prices-twelvedata',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: batchAssets.length - inserted,
      duration_ms: duration,
      source_used: 'TwelveData',
      metadata: { 
        batch_offset: batchOffset,
        batch_number: currentBatch + 1,
        total_batches: totalBatches,
        symbols_requested: symbols.length,
        prices_received: prices.size,
        api_credits_used: symbols.length
      }
    });

    // Log to ingest_logs
    await supabase.from('ingest_logs').insert({
      etl_name: 'twelvedata-prices',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_seconds: Math.ceil(duration / 1000),
      rows_inserted: inserted,
      source_used: 'TwelveData',
      metadata: { 
        batch: currentBatch + 1, 
        of: totalBatches,
        credits: symbols.length 
      }
    });

    console.log(`✅ Batch ${currentBatch + 1}/${totalBatches} complete: ${inserted}/${batchAssets.length} prices in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        batch: currentBatch + 1,
        total_batches: totalBatches,
        assets_in_batch: batchAssets.length,
        prices_fetched: prices.size,
        prices_inserted: inserted,
        duration_ms: duration,
        api_credits_used: symbols.length,
        next_batch_offset: nextBatchOffset
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Error:', error);

    await supabase.from('function_status').insert({
      function_name: 'ingest-prices-twelvedata',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      duration_ms: duration,
      source_used: 'TwelveData',
      error_message: (error as Error).message
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
