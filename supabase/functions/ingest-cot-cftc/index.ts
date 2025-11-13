import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { logHeartbeat } from '../_shared/heartbeat.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Commodity mapping for tickers
const commodityMap: Record<string, string> = {
  '067651': 'GC=F',  // Gold
  '088691': 'SI=F',  // Silver
  '067411': 'CL=F',  // Crude Oil WTI
  '088661': 'HG=F',  // Copper
  '001602': 'ZC=F',  // Corn
  '002602': 'ZS=F',  // Soybeans
  '099741': 'EUR/USD',
  '096742': 'GBP/USD',
  '097741': 'JPY/USD',
  '232741': 'AUD/USD',
  '112741': 'CAD/USD',
  '124601': 'BTC/USD'
};

async function fetchCFTCData(): Promise<any[]> {
  const cotUrl = 'https://publicreporting.cftc.gov/resource/jun7-fc8e.json?$limit=1000&$order=report_date_as_yyyy_mm_dd%20DESC';
  
  console.log('Attempting CFTC API with browser-like headers...');
  const response = await fetch(cotUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.cftc.gov/',
      'Connection': 'keep-alive'
    }
  });
  
  if (!response.ok) {
    throw new Error(`CFTC API returned ${response.status}`);
  }
  
  return await response.json();
}

async function fetchCOTFallback(perplexityKey: string): Promise<any[]> {
  console.log('Using AI fallback for COT data...');
  
  const prompt = `Fetch the latest Commitments of Traders (COT) report data from CFTC for major commodities and currencies. Return JSON array with fields: cftc_contract_market_code, market_and_exchange_names, report_date_as_yyyy_mm_dd, noncomm_positions_long_all, noncomm_positions_short_all, comm_positions_long_all, comm_positions_short_all, open_interest_all. Include data for Gold (067651), Silver (088691), Crude Oil (067411), Copper (088661), EUR/USD (099741). Use latest available data.`;
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${perplexityKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    throw new Error('Perplexity fallback failed');
  }
  
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '[]';
  
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  return [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let inserted = 0;
  let skipped = 0;
  let fallbackUsed = false;
  let errorMessage: string | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('Starting CFTC COT reports ingestion...');
    
    let cotData: any[];
    
    try {
      cotData = await fetchCFTCData();
      console.log(`✅ Primary CFTC API successful: ${cotData.length} records`);
    } catch (primaryError) {
      console.error(`❌ Primary CFTC API failed:`, primaryError);
      
      if (perplexityKey) {
        try {
          cotData = await fetchCOTFallback(perplexityKey);
          fallbackUsed = true;
          console.log(`✅ Fallback successful: ${cotData.length} records`);
        } catch (fallbackError) {
          console.error(`❌ Fallback failed:`, fallbackError);
          throw new Error('Both primary and fallback failed');
        }
      } else {
        throw primaryError;
      }
    }
    console.log(`Processing ${cotData.length} COT records...`);
    
    for (const record of cotData) {
      try {
        const commodityCode = record.cftc_contract_market_code;
        const ticker = commodityMap[commodityCode];
        
        if (!ticker) {
          skipped++;
          continue;
        }
        
        // Look up asset_id using Supabase client
        const { data: assets } = await supabase
          .from('assets')
          .select('id')
          .eq('ticker', ticker)
          .limit(1);
        
        const asset_id = assets?.[0]?.id || null;
        
        const noncommercial_long = parseInt(record.noncomm_positions_long_all || 0);
        const noncommercial_short = parseInt(record.noncomm_positions_short_all || 0);
        const commercial_long = parseInt(record.comm_positions_long_all || 0);
        const commercial_short = parseInt(record.comm_positions_short_all || 0);
        
        const net_position = noncommercial_long - noncommercial_short;
        const prev_net = parseInt(record.change_in_noncomm_long_all || 0) - parseInt(record.change_in_noncomm_short_all || 0);
        
        let sentiment = 'neutral';
        if (net_position > 10000) sentiment = 'bullish';
        else if (net_position < -10000) sentiment = 'bearish';
        
        const cotRecord = {
          ticker,
          asset_id,
          report_date: record.report_date_as_yyyy_mm_dd,
          noncommercial_long,
          noncommercial_short,
          noncommercial_net: net_position,
          commercial_long,
          commercial_short,
          commercial_net: commercial_long - commercial_short,
          nonreportable_long: parseInt(record.nonrept_positions_long_all || 0),
          nonreportable_short: parseInt(record.nonrept_positions_short_all || 0),
          nonreportable_net: parseInt(record.nonrept_positions_long_all || 0) - parseInt(record.nonrept_positions_short_all || 0),
          net_position_change: prev_net,
          sentiment,
          metadata: {
            commodity_name: record.market_and_exchange_names,
            cftc_code: commodityCode,
            open_interest: record.open_interest_all
          }
        };
        
        // Upsert using Supabase client
        const { error: upsertError } = await supabase
          .from('cot_reports')
          .upsert(cotRecord, {
            onConflict: 'ticker,report_date',
            ignoreDuplicates: false
          });
        
        if (!upsertError) {
          inserted++;
          
          // Generate signal if net position is extreme
          if (Math.abs(net_position) > 50000) {
            const checksumBuffer = await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(`cot|${ticker}|${record.report_date_as_yyyy_mm_dd}|${net_position}`)
            );
            const checksum = Array.from(new Uint8Array(checksumBuffer))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            
            const signal = {
              signal_type: 'cot_positioning',
              asset_id,
              direction: net_position > 0 ? 'up' : 'down',
              magnitude: Math.abs(net_position) / 100000,
              observed_at: new Date(record.report_date_as_yyyy_mm_dd).toISOString(),
              value_text: `${sentiment.toUpperCase()} positioning: ${net_position.toLocaleString()} contracts`,
              citation: {
                source: 'CFTC Commitments of Traders',
                url: 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm',
                timestamp: new Date().toISOString()
              },
              checksum
            };
            
            await supabase
              .from('signals')
              .upsert(signal, {
                onConflict: 'checksum',
                ignoreDuplicates: true
              });
          }
        } else {
          console.error('Upsert error:', upsertError);
          skipped++;
        }
        
      } catch (err) {
        console.error('Error processing COT record:', err);
        skipped++;
      }
    }
    
    // Log heartbeat to function_status
    const durationMs = Date.now() - startTime;
    await logHeartbeat(supabase, {
      function_name: 'ingest-cot-cftc',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      fallback_used: fallbackUsed ? 'Perplexity AI' : null,
      duration_ms: durationMs,
      source_used: fallbackUsed ? 'Perplexity AI' : 'CFTC API',
      metadata: {
        total_processed: cotData.length,
        commodities_mapped: Object.keys(commodityMap).length
      }
    });
    
    console.log(`✅ COT ingestion complete: ${inserted} inserted, ${skipped} skipped, ${durationMs}ms`);
    
    return new Response(JSON.stringify({
      success: true,
      source: fallbackUsed ? 'Perplexity AI (fallback)' : 'CFTC API',
      processed: cotData.length,
      inserted,
      skipped,
      fallbackUsed,
      durationMs,
      note: 'COT data updated weekly on Fridays'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Fatal error:', errorMessage);
    
    // Log failure heartbeat
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-cot-cftc',
        status: 'failure',
        rows_inserted: inserted,
        rows_skipped: skipped,
        fallback_used: fallbackUsed ? 'Perplexity AI' : null,
        duration_ms: durationMs,
        source_used: fallbackUsed ? 'Perplexity AI' : 'CFTC API',
        error_message: errorMessage,
        metadata: { errorDetails: errorMessage }
      });
    } catch (logError) {
      console.error('Failed to log heartbeat:', logError);
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      inserted,
      skipped,
      fallbackUsed,
      durationMs
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
