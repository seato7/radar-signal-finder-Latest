import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// FINRA Short Sale Volume CDN - GUARANTEED DATA SOURCE
// Files are published daily at: https://cdn.finra.org/equity/regsho/daily/
// Format: FNSQshvolYYYYMMDD.txt (NASDAQ/Carteret TRF - largest dataset)
function getFinraShortSaleUrl(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `https://cdn.finra.org/equity/regsho/daily/FNSQshvol${year}${month}${day}.txt`;
}

// Parse FINRA Short Sale Volume file (pipe-delimited)
// Format: Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
function parseFinraShortSaleFile(content: string): Array<{
  date: string;
  ticker: string;
  short_volume: number;
  short_exempt_volume: number;
  total_volume: number;
  market: string;
}> {
  const lines = content.trim().split('\n');
  const records: any[] = [];
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split('|');
    if (parts.length < 6) continue;
    
    const [dateStr, symbol, shortVol, shortExempt, totalVol, market] = parts;
    
    // Skip if not a valid stock symbol (filter out test data)
    if (!symbol || symbol.length > 10 || symbol.includes(' ')) continue;
    
    records.push({
      date: `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`,
      ticker: symbol,
      short_volume: parseInt(shortVol) || 0,
      short_exempt_volume: parseInt(shortExempt) || 0,
      total_volume: parseInt(totalVol) || 0,
      market: market || 'NASDAQ',
    });
  }
  
  return records;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  let supabase: any;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[REAL DATA] Short interest ingestion via FINRA CDN - GUARANTEED SOURCE');

    // Try to fetch the most recent trading day's file
    // Work backwards from today to find the latest available file
    let finraData: any[] = [];
    let fileDate: Date | null = null;
    let sourceUrl = '';
    
    for (let daysBack = 0; daysBack <= 5; daysBack++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() - daysBack);
      
      // Skip weekends
      const dayOfWeek = checkDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      
      const url = getFinraShortSaleUrl(checkDate);
      console.log(`Trying FINRA file: ${url}`);
      
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DataBot/1.0)' }
        });
        
        if (response.ok) {
          const content = await response.text();
          if (content && content.length > 100 && content.includes('|')) {
            finraData = parseFinraShortSaleFile(content);
            fileDate = checkDate;
            sourceUrl = url;
            console.log(`✅ Found FINRA file with ${finraData.length} records`);
            break;
          }
        }
      } catch (err) {
        console.log(`⚠️ Could not fetch ${url}: ${err}`);
      }
    }

    if (finraData.length === 0) {
      console.log('❌ No FINRA short sale data available');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-short-interest', {
        sourcesAttempted: ['FINRA CDN Short Sale Volume Files'],
        reason: 'Could not fetch any recent FINRA short sale files (checked last 5 trading days)'
      });
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-short-interest',
        status: 'failure', // all retries failed = failure, not success
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        error_message: 'No FINRA files available after retrying last 5 trading days',
      });

      return new Response(
        JSON.stringify({ success: false, count: 0, reason: 'No FINRA files available after retrying last 5 trading days' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare ALL records for insertion (no filtering)
    const reportDate = finraData[0]?.date;
    const shortInterestRecords = finraData.map(r => ({
      ticker: r.ticker,
      report_date: r.date,
      short_volume: r.short_volume,
      float_percentage: r.total_volume > 0 ? (r.short_volume / r.total_volume) * 100 : 0,
      days_to_cover: r.total_volume > 0 ? r.short_volume / (r.total_volume / 20) : 0, // Assume 20 trading days
      metadata: {
        source: 'FINRA_CDN',
        market: r.market,
        total_volume: r.total_volume,
        short_exempt_volume: r.short_exempt_volume,
        file_url: sourceUrl,
        data_quality: 'official',
      },
      created_at: new Date().toISOString(),
    }));

    console.log(`Preparing to insert ${shortInterestRecords.length} short interest records`);

    // Delete existing records for this date first
    if (reportDate) {
      const { error: deleteError } = await supabase.from('short_interest').delete().eq('report_date', reportDate);
      if (deleteError) console.log('Delete error (ok if no existing):', deleteError);
    }

    // Insert in batches of 500 for efficiency
    let insertedCount = 0;
    const batchSize = 500;
    for (let i = 0; i < shortInterestRecords.length; i += batchSize) {
      const batch = shortInterestRecords.slice(i, i + batchSize);
      const { data, error } = await supabase.from('short_interest').insert(batch).select('id');
      
      if (error) {
        console.error(`Batch ${Math.floor(i/batchSize)} insert error:`, error.message);
      } else {
        insertedCount += (data?.length || 0);
      }
      
      // Progress logging
      if ((i + batchSize) % 2000 === 0) {
        console.log(`Progress: ${Math.min(i + batchSize, shortInterestRecords.length)}/${shortInterestRecords.length}`);
      }
    }
    
    console.log(`✅ Inserted ${insertedCount}/${shortInterestRecords.length} short interest records from FINRA`);

    const durationMs = Date.now() - startTime;
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-short-interest',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: finraData.length - insertedCount,
      duration_ms: durationMs,
      source_used: 'FINRA_CDN_official',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-short-interest',
      status: insertedCount > 0 ? 'success' : 'partial',
      duration: durationMs,
      rowsInserted: insertedCount,
      rowsSkipped: finraData.length - insertedCount,
      sourceUsed: 'FINRA_CDN_official',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: insertedCount,
        totalRecords: finraData.length,
        fileDate: fileDate?.toISOString().split('T')[0],
        source: 'FINRA_CDN_official - GUARANTEED DATA' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-short-interest:', error);
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-short-interest',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'FINRA_CDN',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-short-interest',
      message: `Short interest ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});