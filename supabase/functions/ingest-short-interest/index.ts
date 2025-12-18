import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { scrapeWithRetry } from "../_shared/scrape-and-extract.ts";
import { extractTableData, ExtractionSchema } from "../_shared/lovable-extractor.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Real short interest data sources
const SHORT_INTEREST_SOURCES = [
  'https://www.finra.org/finra-data/short-sale-volume-daily',
  'https://www.nasdaqtrader.com/trader.aspx?id=shortinterest',
  'https://www.highshortinterest.com/',
  'https://fintel.io/ss/us/gme',
  'https://shortsqueeze.com/',
];

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

    console.log('[REAL DATA] Short interest ingestion - NO ESTIMATION...');

    // Scrape short interest data
    let scrapedContent = '';
    let sourceUsed = '';
    
    for (const sourceUrl of SHORT_INTEREST_SOURCES) {
      try {
        console.log(`Scraping short interest: ${sourceUrl}`);
        const result = await scrapeWithRetry(sourceUrl);
        if (result.success && result.content && result.content.length > 300) {
          scrapedContent += `\n\nSOURCE: ${sourceUrl}\n${result.content}`;
          sourceUsed = sourceUrl;
          console.log(`✅ Scraped: ${result.content.length} chars`);
        }
      } catch (err) {
        console.log(`⚠️ Could not scrape ${sourceUrl}`);
      }
    }

    if (!scrapedContent || scrapedContent.length < 500) {
      console.log('❌ No real short interest data available');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-short-interest',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        error_message: 'No real data from short interest sources',
      });

      await slackAlerter.sendLiveAlert({
        etlName: 'ingest-short-interest',
        status: 'partial',
        duration: Date.now() - startTime,
        rowsInserted: 0,
        rowsSkipped: 0,
        sourceUsed: 'none - no real data',
      });

      return new Response(
        JSON.stringify({ success: true, count: 0, reason: 'No real short interest data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract structured short interest data
    const rowSchema: ExtractionSchema = {
      ticker: { type: 'string', description: 'Stock ticker symbol', required: true },
      short_volume: { type: 'number', description: 'Short interest volume (number of shares short)' },
      float_percentage: { type: 'number', description: 'Short interest as percentage of float' },
      days_to_cover: { type: 'number', description: 'Days to cover ratio' },
      report_date: { type: 'string', description: 'Date of the data (YYYY-MM-DD)' }
    };

    const extracted = await extractTableData(scrapedContent, rowSchema, 'Short interest and short sale data');
    const shortInterestData = extracted.rows || [];

    console.log(`Extracted ${shortInterestData.length} short interest records`);

    if (shortInterestData.length === 0) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-short-interest',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: sourceUsed || 'scraped',
        error_message: 'No extractable short interest data in content',
      });

      return new Response(
        JSON.stringify({ success: true, count: 0, reason: 'No extractable short interest data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Prepare records for insert
    const shortData = shortInterestData.map((si: any) => ({
      ticker: si.ticker,
      report_date: si.report_date || today,
      short_volume: si.short_volume,
      float_percentage: si.float_percentage || 0,
      days_to_cover: si.days_to_cover || 0,
      metadata: {
        source: sourceUsed,
        data_quality: 'real',
        scraped_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    }));

    // Insert records
    let insertedCount = 0;
    if (shortData.length > 0) {
      const { error } = await supabase
        .from('short_interest')
        .insert(shortData);

      if (error) {
        console.error('Insert error:', error);
      } else {
        insertedCount = shortData.length;
        console.log(`Inserted ${insertedCount} short interest records`);
      }
    }

    const durationMs = Date.now() - startTime;
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-short-interest',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: shortInterestData.length - insertedCount,
      duration_ms: durationMs,
      source_used: 'Short_interest_real',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-short-interest',
      status: insertedCount > 0 ? 'success' : 'partial',
      duration: durationMs,
      rowsInserted: insertedCount,
      rowsSkipped: shortInterestData.length - insertedCount,
      sourceUsed: 'Short_interest_real (Firecrawl)',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: insertedCount,
        extracted: shortInterestData.length,
        source: 'Short_interest_real - NO ESTIMATION' 
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
        source_used: 'Short_interest_real',
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
