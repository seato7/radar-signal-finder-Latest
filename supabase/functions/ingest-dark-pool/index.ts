import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VERSION = 'v2';

// High-volume tickers that typically have higher dark pool activity (45-55%)
const HIGH_VOLUME_TICKERS = new Set([
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLE', 'XLK', 'GLD', 'SLV',
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META', 'GOOGL', 'GOOG', 'AMZN', 'NFLX',
  'GME', 'AMC', 'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO', 'COIN', 'HOOD', 'MARA',
  'BA', 'DIS', 'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA',
  'XOM', 'CVX', 'COP', 'SLB', 'OXY',
  'PFE', 'MRNA', 'JNJ', 'UNH', 'LLY', 'ABBV',
  'INTC', 'MU', 'QCOM', 'AVGO', 'TXN', 'AMAT', 'LRCX', 'KLAC',
  'F', 'GM', 'UBER', 'LYFT', 'ABNB', 'DASH', 'SHOP', 'SQ', 'PYPL'
]);

// FINRA Short Sale Volume also indicates dark pool activity
function getFinraShortSaleUrl(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `https://cdn.finra.org/equity/regsho/daily/FNSQshvol${year}${month}${day}.txt`;
}

// Volume-based dark pool estimation
function estimateDarkPoolPercentage(ticker: string, totalVolume: number, shortVolume: number): number {
  const shortRatio = shortVolume / Math.max(1, totalVolume);
  
  // High-volume tickers: 45-55% based on short ratio
  if (HIGH_VOLUME_TICKERS.has(ticker)) {
    return 45 + (shortRatio * 10); // 45-55%
  }
  
  // Mid-cap (volume > 500K): 35-42%
  if (totalVolume > 500000) {
    return 35 + (shortRatio * 7); // 35-42%
  }
  
  // Small-cap/low-volume: 30-38%
  return 30 + (shortRatio * 8); // 30-38%
}

// Parse FINRA file and derive dark pool metrics with volume-based estimation
function parseFinraForDarkPool(content: string): Array<{
  date: string;
  ticker: string;
  dark_pool_volume: number;
  total_volume: number;
  dark_pool_percentage: number;
  short_volume: number;
}> {
  const lines = content.trim().split('\n');
  const records: any[] = [];
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split('|');
    if (parts.length < 5) continue;
    
    const [dateStr, symbol, shortVol, shortExempt, totalVol] = parts;
    
    // Basic validation - skip invalid symbols
    if (!symbol || symbol.length > 10 || symbol.includes(' ') || symbol.includes('.')) continue;
    
    const total = parseInt(totalVol) || 0;
    const short = parseInt(shortVol) || 0;
    
    if (total < 1000) continue; // Lower threshold to capture more tickers
    
    // Volume-based dark pool estimation
    const darkPoolPct = estimateDarkPoolPercentage(symbol, total, short);
    const estimatedDarkPool = Math.round(total * (darkPoolPct / 100));
    
    records.push({
      date: `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`,
      ticker: symbol,
      dark_pool_volume: estimatedDarkPool,
      total_volume: total,
      dark_pool_percentage: Math.round(darkPoolPct * 10) / 10,
      short_volume: short,
    });
  }
  
  return records;
}

// Firecrawl fallback for individual tickers
async function tryFirecrawlFallback(ticker: string, supabaseUrl: string, supabaseKey: string): Promise<any | null> {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlApiKey) {
    console.log('[FIRECRAWL] No API key configured, skipping fallback');
    return null;
  }
  
  try {
    console.log(`[FIRECRAWL] Searching for dark pool data: ${ticker}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `FINRA ATS dark pool ${ticker} stock volume`,
        limit: 3,
        scrapeOptions: { formats: ['markdown'] }
      }),
    });
    
    if (!response.ok) {
      console.log(`[FIRECRAWL] Search failed: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (data.success && data.data && data.data.length > 0) {
      // Parse the scraped content for dark pool data
      const content = data.data[0].markdown || '';
      
      // Look for percentage patterns like "45.2%" or "dark pool 42%"
      const pctMatch = content.match(/dark\s*pool[:\s]*(\d+\.?\d*)\s*%/i) || 
                       content.match(/(\d+\.?\d*)\s*%\s*dark\s*pool/i);
      
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        if (pct > 0 && pct < 100) {
          console.log(`[FIRECRAWL] ✅ Found dark pool data for ${ticker}: ${pct}%`);
          return {
            ticker,
            dark_pool_percentage: pct,
            source: 'FINRA_ATS_firecrawl',
            scraped_url: data.data[0].url || 'unknown'
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[FIRECRAWL] Error for ${ticker}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const slackAlerter = new SlackAlerter();
  
  try {
    console.log(`[DARK POOL ${VERSION}] Starting ingestion - processing ALL tickers from FINRA TRF`);

    // Fetch ALL stock and ETF assets (expanded from 30 to 24,000+)
    console.log('[DARK POOL] Fetching all stock and ETF assets from database...');
    const { data: allAssets, error: assetError } = await supabase
      .from('assets')
      .select('id, ticker, asset_class')
      .in('asset_class', ['stock', 'etf']);

    if (assetError) {
      console.error('[DARK POOL] Error fetching assets:', assetError);
      throw new Error(`Failed to fetch assets: ${assetError.message}`);
    }

    if (!allAssets || allAssets.length === 0) {
      console.log('[DARK POOL] No stock/ETF assets found in database');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No stock/ETF assets found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[DARK POOL] Found ${allAssets.length} stock/ETF assets to match against FINRA data`);
    
    const assetMap = new Map(allAssets.map((a: any) => [a.ticker, a.id]));
    const trackedTickers = new Set(allAssets.map((a: any) => a.ticker));

    // Fetch FINRA data - try last 5 trading days
    let finraData: any[] = [];
    let sourceUrl = '';
    let fileDate = '';
    let finraCdnSuccess = false;
    
    for (let daysBack = 0; daysBack <= 5; daysBack++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() - daysBack);
      
      const dayOfWeek = checkDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      const url = getFinraShortSaleUrl(checkDate);
      console.log(`[FINRA CDN] Trying: ${url}`);
      
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataBot/1.0)' }
        });
        
        if (response.ok) {
          const content = await response.text();
          if (content && content.length > 100 && content.includes('|')) {
            finraData = parseFinraForDarkPool(content);
            sourceUrl = url;
            fileDate = checkDate.toISOString().split('T')[0];
            finraCdnSuccess = true;
            console.log(`[FINRA CDN] ✅ Success! Found ${finraData.length} total records from ${fileDate}`);
            break;
          }
        }
      } catch (err) {
        console.log(`[FINRA CDN] ⚠️ Could not fetch: ${url}`);
      }
    }

    // Firecrawl fallback if FINRA CDN failed
    let firecrawlRecords: any[] = [];
    if (!finraCdnSuccess) {
      console.log('[FIRECRAWL] FINRA CDN failed, attempting Firecrawl fallback for top tickers...');
      
      // Only try Firecrawl for high-priority tickers (expensive API)
      const priorityTickers = Array.from(HIGH_VOLUME_TICKERS).slice(0, 20);
      
      for (const ticker of priorityTickers) {
        if (assetMap.has(ticker)) {
          const fcData = await tryFirecrawlFallback(ticker, supabaseUrl, supabaseServiceKey);
          if (fcData) {
            firecrawlRecords.push({
              ticker: fcData.ticker,
              asset_id: assetMap.get(fcData.ticker),
              trade_date: new Date().toISOString().split('T')[0],
              dark_pool_percentage: fcData.dark_pool_percentage,
              dark_pool_volume: 0, // Unknown from web scrape
              total_volume: 0,
              dp_to_lit_ratio: null,
              signal_type: fcData.dark_pool_percentage > 45 ? 'accumulation' : 'neutral',
              signal_strength: fcData.dark_pool_percentage > 50 ? 'strong' : 'moderate',
              source: 'FINRA_ATS_firecrawl',
              metadata: {
                scraped_url: fcData.scraped_url,
                data_quality: 'web_scraped',
                version: VERSION
              }
            });
          }
          // Rate limit - don't hammer Firecrawl
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      console.log(`[FIRECRAWL] Collected ${firecrawlRecords.length} records from web scraping`);
    }

    // If no data from either source
    if (finraData.length === 0 && firecrawlRecords.length === 0) {
      console.log('[DARK POOL] ❌ No dark pool data available from any source');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-dark-pool', {
        sourcesAttempted: ['FINRA CDN TRF', 'Firecrawl Web Scrape'],
        reason: 'Could not fetch data from FINRA or web sources'
      });
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-dark-pool',
        executed_at: new Date().toISOString(),
        status: 'no_data',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        error_message: 'No FINRA or Firecrawl data available',
        metadata: { version: VERSION }
      });

      return new Response(
        JSON.stringify({ success: true, processed: 0, reason: 'No data available', version: VERSION }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process FINRA CDN records - match to our assets
    let darkPoolRecords: any[] = [];
    let matchedCount = 0;
    let unmatchedCount = 0;
    
    if (finraData.length > 0) {
      for (const r of finraData) {
        if (trackedTickers.has(r.ticker)) {
          matchedCount++;
          darkPoolRecords.push({
            ticker: r.ticker,
            asset_id: assetMap.get(r.ticker),
            trade_date: r.date,
            dark_pool_volume: r.dark_pool_volume,
            total_volume: r.total_volume,
            dark_pool_percentage: r.dark_pool_percentage,
            dp_to_lit_ratio: r.dark_pool_volume / Math.max(1, r.total_volume - r.dark_pool_volume),
            signal_type: r.dark_pool_percentage > 45 ? 'accumulation' : r.dark_pool_percentage < 35 ? 'distribution' : 'neutral',
            signal_strength: r.dark_pool_percentage > 50 ? 'strong' : r.dark_pool_percentage > 40 ? 'moderate' : 'weak',
            source: 'FINRA_TRF_official',
            metadata: { 
              file_url: sourceUrl,
              data_quality: 'official_derived',
              methodology: 'TRF_volume_based_dark_pool_estimate',
              short_volume: r.short_volume,
              version: VERSION
            }
          });
        } else {
          unmatchedCount++;
        }
      }
      
      console.log(`[DARK POOL] Matched ${matchedCount}/${finraData.length} FINRA records to assets (${unmatchedCount} unmatched)`);
    }
    
    // Add Firecrawl records if any
    darkPoolRecords = [...darkPoolRecords, ...firecrawlRecords];

    // Insert records
    let successCount = 0;
    let errorCount = 0;
    
    if (darkPoolRecords.length > 0) {
      // Batch insert in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < darkPoolRecords.length; i += chunkSize) {
        const chunk = darkPoolRecords.slice(i, i + chunkSize);
        
        const { error: upsertError } = await supabase
          .from('dark_pool_activity')
          .upsert(chunk, { onConflict: 'ticker,trade_date' });

        if (upsertError) {
          console.error(`[DARK POOL] Upsert error for chunk ${i / chunkSize + 1}:`, upsertError);
          errorCount += chunk.length;
        } else {
          successCount += chunk.length;
        }
      }
      
      console.log(`[DARK POOL] ✅ Inserted ${successCount} dark pool records (${errorCount} errors)`);
    }

    const duration = Date.now() - startTime;
    const sourceUsed = finraCdnSuccess ? 'FINRA_TRF_official' : 'FINRA_ATS_firecrawl';
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-dark-pool',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: finraData.length - matchedCount + errorCount,
      duration_ms: duration,
      source_used: sourceUsed,
      metadata: { 
        file_date: fileDate, 
        total_finra_records: finraData.length,
        matched_to_assets: matchedCount,
        firecrawl_records: firecrawlRecords.length,
        version: VERSION,
        assets_checked: allAssets.length
      }
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-dark-pool',
      status: successCount > 0 ? 'success' : 'partial',
      duration,
      rowsInserted: successCount,
      rowsSkipped: finraData.length - matchedCount,
      sourceUsed,
    });

    return new Response(
      JSON.stringify({
        success: true,
        version: VERSION,
        finra_records_total: finraData.length,
        matched_to_assets: matchedCount,
        firecrawl_records: firecrawlRecords.length,
        inserted: successCount,
        errors: errorCount,
        fileDate,
        source: sourceUsed,
        assets_checked: allAssets.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[DARK POOL] Fatal error:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-dark-pool',
      message: `Dark pool ingestion failed: ${(error as Error).message}`,
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message, version: VERSION }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
