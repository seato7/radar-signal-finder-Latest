import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Twelve Data Options API
async function fetchTwelveDataOptions(ticker: string, apiKey: string): Promise<any> {
  try {
    const expUrl = `https://api.twelvedata.com/options/expiration?symbol=${ticker}&apikey=${apiKey}`;
    const expRes = await fetch(expUrl);
    if (!expRes.ok) return null;
    
    const expData = await expRes.json();
    if (!expData.dates || expData.dates.length === 0) return null;
    
    const chainUrl = `https://api.twelvedata.com/options/chain?symbol=${ticker}&expiration_date=${expData.dates[0]}&apikey=${apiKey}`;
    const chainRes = await fetch(chainUrl);
    if (!chainRes.ok) return null;
    
    return await chainRes.json();
  } catch (err) {
    console.log(`Options error for ${ticker}: ${err}`);
    return null;
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
    console.log('[REAL DATA] Options flow via Twelve Data API');
    
    const apiKey = Deno.env.get('TWELVEDATA_API_KEY');
    if (!apiKey) throw new Error('TWELVEDATA_API_KEY not configured');

    const tickers = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];
    const optionsRecords: any[] = [];
    
    for (const ticker of tickers) {
      const data = await fetchTwelveDataOptions(ticker, apiKey);
      if (data?.calls) {
        for (const c of data.calls.slice(0, 5)) {
          if (c.volume > 50) {
            optionsRecords.push({
              ticker, option_type: 'call', strike_price: c.strike,
              expiration_date: c.expiration_date, premium: c.last_price || 0,
              volume: c.volume || 0, open_interest: c.open_interest || 0,
              implied_volatility: c.implied_volatility || 0, flow_type: 'block',
              sentiment: 'bullish', trade_date: new Date().toISOString(),
              metadata: { source: 'TwelveData' }
            });
          }
        }
        console.log(`✅ ${ticker}: found options`);
      }
      await new Promise(r => setTimeout(r, 1200));
    }

    if (optionsRecords.length === 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Twelve Data API'], reason: 'No options data found'
      });
    }

    let inserted = 0;
    if (optionsRecords.length > 0) {
      const { error } = await supabase.from('options_flow').insert(optionsRecords);
      if (!error) inserted = optionsRecords.length;
    }

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow', status: inserted > 0 ? 'success' : 'partial',
      rowsInserted: inserted, rowsSkipped: 0, sourceUsed: 'TwelveData', duration: Date.now() - startTime
    });

    return new Response(JSON.stringify({ success: true, count: inserted, source: 'TwelveData' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    await slackAlerter.sendCriticalAlert({ type: 'halted', etlName: 'ingest-options-flow',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}` });
    return new Response(JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});