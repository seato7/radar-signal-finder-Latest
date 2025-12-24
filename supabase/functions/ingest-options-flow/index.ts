import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v6 - Yahoo Finance Options Chain API with proper headers
// Fixed: Added browser-like headers to avoid 401 Unauthorized
// Fixed: Insert if (volume > 50) OR (openInterest > 500)

async function fetchYahooOptions(ticker: string): Promise<any[]> {
  try {
    // Try query1 first (less strict), then query2 as fallback
    const urls = [
      `https://query1.finance.yahoo.com/v7/finance/options/${ticker}`,
      `https://query2.finance.yahoo.com/v7/finance/options/${ticker}`,
    ];
    
    console.log(`Fetching Yahoo options for ${ticker}`);
    
    let response: Response | null = null;
    let successUrl = '';
    
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        });
        
        if (r.ok) {
          response = r;
          successUrl = url;
          break;
        }
        console.log(`Yahoo ${ticker} (${url.includes('query1') ? 'q1' : 'q2'}): HTTP ${r.status}`);
      } catch (e) {
        console.log(`Yahoo ${ticker} fetch error: ${e}`);
      }
    }
    
    if (!response || !response.ok) {
      console.log(`Yahoo ${ticker}: All endpoints failed`);
      return [];
    }
    
    // Debug: log response details
    console.log(`Yahoo ${ticker}: status=${response.status}, source=${successUrl.includes('query1') ? 'q1' : 'q2'}`);
    
    if (!response.ok) {
      console.log(`Yahoo ${ticker}: HTTP ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const result = data?.optionChain?.result?.[0];
    
    if (!result) {
      console.log(`Yahoo ${ticker}: no optionChain.result in response`);
      return [];
    }
    
    // Debug: log chain details
    const expirationDates = result.expirationDates || [];
    const calls = result.options?.[0]?.calls || [];
    const puts = result.options?.[0]?.puts || [];
    console.log(`Yahoo ${ticker}: ${expirationDates.length} expiries, ${calls.length} calls, ${puts.length} puts`);
    
    const options: any[] = [];
    const allOptions = [...calls, ...puts];
    
    // Calculate average volume to detect market hours
    const totalVolume = allOptions.reduce((sum, opt) => sum + (opt.volume || 0), 0);
    const avgVolume = allOptions.length > 0 ? totalVolume / allOptions.length : 0;
    const marketHoursLikely = avgVolume > 0;
    
    for (const opt of allOptions) {
      const volume = opt.volume || 0;
      const openInterest = opt.openInterest || 0;
      
      // Insert if (volume > 50) OR (openInterest > 500)
      if (volume > 50 || openInterest > 500) {
        const optionType = opt.contractSymbol?.includes('C') && !opt.contractSymbol?.includes('P') 
          ? 'call' 
          : 'put';
        
        options.push({
          ticker,
          option_type: optionType,
          strike_price: opt.strike || 0,
          expiration_date: opt.expiration ? new Date(opt.expiration * 1000).toISOString().split('T')[0] : null,
          premium: Math.round((opt.lastPrice || 0) * 100), // Convert to cents
          volume: volume,
          open_interest: openInterest,
          implied_volatility: opt.impliedVolatility || 0,
          // Set flow_type = null always (do not invent sweep/block)
          flow_type: null,
          // Sentiment: calls = bullish, puts = bearish
          sentiment: optionType === 'call' ? 'bullish' : 'bearish',
          trade_date: new Date().toISOString(),
          metadata: { 
            source: 'yahoo_finance', 
            marketHoursLikely,
            contract_symbol: opt.contractSymbol,
            bid: opt.bid,
            ask: opt.ask,
            change: opt.change,
            percentChange: opt.percentChange,
            inTheMoney: opt.inTheMoney
          }
        });
      }
    }
    
    console.log(`Yahoo ${ticker}: found ${options.length} options (volume>50 OR OI>500)`);
    return options;
  } catch (err) {
    console.log(`Yahoo error for ${ticker}: ${err}`);
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

  try {
    console.log('[v6] Options flow ingestion - Yahoo Finance Options Chain API');
    
    const allOptions: any[] = [];
    const tickers = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];
    
    for (const ticker of tickers) {
      const options = await fetchYahooOptions(ticker);
      allOptions.push(...options);
      // Rate limit: Yahoo allows ~2000 requests/hour, but be conservative
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`Total options found: ${allOptions.length}`);

    // If zero rows inserted, treat as failure and emit Slack alert
    if (allOptions.length === 0) {
      console.warn('⚠️ WARNING: No options data found - zero rows will be inserted');
      console.log('Possible reasons: outside market hours, API blocking, or no options meet criteria');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Yahoo Finance Options API'],
        reason: 'No options data - likely outside US market hours or API rate limited'
      });
      
      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Yahoo_Finance_Options',
        error_message: 'Zero rows inserted - no data available',
        metadata: { version: 'v6_yahoo_finance', reason: 'no_data_available' }
      });
      
      return new Response(JSON.stringify({ 
        success: false, 
        count: 0, 
        source: 'Yahoo_Finance_Options',
        version: 'v6_yahoo_finance',
        warning: 'No options data found - zero rows inserted'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert options data
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
    
    console.log(`✅ Inserted ${inserted} options records from Yahoo Finance`);

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow', 
      status: inserted > 0 ? 'success' : 'partial',
      rowsInserted: inserted, 
      rowsSkipped: 0, 
      sourceUsed: 'Yahoo_Finance_Options', 
      duration: Date.now() - startTime
    });

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'Yahoo_Finance_Options',
      metadata: { version: 'v6_yahoo_finance' }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      count: inserted, 
      source: 'Yahoo_Finance_Options',
      version: 'v6_yahoo_finance',
      message: `Inserted ${inserted} options records`
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
