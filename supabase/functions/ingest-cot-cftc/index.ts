import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Starting CFTC COT reports ingestion...');
    
    // CFTC publishes COT data every Friday
    // Use their public API: https://publicreporting.cftc.gov/resource/
    const cotUrl = 'https://publicreporting.cftc.gov/resource/jun7-fc8e.json?$limit=1000&$order=report_date_as_yyyy_mm_dd%20DESC';
    
    const response = await fetch(cotUrl, {
      headers: {
        'X-App-Token': 'YOUR_CFTC_TOKEN' // Optional, increases rate limits
      }
    });
    
    if (!response.ok) {
      throw new Error(`CFTC API returned ${response.status}`);
    }
    
    const cotData = await response.json();
    console.log(`Fetched ${cotData.length} COT records from CFTC`);
    
    let inserted = 0;
    let skipped = 0;
    
    // Map CFTC commodity codes to our tickers
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
    
    for (const record of cotData) {
      try {
        const commodityCode = record.cftc_contract_market_code;
        const ticker = commodityMap[commodityCode];
        
        if (!ticker) {
          skipped++;
          continue;
        }
        
        // Look up asset_id
        const assetRes = await fetch(
          `${supabaseUrl}/rest/v1/assets?ticker=eq.${ticker}&select=id`,
          { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
        );
        const assets = await assetRes.json();
        const asset_id = assets[0]?.id || null;
        
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
        
        // Upsert with ticker+date conflict resolution
        const upsertRes = await fetch(`${supabaseUrl}/rest/v1/cot_reports`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(cotRecord)
        });
        
        if (upsertRes.ok) {
          inserted++;
          
          // Generate signal if net position is extreme
          if (Math.abs(net_position) > 50000) {
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
              checksum: await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(`cot|${ticker}|${record.report_date_as_yyyy_mm_dd}|${net_position}`)
              ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
            };
            
            await fetch(`${supabaseUrl}/rest/v1/signals`, {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=ignore-duplicates'
              },
              body: JSON.stringify(signal)
            });
          }
        } else {
          skipped++;
        }
        
      } catch (err) {
        console.error('Error processing COT record:', err);
        skipped++;
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      source: 'CFTC',
      processed: cotData.length,
      inserted,
      skipped,
      note: 'COT data updated weekly on Fridays'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
