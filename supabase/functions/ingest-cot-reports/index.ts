import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callPerplexity } from "../_shared/perplexity-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Major forex pairs and commodities for COT data
const COT_INSTRUMENTS = [
  { ticker: 'EUR/USD', cftcName: 'EURO FX' },
  { ticker: 'GBP/USD', cftcName: 'BRITISH POUND' },
  { ticker: 'USD/JPY', cftcName: 'JAPANESE YEN' },
  { ticker: 'AUD/USD', cftcName: 'AUSTRALIAN DOLLAR' },
  { ticker: 'USD/CAD', cftcName: 'CANADIAN DOLLAR' },
  { ticker: 'USD/CHF', cftcName: 'SWISS FRANC' },
  { ticker: 'NZD/USD', cftcName: 'NEW ZEALAND DOLLAR' },
  { ticker: 'GOLD', cftcName: 'GOLD' },
  { ticker: 'SILVER', cftcName: 'SILVER' },
  { ticker: 'OIL', cftcName: 'CRUDE OIL' },
  { ticker: 'NATGAS', cftcName: 'NATURAL GAS' },
];

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

  try {
    console.log('📊 Starting COT reports ingestion via Perplexity...');

    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY not configured - required for real COT data');
    }

    let successCount = 0;
    let errorCount = 0;
    const reportDate = new Date().toISOString().split('T')[0];

    for (const instrument of COT_INSTRUMENTS) {
      try {
        console.log(`Fetching COT data for ${instrument.ticker}...`);
        
        const prompt = `What is the latest CFTC Commitments of Traders (COT) report data for ${instrument.cftcName}?
Provide the most recent weekly data:
- COMMERCIAL_LONG: number of contracts
- COMMERCIAL_SHORT: number of contracts
- NONCOMMERCIAL_LONG: number of contracts (large speculators)
- NONCOMMERCIAL_SHORT: number of contracts
- NONREPORTABLE_LONG: number of contracts (small traders)
- NONREPORTABLE_SHORT: number of contracts
- NET_CHANGE: change in net speculator position from last week

Format your response EXACTLY as:
COMMERCIAL_LONG: X
COMMERCIAL_SHORT: Y
NONCOMMERCIAL_LONG: A
NONCOMMERCIAL_SHORT: B
NONREPORTABLE_LONG: C
NONREPORTABLE_SHORT: D
NET_CHANGE: Z`;

        const content = await callPerplexity(
          [{ role: 'user', content: prompt }],
          { apiKey: perplexityKey, model: 'sonar', temperature: 0.2, maxTokens: 300 }
        );

        // Parse response
        const commLongMatch = content.match(/COMMERCIAL_LONG:\s*([\d,]+)/);
        const commShortMatch = content.match(/COMMERCIAL_SHORT:\s*([\d,]+)/);
        const noncommLongMatch = content.match(/NONCOMMERCIAL_LONG:\s*([\d,]+)/);
        const noncommShortMatch = content.match(/NONCOMMERCIAL_SHORT:\s*([\d,]+)/);
        const nonrepLongMatch = content.match(/NONREPORTABLE_LONG:\s*([\d,]+)/);
        const nonrepShortMatch = content.match(/NONREPORTABLE_SHORT:\s*([\d,]+)/);
        const netChangeMatch = content.match(/NET_CHANGE:\s*(-?[\d,]+)/);

        const parseNum = (match: RegExpMatchArray | null) => 
          match ? parseInt(match[1].replace(/,/g, '')) : 0;

        const commercialLong = parseNum(commLongMatch);
        const commercialShort = parseNum(commShortMatch);
        const noncommercialLong = parseNum(noncommLongMatch);
        const noncommercialShort = parseNum(noncommShortMatch);
        const nonreportableLong = parseNum(nonrepLongMatch);
        const nonreportableShort = parseNum(nonrepShortMatch);
        const netChange = parseNum(netChangeMatch);

        const commercialNet = commercialLong - commercialShort;
        const noncommercialNet = noncommercialLong - noncommercialShort;
        const nonreportableNet = nonreportableLong - nonreportableShort;

        // Determine sentiment
        let sentiment = 'neutral';
        if (noncommercialNet > 10000) sentiment = 'bullish';
        if (noncommercialNet < -10000) sentiment = 'bearish';

        // Get asset_id
        const { data: asset } = await supabaseClient
          .from('assets')
          .select('id')
          .eq('ticker', instrument.ticker)
          .single();

        const cotRecord = {
          ticker: instrument.ticker,
          asset_id: asset?.id,
          report_date: reportDate,
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
          metadata: { source: 'Perplexity AI', cftc_name: instrument.cftcName }
        };

        const { error } = await supabaseClient
          .from('cot_reports')
          .upsert(cotRecord, { onConflict: 'ticker,report_date' });

        if (error) {
          console.error(`Error inserting COT for ${instrument.ticker}:`, error);
          errorCount++;
        } else {
          successCount++;

          // Create signal based on COT positioning
          if (Math.abs(noncommercialNet) > 50000 || Math.abs(netChange) > 10000) {
            await supabaseClient.from('signals').insert({
              signal_type: 'cot_positioning',
              asset_id: asset?.id,
              direction: noncommercialNet > 0 ? 'up' : 'down',
              magnitude: Math.min(Math.abs(noncommercialNet) / 100000, 1.0),
              value_text: `Large speculators net ${noncommercialNet > 0 ? 'long' : 'short'}: ${Math.abs(noncommercialNet).toLocaleString()} contracts (change: ${netChange > 0 ? '+' : ''}${netChange.toLocaleString()})`,
              observed_at: new Date().toISOString(),
              citation: {
                source: 'Perplexity AI - CFTC COT',
                url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm',
                timestamp: new Date().toISOString()
              },
              checksum: `${instrument.ticker}-cot-${reportDate}`,
            });
          }
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (instrumentError) {
        console.error(`Error processing ${instrument.ticker}:`, instrumentError);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;

    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-cot-reports',
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: errorCount,
      duration_ms: duration,
      source_used: 'Perplexity AI',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-cot-reports',
      status: 'success',
      rowsInserted: successCount,
      rowsSkipped: errorCount,
      sourceUsed: 'Perplexity AI',
      duration,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: COT_INSTRUMENTS.length,
        successful: successCount,
        errors: errorCount,
        message: `Ingested ${successCount} COT reports from Perplexity`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    const duration = Date.now() - startTime;
    
    await logHeartbeat(supabaseClient, {
      function_name: 'ingest-cot-reports',
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: 'Perplexity AI',
      error_message: error instanceof Error ? error.message : 'Unknown error',
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
