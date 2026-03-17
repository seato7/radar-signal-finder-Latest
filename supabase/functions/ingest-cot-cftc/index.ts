// redeployed 2026-03-17
import "https://deno.land/x/xhr@0.1.0/mod.ts";
// FIX: Import crypto explicitly so crypto.subtle.digest() is available in all Deno edge runtimes
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { logHeartbeat } from '../_shared/heartbeat.ts';
import { SlackAlerter } from '../_shared/slack-alerts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

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
  
  console.log('[COT] Attempting CFTC API with browser-like headers...');
  const response = await fetch(cotUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

async function fetchCOTFallback(firecrawlKey: string, lovableApiKey: string): Promise<any[]> {
  console.log('[COT] Using Firecrawl + AI fallback for COT data...');
  
  // Search for recent COT reports
  const searchResponse = await fetch(`${FIRECRAWL_API_URL}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'CFTC Commitments of Traders report gold silver crude oil forex positioning',
      limit: 10,
      scrapeOptions: { formats: ['markdown'] }
    }),
  });

  if (!searchResponse.ok) {
    throw new Error('Firecrawl search failed');
  }

  const searchData = await searchResponse.json();
  const results = searchData.data || [];
  
  if (results.length === 0) {
    return [];
  }

  const combinedContent = results
    .slice(0, 5)
    .map((r: any) => `[${r.url}]\n${r.markdown || r.description || ''}`)
    .join('\n\n---\n\n');

  // Use Lovable AI to extract structured COT data
  const aiResponse = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'system',
        content: 'Extract COT positioning data. Return valid JSON array only.'
      }, {
        role: 'user',
        content: `Extract Commitments of Traders data from this content. Return JSON array:
[{
  "cftc_contract_market_code": "code",
  "market_and_exchange_names": "name",
  "report_date_as_yyyy_mm_dd": "YYYY-MM-DD",
  "noncomm_positions_long_all": number,
  "noncomm_positions_short_all": number,
  "comm_positions_long_all": number,
  "comm_positions_short_all": number,
  "open_interest_all": number
}]

Include Gold (067651), Silver (088691), Crude Oil (067411), Copper (088661), EUR/USD (099741) if found.

Content:
${combinedContent.substring(0, 10000)}`
      }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!aiResponse.ok) {
    throw new Error('AI extraction failed');
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || '[]';
  
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
  const slackAlerter = new SlackAlerter();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('[COT] Starting CFTC COT reports ingestion...');
    
    let cotData: any[];
    
    try {
      cotData = await fetchCFTCData();
      console.log(`[COT] ✅ Primary CFTC API successful: ${cotData.length} records`);
    } catch (primaryError) {
      console.error(`[COT] ❌ Primary CFTC API failed:`, primaryError);
      
      if (firecrawlKey && lovableApiKey) {
        try {
          cotData = await fetchCOTFallback(firecrawlKey, lovableApiKey);
          fallbackUsed = true;
          console.log(`[COT] ✅ Fallback successful: ${cotData.length} records`);
        } catch (fallbackError) {
          console.error(`[COT] ❌ Fallback failed:`, fallbackError);
          throw new Error('Both primary and fallback failed');
        }
      } else {
        throw primaryError;
      }
    }
    console.log(`[COT] Processing ${cotData.length} COT records...`);
    
    for (const record of cotData) {
      try {
        const commodityCode = record.cftc_contract_market_code;
        const ticker = commodityMap[commodityCode];
        
        if (!ticker) {
          skipped++;
          continue;
        }
        
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
        
        const { error: upsertError } = await supabase
          .from('cot_reports')
          .upsert(cotRecord, {
            onConflict: 'ticker,report_date',
            ignoreDuplicates: false
          });
        
        if (!upsertError) {
          inserted++;
          
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
              magnitude: Math.min(5, (Math.abs(net_position) / 100000) * 5), // FIX: normalised to 0-5 scale
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
              .upsert(signal, { onConflict: 'checksum', ignoreDuplicates: true });
          }
        } else {
          console.error('[COT] Upsert error:', upsertError);
          skipped++;
        }
        
      } catch (err) {
        console.error('[COT] Error processing record:', err);
        skipped++;
      }
    }
    
    const durationMs = Date.now() - startTime;
    const sourceUsed = fallbackUsed ? 'Firecrawl + Lovable AI' : 'CFTC API';
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-cot-cftc',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped,
      fallback_used: fallbackUsed ? 'Firecrawl + Lovable AI' : null,
      duration_ms: durationMs,
      source_used: sourceUsed,
      metadata: { total_processed: cotData.length, commodities_mapped: Object.keys(commodityMap).length }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-cot-cftc',
      status: 'success',
      duration: durationMs,
      rowsInserted: inserted,
      rowsSkipped: skipped,
      sourceUsed,
    });
    
    console.log(`[COT] ✅ Complete: ${inserted} inserted, ${skipped} skipped, ${durationMs}ms`);
    
    return new Response(JSON.stringify({
      success: true,
      source: sourceUsed,
      processed: cotData.length,
      inserted,
      skipped,
      fallbackUsed,
      durationMs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[COT] ❌ Fatal error:', errorMessage);
    
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-cot-cftc',
        status: 'failure',
        rows_inserted: inserted,
        rows_skipped: skipped,
        fallback_used: fallbackUsed ? 'Firecrawl + Lovable AI' : null,
        duration_ms: durationMs,
        source_used: fallbackUsed ? 'Firecrawl + Lovable AI' : 'CFTC API',
        error_message: errorMessage,
      });
    } catch (logError) {
      console.error('[COT] Failed to log heartbeat:', logError);
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-cot-cftc',
      message: `COT CFTC failed: ${errorMessage}`
    });

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
