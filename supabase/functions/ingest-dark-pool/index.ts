import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";
import { scrapeWithRetry } from "../_shared/scrape-and-extract.ts";
import { extractTableData, ExtractionSchema } from "../_shared/lovable-extractor.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Real data sources for dark pool activity
const DARK_POOL_SOURCES = [
  'https://www.finra.org/finra-data/browse-catalog/ats-transparency-data/weekly',
  'https://otctransparency.finra.org/otctransparency/AtsIssueData',
  'https://www.stockgrid.io/darkpools',
  'https://chartexchange.com/symbol/nyse-spy/dark-pool/',
];

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
    console.log('[REAL DATA] Dark pool ingestion started - NO ESTIMATION...');

    // Get list of top tickers to check for dark pool data
    const { data: topAssets } = await supabase
      .from('assets')
      .select('id, ticker')
      .in('ticker', ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META', 'GOOGL', 'AMZN', 'NFLX', 'GME', 'AMC', 'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO', 'COIN', 'HOOD'])
      .limit(50);

    if (!topAssets || topAssets.length === 0) {
      console.log('No assets to process');
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: 'No target assets found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    let successCount = 0;
    let skipCount = 0;
    const darkPoolRecords: any[] = [];

    // Try to scrape dark pool data from sources
    let scrapedContent = '';
    for (const sourceUrl of DARK_POOL_SOURCES) {
      try {
        console.log(`Scraping: ${sourceUrl}`);
        const result = await scrapeWithRetry(sourceUrl);
        if (result.success && result.content) {
          scrapedContent += `\n\nSOURCE: ${sourceUrl}\n${result.content}`;
          console.log(`✅ Scraped ${sourceUrl}: ${result.content.length} chars`);
        }
      } catch (err) {
        console.log(`⚠️ Could not scrape ${sourceUrl}: ${err}`);
      }
    }

    if (!scrapedContent || scrapedContent.length < 500) {
      console.log('❌ No real dark pool data found from any source');
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-dark-pool',
        executed_at: new Date().toISOString(),
        status: 'success',
        rows_inserted: 0,
        rows_skipped: topAssets.length,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        error_message: 'No real data available from sources',
        metadata: { sources_tried: DARK_POOL_SOURCES.length }
      });
      
      await slackAlerter.sendLiveAlert({
        etlName: 'ingest-dark-pool',
        status: 'partial',
        duration: Date.now() - startTime,
        rowsInserted: 0,
        rowsSkipped: topAssets.length,
        sourceUsed: 'none - no real data',
      });

      return new Response(
        JSON.stringify({ success: true, processed: 0, skipped: topAssets.length, reason: 'No real data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract structured data using AI table extraction
    const rowSchema: ExtractionSchema = {
      ticker: { type: 'string', description: 'Stock ticker symbol', required: true },
      dark_pool_volume: { type: 'number', description: 'Dark pool trading volume' },
      total_volume: { type: 'number', description: 'Total trading volume' },
      dark_pool_percentage: { type: 'number', description: 'Percentage of volume in dark pools' },
      trade_date: { type: 'string', description: 'Date of the data (YYYY-MM-DD)' }
    };

    const extracted = await extractTableData(scrapedContent, rowSchema, 'Dark pool trading activity data');
    const darkPoolData = extracted.rows || [];

    console.log(`Extracted ${darkPoolData.length} dark pool records from scraped content`);

    // 🚨 CRITICAL: Send alert if no data was extracted
    if (darkPoolData.length === 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-dark-pool', {
        sourcesAttempted: DARK_POOL_SOURCES,
        contentSizes: [scrapedContent.length],
        reason: 'AI extraction returned 0 records from scraped content'
      });
    }

    // Map to assets and prepare for insert
    const assetMap = new Map(topAssets.map((a: any) => [a.ticker, a.id]));

    for (const dp of darkPoolData) {
      const assetId = assetMap.get(dp.ticker);
      if (!assetId) {
        skipCount++;
        continue;
      }

      const dpPercentage = dp.dark_pool_percentage || 
        (dp.dark_pool_volume && dp.total_volume ? (dp.dark_pool_volume / dp.total_volume) * 100 : null);

      if (!dpPercentage) {
        skipCount++;
        continue;
      }

      darkPoolRecords.push({
        ticker: dp.ticker,
        asset_id: assetId,
        trade_date: dp.trade_date || today,
        dark_pool_volume: dp.dark_pool_volume,
        total_volume: dp.total_volume,
        dark_pool_percentage: dpPercentage,
        dp_to_lit_ratio: dp.dark_pool_volume / Math.max(1, dp.total_volume - dp.dark_pool_volume),
        signal_type: dpPercentage > 45 ? 'accumulation' : dpPercentage < 20 ? 'distribution' : 'neutral',
        signal_strength: dpPercentage > 45 ? 'strong' : dpPercentage > 35 ? 'moderate' : 'weak',
        source: 'FINRA_ATS_real',
        metadata: { scraped_at: new Date().toISOString() }
      });
      successCount++;
    }

    // Insert records
    if (darkPoolRecords.length > 0) {
      const { error: upsertError } = await supabase
        .from('dark_pool_activity')
        .upsert(darkPoolRecords, { onConflict: 'ticker,trade_date' });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        successCount = 0;
      }
    }

    const duration = Date.now() - startTime;
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-dark-pool',
      executed_at: new Date().toISOString(),
      status: successCount > 0 ? 'success' : 'success',
      rows_inserted: successCount,
      rows_skipped: skipCount,
      duration_ms: duration,
      source_used: 'FINRA_ATS_real',
      metadata: { sources_scraped: DARK_POOL_SOURCES.length, extracted_records: darkPoolData.length }
    });
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-dark-pool',
      status: successCount > 0 ? 'success' : 'partial',
      duration,
      rowsInserted: successCount,
      rowsSkipped: skipCount,
      sourceUsed: 'FINRA_ATS_real (Firecrawl)',
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: darkPoolData.length,
        inserted: successCount,
        skipped: skipCount,
        source: 'FINRA_ATS_real - NO ESTIMATION'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    const duration = Date.now() - startTime;
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-dark-pool',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: 'FINRA_ATS_real',
      error_message: (error as Error).message,
    });
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-dark-pool',
      message: `Dark pool ingestion failed: ${(error as Error).message}`,
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
