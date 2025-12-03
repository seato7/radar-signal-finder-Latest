import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callPerplexity } from "../_shared/perplexity-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Major ETFs to track flows for
const TRACKED_ETFS = [
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust' },
  { ticker: 'IWM', name: 'iShares Russell 2000 ETF' },
  { ticker: 'DIA', name: 'SPDR Dow Jones ETF' },
  { ticker: 'XLF', name: 'Financial Select Sector SPDR' },
  { ticker: 'XLK', name: 'Technology Select Sector SPDR' },
  { ticker: 'XLE', name: 'Energy Select Sector SPDR' },
  { ticker: 'XLV', name: 'Health Care Select Sector SPDR' },
  { ticker: 'XLI', name: 'Industrial Select Sector SPDR' },
  { ticker: 'XLP', name: 'Consumer Staples Select Sector SPDR' },
  { ticker: 'XLY', name: 'Consumer Discretionary Select Sector SPDR' },
  { ticker: 'XLB', name: 'Materials Select Sector SPDR' },
  { ticker: 'XLU', name: 'Utilities Select Sector SPDR' },
  { ticker: 'XLRE', name: 'Real Estate Select Sector SPDR' },
  { ticker: 'GLD', name: 'SPDR Gold Shares' },
  { ticker: 'SLV', name: 'iShares Silver Trust' },
  { ticker: 'USO', name: 'United States Oil Fund' },
  { ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF' },
  { ticker: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF' },
  { ticker: 'EEM', name: 'iShares MSCI Emerging Markets ETF' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const logger = new IngestLogger(supabaseClient, 'ingest-etf-flows');
  const slackAlerter = new SlackAlerter();
  await logger.start();
  const startTime = Date.now();

  try {
    console.log('📊 Starting ETF flows ingestion via Perplexity...');

    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY not configured - required for real ETF flow data');
    }

    let signalsCreated = 0;
    let signalsSkipped = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const etf of TRACKED_ETFS) {
      try {
        console.log(`Fetching ETF flows for ${etf.ticker}...`);
        
        const prompt = `What are the latest fund flows for ${etf.ticker} (${etf.name})?
Provide recent ETF flow data:
- DAILY_FLOW: most recent daily fund flow in millions USD (positive = inflow, negative = outflow)
- WEEKLY_FLOW: past 7 days total flow in millions USD
- MONTHLY_FLOW: past 30 days total flow in millions USD
- AUM: current assets under management in billions USD

Format your response EXACTLY as:
DAILY_FLOW: X
WEEKLY_FLOW: Y
MONTHLY_FLOW: Z
AUM: A`;

        const content = await callPerplexity(
          [{ role: 'user', content: prompt }],
          { apiKey: perplexityKey, model: 'sonar', temperature: 0.2, maxTokens: 200 }
        );

        // Parse response
        const dailyMatch = content.match(/DAILY_FLOW:\s*(-?[\d,.]+)/);
        const weeklyMatch = content.match(/WEEKLY_FLOW:\s*(-?[\d,.]+)/);
        const monthlyMatch = content.match(/MONTHLY_FLOW:\s*(-?[\d,.]+)/);
        const aumMatch = content.match(/AUM:\s*([\d,.]+)/);

        const parseNum = (match: RegExpMatchArray | null) => 
          match ? parseFloat(match[1].replace(/,/g, '')) : 0;

        const dailyFlow = parseNum(dailyMatch);
        const weeklyFlow = parseNum(weeklyMatch);
        const monthlyFlow = parseNum(monthlyMatch);
        const aum = parseNum(aumMatch);

        // Find asset
        const { data: asset } = await supabaseClient
          .from('assets')
          .select('id')
          .eq('ticker', etf.ticker)
          .single();

        // Generate checksum
        const checksumData = JSON.stringify({ date: today, ticker: etf.ticker });
        const encoder = new TextEncoder();
        const data = encoder.encode(checksumData);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if exists
        const { data: existing } = await supabaseClient
          .from('signals')
          .select('id')
          .eq('checksum', checksum)
          .single();

        if (existing) {
          signalsSkipped++;
          continue;
        }

        // Determine flow strength
        const flowMagnitude = Math.abs(dailyFlow) / (aum * 10 || 1); // Normalize by AUM
        const isSignificant = Math.abs(dailyFlow) > 100 || flowMagnitude > 0.001;

        // Insert signal
        const { error } = await supabaseClient
          .from('signals')
          .insert({
            signal_type: 'flow_pressure_etf',
            asset_id: asset?.id,
            value_text: etf.ticker,
            direction: dailyFlow > 0 ? 'up' : dailyFlow < 0 ? 'down' : 'neutral',
            magnitude: Math.min(flowMagnitude * 100, 1.0),
            observed_at: new Date().toISOString(),
            raw: {
              ticker: etf.ticker,
              daily_flow_millions: dailyFlow,
              weekly_flow_millions: weeklyFlow,
              monthly_flow_millions: monthlyFlow,
              aum_billions: aum,
              flow_pct_of_aum: flowMagnitude * 100,
            },
            citation: {
              source: 'Perplexity AI - ETF Flows',
              url: `https://www.etf.com/${etf.ticker}`,
              timestamp: new Date().toISOString()
            },
            checksum
          });

        if (error) {
          console.error(`Error inserting flow for ${etf.ticker}:`, error);
          signalsSkipped++;
        } else {
          signalsCreated++;
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (etfError) {
        console.error(`Error processing ${etf.ticker}:`, etfError);
        signalsSkipped++;
      }
    }

    const duration = Date.now() - startTime;

    await logger.success({
      source_used: 'Perplexity AI',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
      rows_inserted: signalsCreated,
      rows_skipped: signalsSkipped,
      metadata: { etf_count: TRACKED_ETFS.length }
    });

    console.log(`✅ ETF flows complete: ${signalsCreated} signals created`);
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-etf-flows',
      status: 'success',
      duration,
      rowsInserted: signalsCreated,
      rowsSkipped: signalsSkipped,
      sourceUsed: 'Perplexity AI',
      metadata: { etf_count: TRACKED_ETFS.length }
    });

    return new Response(JSON.stringify({
      success: true,
      signals_created: signalsCreated,
      signals_skipped: signalsSkipped,
      source: 'Perplexity AI'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    await logger.failure(error as Error, {
      source_used: 'Perplexity AI',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-etf-flows',
      message: `ETF flows ingestion failed: ${(error as Error).message}`
    });

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
