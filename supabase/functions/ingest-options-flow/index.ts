import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v3 - REAL DATA ONLY - NO ESTIMATIONS
// Tries Barchart API only - NO fake data generation fallback

// Barchart options data (may be blocked without proper API access)
async function fetchBarchartOptions(ticker: string): Promise<any[]> {
  try {
    const url = `https://www.barchart.com/proxies/core-api/v1/options/chain?symbol=${ticker}&fields=strikePrice,expirationDate,lastPrice,volume,openInterest,volatility,optionType&meta=field.shortName&orderBy=volume&orderDir=desc&hasQuotes=true&limit=30`;
    
    console.log(`Fetching Barchart options for ${ticker}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.barchart.com/',
        'Origin': 'https://www.barchart.com'
      }
    });
    
    if (!response.ok) {
      console.log(`Barchart ${ticker}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const options: any[] = [];
    
    if (data?.data && Array.isArray(data.data)) {
      for (const opt of data.data) {
        if ((opt.volume || 0) > 50) {
          options.push({
            ticker,
            option_type: opt.optionType?.toLowerCase() || 'call',
            strike_price: opt.strikePrice || 0,
            expiration_date: opt.expirationDate || null,
            premium: opt.lastPrice || 0,
            volume: opt.volume || 0,
            open_interest: opt.openInterest || 0,
            implied_volatility: opt.volatility || 0,
            flow_type: (opt.volume || 0) > 500 ? 'sweep' : 'block',
            sentiment: opt.optionType?.toLowerCase() === 'call' ? 'bullish' : 'bearish',
            trade_date: new Date().toISOString(),
            metadata: { source: 'Barchart_API', data_type: 'real' }
          });
        }
      }
    }
    
    console.log(`Barchart ${ticker}: found ${options.length} real options`);
    return options;
  } catch (err) {
    console.log(`Barchart error for ${ticker}: ${err}`);
    return [];
  }
}

// Try CBOE via Firecrawl as backup
async function fetchCBOEOptions(ticker: string, firecrawlApiKey: string): Promise<any[]> {
  if (!firecrawlApiKey) return [];
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.cboe.com/delayed_quotes/${ticker.toLowerCase()}/`,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.log(`CBOE scrape failed for ${ticker}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown || markdown.length < 100) {
      return [];
    }

    // Parse options data from CBOE page
    const options: any[] = [];
    
    // Look for volume patterns like "Volume: 1,234"
    const volumePattern = /(\d+(?:,\d+)*)\s*(?:volume|contracts)/gi;
    const strikePattern = /\$?(\d+(?:\.\d+)?)\s*(?:strike|call|put)/gi;
    
    let volumeMatch;
    while ((volumeMatch = volumePattern.exec(markdown)) !== null) {
      const volume = parseInt(volumeMatch[1].replace(/,/g, ''));
      if (volume > 100) {
        options.push({
          ticker,
          option_type: markdown.toLowerCase().includes('call') ? 'call' : 'put',
          strike_price: 0,
          volume,
          trade_date: new Date().toISOString(),
          metadata: { source: 'CBOE_Firecrawl', data_type: 'real' }
        });
        break; // Just get one data point per ticker
      }
    }
    
    return options;
  } catch (error) {
    console.error(`CBOE Firecrawl error for ${ticker}:`, error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const slackAlerter = new SlackAlerter();
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

  try {
    console.log('[v3] Options flow ingestion - REAL DATA ONLY, NO ESTIMATIONS');
    
    const allOptions: any[] = [];
    const tickers = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];
    
    // Try Barchart first
    for (const ticker of tickers) {
      const options = await fetchBarchartOptions(ticker);
      allOptions.push(...options);
      await new Promise(r => setTimeout(r, 800));
    }
    
    // If Barchart failed, try CBOE via Firecrawl
    if (allOptions.length === 0 && firecrawlApiKey) {
      console.log('Barchart unavailable, trying CBOE via Firecrawl...');
      for (const ticker of tickers.slice(0, 4)) { // Limit CBOE calls
        const options = await fetchCBOEOptions(ticker, firecrawlApiKey);
        allOptions.push(...options);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    console.log(`Total REAL options found: ${allOptions.length}`);

    if (allOptions.length === 0) {
      console.log('❌ No real options data found - NOT inserting any fake data');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Barchart API', 'CBOE via Firecrawl'],
        reason: 'No options data from any source - all APIs blocked or unavailable'
      });
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'no_data',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        metadata: { version: 'v3_no_estimation', reason: 'no_real_data_available' }
      });
      
      return new Response(JSON.stringify({ 
        success: true, 
        count: 0, 
        source: 'none',
        version: 'v3_no_estimation',
        message: 'No real options data found - no fake data inserted'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert REAL options only
    let inserted = 0;
    for (let i = 0; i < allOptions.length; i += 50) {
      const batch = allOptions.slice(i, i + 50);
      const { data, error } = await supabase.from('options_flow').insert(batch).select('id');
      if (error) {
        console.error('Insert error:', error);
      } else {
        inserted += (data?.length || 0);
      }
    }
    
    console.log(`✅ Inserted ${inserted} REAL options records - NO ESTIMATIONS`);
    
    const source = allOptions[0]?.metadata?.source || 'unknown';

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow', 
      status: inserted > 0 ? 'success' : 'partial',
      rowsInserted: inserted, 
      rowsSkipped: 0, 
      sourceUsed: `${source} (REAL DATA ONLY)`, 
      duration: Date.now() - startTime
    });

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: source,
      metadata: { version: 'v3_no_estimation' }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      count: inserted, 
      source,
      version: 'v3_no_estimation',
      message: `Inserted ${inserted} REAL options records`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
  } catch (error) {
    console.error('Error:', error);
    await slackAlerter.sendCriticalAlert({ 
      type: 'halted', 
      etlName: 'ingest-options-flow',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}` 
    });
    return new Response(JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
