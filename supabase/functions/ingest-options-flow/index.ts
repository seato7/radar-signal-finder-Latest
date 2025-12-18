import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { scrapeWithRetry } from "../_shared/scrape-and-extract.ts";
import { extractTableData, ExtractionSchema } from "../_shared/lovable-extractor.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Real options flow data sources
const OPTIONS_SOURCES = [
  'https://www.barchart.com/options/unusual-activity/stocks',
  'https://unusualwhales.com/flow',
  'https://marketchameleon.com/Reports/UnusualOptionVolumeReport',
  'https://www.tradingview.com/symbols/SPY/options/',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const slackAlerter = new SlackAlerter();

  try {
    console.log('[REAL DATA] Options flow ingestion - NO ESTIMATION...');
    
    // Scrape options flow data
    let scrapedContent = '';
    let sourceUsed = '';
    
    for (const sourceUrl of OPTIONS_SOURCES) {
      try {
        console.log(`Scraping options: ${sourceUrl}`);
        const result = await scrapeWithRetry(sourceUrl);
        if (result.success && result.content && result.content.length > 500) {
          scrapedContent += `\n\nSOURCE: ${sourceUrl}\n${result.content}`;
          sourceUsed = sourceUrl;
          console.log(`✅ Scraped: ${result.content.length} chars`);
        }
      } catch (err) {
        console.log(`⚠️ Could not scrape ${sourceUrl}`);
      }
    }

    if (!scrapedContent || scrapedContent.length < 500) {
      console.log('❌ No real options flow data available');
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        error_message: 'No real options data from sources',
      });

      await slackAlerter.sendLiveAlert({
        etlName: 'ingest-options-flow',
        status: 'partial',
        rowsInserted: 0,
        rowsSkipped: 0,
        sourceUsed: 'none - no real data',
        duration: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ success: true, count: 0, reason: 'No real options data available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract structured options data
    const rowSchema: ExtractionSchema = {
      ticker: { type: 'string', description: 'Stock ticker symbol', required: true },
      option_type: { type: 'string', description: 'call or put' },
      strike_price: { type: 'number', description: 'Strike price', required: true },
      expiration_date: { type: 'string', description: 'Expiration date (YYYY-MM-DD)' },
      premium: { type: 'number', description: 'Premium paid in dollars' },
      volume: { type: 'number', description: 'Number of contracts', required: true },
      open_interest: { type: 'number', description: 'Open interest' },
      implied_volatility: { type: 'number', description: 'Implied volatility as decimal' },
      flow_type: { type: 'string', description: 'sweep, block, or split' },
      sentiment: { type: 'string', description: 'bullish or bearish' }
    };

    const extracted = await extractTableData(scrapedContent, rowSchema, 'Unusual options activity and options flow data');
    const optionsData = extracted.rows || [];

    console.log(`Extracted ${optionsData.length} options flow records`);

    if (optionsData.length === 0) {
      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: sourceUsed || 'scraped',
        error_message: 'No extractable options data in content',
      });

      return new Response(
        JSON.stringify({ success: true, count: 0, reason: 'No extractable options data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare records for insert
    const optionsFlow = optionsData.map((opt: any) => ({
      ticker: String(opt.ticker).substring(0, 10),
      option_type: opt.option_type || 'call',
      strike_price: opt.strike_price,
      expiration_date: opt.expiration_date,
      premium: opt.premium || 0,
      volume: opt.volume,
      open_interest: opt.open_interest || 0,
      implied_volatility: opt.implied_volatility || 0,
      flow_type: opt.flow_type || 'split',
      sentiment: opt.sentiment || (opt.option_type === 'call' ? 'bullish' : 'bearish'),
      trade_date: new Date().toISOString(),
      metadata: {
        source: sourceUsed,
        scraped_at: new Date().toISOString(),
      },
    }));

    // Insert records
    let insertedCount = 0;
    if (optionsFlow.length > 0) {
      const { error } = await supabase
        .from('options_flow')
        .insert(optionsFlow);

      if (error) {
        console.error('Insert error:', error.message);
      } else {
        insertedCount = optionsFlow.length;
      }
    }

    const durationMs = Date.now() - startTime;

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: optionsData.length - insertedCount,
      duration_ms: durationMs,
      source_used: 'Options_flow_real',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow',
      status: insertedCount > 0 ? 'success' : 'partial',
      rowsInserted: insertedCount,
      rowsSkipped: optionsData.length - insertedCount,
      sourceUsed: 'Options_flow_real (Firecrawl)',
      duration: durationMs,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: insertedCount, 
        extracted: optionsData.length,
        source: 'Options_flow_real - NO ESTIMATION' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-options-flow:', error);
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-options-flow',
      message: `Options flow ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
