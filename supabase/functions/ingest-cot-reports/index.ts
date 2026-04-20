import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v4 - REAL DATA ONLY - NO ESTIMATIONS - WITH PROPER LOGGING

// CFTC COT Report Code to Ticker mapping
const CFTC_CONTRACTS: Record<string, { ticker: string; name: string }> = {
  '088691': { ticker: 'XAU/USD', name: 'Gold' },
  '084691': { ticker: 'XAG/USD', name: 'Silver' },
  '067651': { ticker: 'CL1', name: 'Crude Oil WTI' },
  '023651': { ticker: 'NG/USD', name: 'Natural Gas' },
  '001612': { ticker: 'W_1', name: 'Wheat' },
  '002602': { ticker: 'C_1', name: 'Corn' },
  '005602': { ticker: 'S_1', name: 'Soybeans' },
  '099741': { ticker: 'ES1', name: 'S&P 500' },
  '13874A': { ticker: 'EUR/USD', name: 'Euro' },
  '096742': { ticker: 'GBP/USD', name: 'British Pound' },
  '097741': { ticker: 'JPY/USD', name: 'Japanese Yen' },
  '232741': { ticker: 'BTC/USD', name: 'Bitcoin' },
};

interface CFTCReport {
  report_date_as_yyyy_mm_dd: string;
  cftc_contract_market_code: string;
  market_and_exchange_names: string;
  noncomm_positions_long_all: string;
  noncomm_positions_short_all: string;
  comm_positions_long_all: string;
  comm_positions_short_all: string;
  nonrept_positions_long_all: string;
  nonrept_positions_short_all: string;
  change_in_noncomm_long_all: string;
  change_in_noncomm_short_all: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const slackAlerter = new SlackAlerter();
  const logger = new IngestLogger(supabaseClient, 'ingest-cot-reports');

  try {
    // Start logging
    await logger.start();
    console.log('[v4] Starting COT reports ingestion - REAL DATA ONLY, NO ESTIMATIONS');

    // Fetch real CFTC COT data from Socrata API (free, no key required)
    const cftcUrl = 'https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$limit=500&$order=report_date_as_yyyy_mm_dd DESC';
    
    let cftcData: CFTCReport[] = [];
    
    try {
      console.log('Fetching from CFTC Socrata API...');
      const response = await fetch(cftcUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FinancialDataBot/1.0'
        }
      });
      
      if (response.ok) {
        cftcData = await response.json();
        console.log(`✅ Fetched ${cftcData.length} CFTC records`);
      } else {
        console.log(`CFTC API returned ${response.status}`);
      }
    } catch (fetchError) {
      console.error('CFTC fetch error:', fetchError);
    }

    // If no CFTC data, return no data - DO NOT generate fake data
    if (cftcData.length === 0) {
      console.log('❌ No real CFTC data available - NOT inserting any fake data');
      
      await logger.success({
        source_used: 'none',
        rows_inserted: 0,
        rows_skipped: 0,
        metadata: { version: 'v4_no_estimation', reason: 'cftc_api_failed' }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-cot-reports', {
        sourcesAttempted: ['CFTC Socrata API'],
        reason: 'CFTC API returned no data or failed'
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: 'No real CFTC data available - no fake data inserted',
          version: 'v4_no_estimation'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get commodity assets from database
    let allCommodities: any[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: assets, error } = await supabaseClient
        .from('assets')
        .select('*')
        .eq('asset_class', 'commodity')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!assets || assets.length === 0) break;

      allCommodities = [...allCommodities, ...assets];
      if (assets.length < pageSize) break;
      page++;
    }

    console.log(`Found ${allCommodities.length} commodity assets`);

    // Create ticker to asset mapping
    const tickerToAsset = new Map<string, any>();
    for (const asset of allCommodities) {
      tickerToAsset.set(asset.ticker.toUpperCase(), asset);
    }

    // Process REAL CFTC data only
    const insertData: any[] = [];

    // Group by contract code to get latest report per contract
    const latestByContract = new Map<string, CFTCReport>();
    
    for (const report of cftcData) {
      const code = report.cftc_contract_market_code;
      if (!latestByContract.has(code) || 
          report.report_date_as_yyyy_mm_dd > latestByContract.get(code)!.report_date_as_yyyy_mm_dd) {
        latestByContract.set(code, report);
      }
    }

    console.log(`Processing ${latestByContract.size} unique contracts from CFTC...`);

    for (const [code, report] of latestByContract) {
      const mapping = CFTC_CONTRACTS[code];
      if (!mapping) continue;

      const asset = tickerToAsset.get(mapping.ticker);
      if (!asset) continue;

      const noncommercialLong = parseInt(report.noncomm_positions_long_all) || 0;
      const noncommercialShort = parseInt(report.noncomm_positions_short_all) || 0;
      const commercialLong = parseInt(report.comm_positions_long_all) || 0;
      const commercialShort = parseInt(report.comm_positions_short_all) || 0;
      const nonreportableLong = parseInt(report.nonrept_positions_long_all) || 0;
      const nonreportableShort = parseInt(report.nonrept_positions_short_all) || 0;

      const noncommercialNet = noncommercialLong - noncommercialShort;
      const commercialNet = commercialLong - commercialShort;
      const nonreportableNet = nonreportableLong - nonreportableShort;

      const changeLong = parseInt(report.change_in_noncomm_long_all) || 0;
      const changeShort = parseInt(report.change_in_noncomm_short_all) || 0;
      const netChange = changeLong - changeShort;

      let sentiment = 'neutral';
      if (noncommercialNet > 10000) sentiment = 'bullish';
      if (noncommercialNet < -10000) sentiment = 'bearish';

      insertData.push({
        ticker: mapping.ticker,
        asset_id: asset.id,
        report_date: report.report_date_as_yyyy_mm_dd,
        commercial_long: commercialLong,
        commercial_short: commercialShort,
        commercial_net: commercialNet,
        noncommercial_long: noncommercialLong,
        noncommercial_short: noncommercialShort,
        noncommercial_net: noncommercialNet,
        nonreportable_long: nonreportableLong,
        nonreportable_short: nonreportableShort,
        nonreportable_net: nonreportableNet,
        net_position_change: netChange,
        sentiment,
        metadata: { 
          source: 'CFTC_Socrata_API',
          contract_code: code,
          market_name: report.market_and_exchange_names,
          data_type: 'real',
          version: 'v4_no_estimation'
        }
      });
    }

    console.log(`Prepared ${insertData.length} REAL COT records`);

    if (insertData.length === 0) {
      console.log('❌ No matching COT data for our assets - NOT inserting any fake data');
      
      await logger.success({
        source_used: 'CFTC_Socrata_API',
        rows_inserted: 0,
        rows_skipped: 0,
        metadata: { version: 'v4_no_estimation', reason: 'no_matching_assets' }
      });
      
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: 'No matching COT data for assets - no fake data inserted',
          version: 'v4_no_estimation'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert REAL data only
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    for (let i = 0; i < insertData.length; i += BATCH_SIZE) {
      const batch = insertData.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabaseClient
        .from('cot_reports')
        .insert(batch);

      if (insertError) {
        console.error(`Batch insert error:`, insertError.message);
      } else {
        insertedCount += batch.length;
      }
    }

    const duration = Date.now() - logger.startTime;

    // Log success to both ingest_logs and function_status
    await logger.success({
      source_used: 'CFTC_Socrata_API',
      rows_inserted: insertedCount,
      rows_skipped: 0,
      verified_source: 'CFTC',
      metadata: { version: 'v4_no_estimation', contracts_processed: latestByContract.size }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-cot-reports',
      status: 'success',
      rowsInserted: insertedCount,
      rowsSkipped: 0,
      sourceUsed: 'CFTC_Socrata_API (REAL DATA ONLY)',
      duration,
    });

    console.log(`✅ Inserted ${insertedCount} REAL COT records - NO ESTIMATIONS`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: insertedCount,
        source: 'CFTC_Socrata_API',
        version: 'v4_no_estimation',
        message: `Inserted ${insertedCount} REAL COT reports`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);

    // Log failure to both ingest_logs and function_status
    await logger.failure(error instanceof Error ? error : new Error(String(error)), {
      source_used: 'CFTC_Socrata_API',
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-cot-reports',
      message: `COT Reports failed: ${(error as Error).message}`
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});