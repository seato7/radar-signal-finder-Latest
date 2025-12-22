import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VERSION = 'v6_real_short_data';

// FINRA Short Sale Volume URL generator
function getFinraShortSaleUrl(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `https://cdn.finra.org/equity/regsho/daily/FNSQshvol${year}${month}${day}.txt`;
}

// Parse FINRA file - REAL short sale data (NOT dark pool)
// IMPORTANT: FINRA short sale data is NOT the same as dark pool data
// This function correctly stores the real short sale volume data
function parseFinraShortSale(content: string): Array<{
  date: string;
  ticker: string;
  short_volume: number;
  total_volume: number;
  short_ratio: number;
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
    
    // Basic validation
    if (!symbol || symbol.length > 10 || symbol.includes(' ') || symbol.includes('.')) continue;
    
    const total = parseInt(totalVol) || 0;
    const short = parseInt(shortVol) || 0;
    
    if (total < 1000) continue;
    
    const shortRatio = short / total;
    
    records.push({
      date: `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`,
      ticker: symbol,
      short_volume: short,
      total_volume: total,
      short_ratio: Math.round(shortRatio * 1000) / 10, // As percentage
    });
  }
  
  return records;
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
    console.log(`[DARK POOL ${VERSION}] REAL SHORT SALE DATA - NO ESTIMATIONS`);
    console.log(`NOTE: FINRA short sale data is stored - dark_pool_volume/percentage set to NULL (not available from this source)`);

    // Fetch all stock and ETF assets
    const { data: allAssets, error: assetError } = await supabase
      .from('assets')
      .select('id, ticker, asset_class')
      .in('asset_class', ['stock', 'etf']);

    if (assetError) throw new Error(`Failed to fetch assets: ${assetError.message}`);

    if (!allAssets || allAssets.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No stock/ETF assets found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${allAssets.length} stock/ETF assets`);
    
    const assetMap = new Map(allAssets.map((a: any) => [a.ticker, a.id]));
    const trackedTickers = new Set(allAssets.map((a: any) => a.ticker));

    // Fetch FINRA data - try last 5 trading days
    let finraData: any[] = [];
    let sourceUrl = '';
    let fileDate = '';
    
    for (let daysBack = 0; daysBack <= 5; daysBack++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() - daysBack);
      
      const dayOfWeek = checkDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends
      
      const url = getFinraShortSaleUrl(checkDate);
      console.log(`[FINRA CDN] Trying: ${url}`);
      
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataBot/1.0)' }
        });
        
        if (response.ok) {
          const content = await response.text();
          if (content && content.length > 100 && content.includes('|')) {
            finraData = parseFinraShortSale(content);
            sourceUrl = url;
            fileDate = checkDate.toISOString().split('T')[0];
            console.log(`[FINRA CDN] ✅ Success! Found ${finraData.length} records from ${fileDate}`);
            break;
          }
        }
      } catch (err) {
        console.log(`[FINRA CDN] ⚠️ Could not fetch: ${url}`);
      }
    }

    // If no FINRA data, return no data - DO NOT generate fake data
    if (finraData.length === 0) {
      console.log('[DARK POOL] ❌ No real FINRA data available - NOT inserting any fake data');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-dark-pool', {
        sourcesAttempted: ['FINRA CDN TRF'],
        reason: 'Could not fetch data from FINRA CDN for any of the last 5 trading days'
      });
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-dark-pool',
        executed_at: new Date().toISOString(),
        status: 'no_data',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        metadata: { version: VERSION, reason: 'finra_unavailable' }
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0, 
          reason: 'No FINRA data available',
          version: VERSION,
          message: 'No real data available - no fake data inserted'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process FINRA CDN records - REAL DATA ONLY - NO ESTIMATIONS
    // IMPORTANT: We store the REAL short sale data, NOT derived dark pool estimates
    const darkPoolRecords: any[] = [];
    let matchedCount = 0;
    
    for (const r of finraData) {
      if (trackedTickers.has(r.ticker)) {
        matchedCount++;
        
        // Store REAL data only - do NOT derive/estimate dark pool percentage
        // dark_pool_volume and dark_pool_percentage are set to NULL because
        // FINRA short sale data is NOT the same as dark pool data
        darkPoolRecords.push({
          ticker: r.ticker,
          asset_id: assetMap.get(r.ticker),
          trade_date: r.date,
          // These are NULL because we don't have real dark pool data from this source
          dark_pool_volume: null,
          dark_pool_percentage: null,
          dp_to_lit_ratio: null,
          // Store the REAL short sale volume in total_volume for reference
          total_volume: r.total_volume,
          // Signal based on actual short ratio (real data)
          signal_type: r.short_ratio > 50 ? 'high_short_interest' : r.short_ratio < 30 ? 'low_short_interest' : 'normal_short_interest',
          signal_strength: r.short_ratio > 60 ? 'strong' : r.short_ratio > 45 ? 'moderate' : 'weak',
          source: 'FINRA_ShortSale_Official',
          metadata: { 
            file_url: sourceUrl,
            data_quality: 'official_real',
            short_volume: r.short_volume,
            short_ratio_pct: r.short_ratio,
            version: VERSION,
            data_type: 'real_short_sale',
            note: 'Short sale data from FINRA - NOT dark pool estimates'
          }
        });
      }
    }
    
    console.log(`Matched ${matchedCount}/${finraData.length} FINRA records to assets`);

    // Insert REAL records only
    let successCount = 0;
    
    if (darkPoolRecords.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < darkPoolRecords.length; i += chunkSize) {
        const chunk = darkPoolRecords.slice(i, i + chunkSize);
        
        const { error: upsertError } = await supabase
          .from('dark_pool_activity')
          .upsert(chunk, { onConflict: 'ticker,trade_date' });

        if (upsertError) {
          console.error(`Upsert error for chunk ${i / chunkSize + 1}:`, upsertError);
        } else {
          successCount += chunk.length;
        }
      }
      
      console.log(`✅ Inserted ${successCount} REAL short sale records - NO ESTIMATIONS/DERIVATIONS`);
    }

    const duration = Date.now() - startTime;
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-dark-pool',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: finraData.length - matchedCount,
      duration_ms: duration,
      source_used: 'FINRA_ShortSale_Official',
      metadata: { 
        file_date: fileDate, 
        total_finra_records: finraData.length,
        matched_to_assets: matchedCount,
        version: VERSION,
        note: 'Real short sale data - dark pool fields NULL'
      }
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-dark-pool',
      status: successCount > 0 ? 'success' : 'partial',
      duration,
      rowsInserted: successCount,
      rowsSkipped: finraData.length - matchedCount,
      sourceUsed: 'FINRA_ShortSale_Official (REAL DATA ONLY)',
    });

    return new Response(
      JSON.stringify({
        success: true,
        version: VERSION,
        finra_records_total: finraData.length,
        matched_to_assets: matchedCount,
        inserted: successCount,
        fileDate,
        source: 'FINRA_ShortSale_Official',
        message: `Inserted ${successCount} REAL short sale records (dark pool fields NULL - no estimation)`
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
