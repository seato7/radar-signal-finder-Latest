import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TwelveData API for forex technicals
const TWELVEDATA_API_KEY = Deno.env.get('TWELVEDATA_API_KEY') || '';
const MAX_CREDITS_PER_MINUTE = 50; // Shared limit with backend

interface TechnicalIndicators {
  rsi_14?: number;
  macd_line?: number;
  macd_signal?: number;
  macd_histogram?: number;
  sma_50?: number;
  sma_200?: number;
  ema_50?: number;
  ema_200?: number;
  atr_14?: number;
  close_price?: number;
  bollinger_upper?: number;
  bollinger_middle?: number;
  bollinger_lower?: number;
}

interface CreditAcquireResult {
  acquired: boolean;
  current_credits: number;
  wait_seconds: number;
}

// Acquire credits from shared counter (waits if needed)
async function acquireCredits(
  supabaseClient: any,
  creditsNeeded: number
): Promise<boolean> {
  const maxAttempts = 5;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabaseClient.rpc('acquire_twelvedata_credits', {
      credits_needed: creditsNeeded,
      max_credits: MAX_CREDITS_PER_MINUTE
    }) as { data: CreditAcquireResult[] | null; error: any };
    
    if (error) {
      console.error('❌ Error acquiring credits:', error);
      return false;
    }
    
    const result = data?.[0];
    
    if (!result) {
      console.error('❌ No result from acquire_twelvedata_credits');
      return false;
    }
    
    if (result.acquired) {
      console.log(`✅ Acquired ${creditsNeeded} credits. Total this minute: ${result.current_credits}/${MAX_CREDITS_PER_MINUTE}`);
      return true;
    }
    
    // Need to wait
    console.log(`⏳ Credit limit reached (${result.current_credits}/${MAX_CREDITS_PER_MINUTE}). Waiting ${result.wait_seconds}s...`);
    await new Promise(resolve => setTimeout(resolve, result.wait_seconds * 1000));
  }
  
  console.error('❌ Failed to acquire credits after max attempts');
  return false;
}

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
    console.log('📊 Starting forex technical indicators ingestion via TwelveData (with shared rate limiting)...');

    if (!TWELVEDATA_API_KEY) {
      console.error('❌ TWELVEDATA_API_KEY not configured');
      
      await supabaseClient.from('function_status').insert({
        function_name: 'ingest-forex-technicals',
        executed_at: new Date().toISOString(),
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        fallback_used: null,
        duration_ms: Date.now() - startTime,
        source_used: 'TwelveData',
        error_message: 'TWELVEDATA_API_KEY not configured',
        metadata: {}
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'TWELVEDATA_API_KEY not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all forex pairs
    const { data: forexPairs, error: pairsError } = await supabaseClient
      .from('assets')
      .select('*')
      .eq('asset_class', 'forex');

    if (pairsError) throw pairsError;

    console.log(`Found ${forexPairs.length} forex pairs to analyze`);

    let successCount = 0;
    let errorCount = 0;

    // Process limited number of pairs to prevent timeout
    const pairsToProcess = forexPairs.slice(0, 5);
    console.log(`Processing ${pairsToProcess.length} pairs with shared rate limiting`);

    for (const pair of pairsToProcess) {
      try {
        const ticker = pair.ticker;
        
        // Fetch technical indicators from TwelveData using shared rate limiter
        const indicators = await fetchTechnicalIndicatorsFromTwelveData(ticker, supabaseClient);
        
        if (!indicators) {
          console.log(`⚠️ No data for ${ticker}`);
          errorCount++;
          continue;
        }

        // Calculate signals
        const rsiSignal = indicators.rsi_14 
          ? (indicators.rsi_14 < 30 ? 'oversold' : indicators.rsi_14 > 70 ? 'overbought' : 'neutral')
          : 'neutral';

        const macdCrossover = indicators.macd_histogram 
          ? (indicators.macd_histogram > 0 ? 'bullish' : 'bearish')
          : 'none';

        const maCrossover = (indicators.sma_50 && indicators.sma_200)
          ? (indicators.sma_50 > indicators.sma_200 ? 'golden_cross' : 'death_cross')
          : 'none';

        // Insert technical data
        const { error: insertError } = await supabaseClient
          .from('forex_technicals')
          .insert({
            ticker: pair.ticker,
            asset_id: pair.id,
            ...indicators,
            rsi_signal: rsiSignal,
            macd_crossover: macdCrossover,
            ma_crossover: maCrossover,
          });

        if (insertError) throw insertError;

        // Create signals for significant events
        if (rsiSignal !== 'neutral') {
          await supabaseClient.from('signals').insert({
            signal_type: 'technical_rsi',
            asset_id: pair.id,
            direction: rsiSignal === 'oversold' ? 'up' : 'down',
            magnitude: Math.abs((indicators.rsi_14 || 50) - 50) / 50,
            value_text: `RSI ${indicators.rsi_14?.toFixed(2)} - ${rsiSignal}`,
            observed_at: new Date().toISOString(),
            citation: {
              source: 'TwelveData Technical Analysis',
              url: 'https://twelvedata.com/',
              timestamp: new Date().toISOString()
            },
            checksum: `${pair.ticker}-rsi-${Date.now()}`,
          });
        }

        if (maCrossover !== 'none') {
          await supabaseClient.from('signals').insert({
            signal_type: 'technical_ma_crossover',
            asset_id: pair.id,
            direction: maCrossover === 'golden_cross' ? 'up' : 'down',
            magnitude: 0.8,
            value_text: `${maCrossover.replace('_', ' ').toUpperCase()}`,
            observed_at: new Date().toISOString(),
            citation: {
              source: 'TwelveData Technical Analysis',
              url: 'https://twelvedata.com/',
              timestamp: new Date().toISOString()
            },
            checksum: `${pair.ticker}-ma-${Date.now()}`,
          });
        }

        successCount++;
        console.log(`✅ Processed ${pair.ticker}`);
        
      } catch (error) {
        console.error(`❌ Error processing ${pair.ticker}:`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    // @guard: Heartbeat log to function_status
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-forex-technicals',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: errorCount,
      fallback_used: null,
      duration_ms: duration,
      source_used: 'TwelveData',
      error_message: null,
      metadata: { pairs_processed: pairsToProcess.length, shared_rate_limiting: true }
    });
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-technicals',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: errorCount,
      sourceUsed: 'TwelveData',
      metadata: { pairs_processed: pairsToProcess.length }
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: pairsToProcess.length,
        successful: successCount,
        errors: errorCount,
        source: 'TwelveData',
        message: `Ingested technical indicators for ${successCount} forex pairs (shared rate limiting)`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    const duration = Date.now() - startTime;
    
    // @guard: Heartbeat log failure
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-forex-technicals',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      fallback_used: null,
      duration_ms: duration,
      source_used: 'TwelveData',
      error_message: (error as Error).message,
      metadata: {}
    });
    
    // Send Slack failure alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-technicals',
      status: 'failed',
      duration,
      rowsInserted: 0,
      rowsSkipped: 0,
      sourceUsed: 'TwelveData',
      metadata: { error: (error as Error).message }
    });
    
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchTechnicalIndicatorsFromTwelveData(
  ticker: string,
  supabaseClient: any
): Promise<TechnicalIndicators | null> {
  try {
    // Each API call = 1 credit. We need 5 credits for full technical analysis.
    // Acquire all 5 credits upfront using shared counter
    const creditsNeeded = 5;
    const acquired = await acquireCredits(supabaseClient, creditsNeeded);
    
    if (!acquired) {
      console.error(`❌ Could not acquire ${creditsNeeded} credits for ${ticker}`);
      return null;
    }
    
    // Fetch RSI
    const rsiUrl = `https://api.twelvedata.com/rsi?symbol=${ticker}&interval=1day&time_period=14&apikey=${TWELVEDATA_API_KEY}`;
    const rsiResp = await fetch(rsiUrl);
    const rsiData = await rsiResp.json();
    
    // Check for API errors
    if (rsiData.code === 400 || rsiData.status === 'error') {
      console.log(`⚠️ TwelveData error for ${ticker}: ${rsiData.message || 'Unknown error'}`);
      return null;
    }
    
    const rsi_14 = rsiData.values?.[0]?.rsi ? parseFloat(rsiData.values[0].rsi) : undefined;
    
    // Small delay between calls to avoid burst issues
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Fetch SMA 50
    const sma50Url = `https://api.twelvedata.com/sma?symbol=${ticker}&interval=1day&time_period=50&apikey=${TWELVEDATA_API_KEY}`;
    const sma50Resp = await fetch(sma50Url);
    const sma50Data = await sma50Resp.json();
    const sma_50 = sma50Data.values?.[0]?.sma ? parseFloat(sma50Data.values[0].sma) : undefined;
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Fetch SMA 200
    const sma200Url = `https://api.twelvedata.com/sma?symbol=${ticker}&interval=1day&time_period=200&apikey=${TWELVEDATA_API_KEY}`;
    const sma200Resp = await fetch(sma200Url);
    const sma200Data = await sma200Resp.json();
    const sma_200 = sma200Data.values?.[0]?.sma ? parseFloat(sma200Data.values[0].sma) : undefined;
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Fetch MACD
    const macdUrl = `https://api.twelvedata.com/macd?symbol=${ticker}&interval=1day&apikey=${TWELVEDATA_API_KEY}`;
    const macdResp = await fetch(macdUrl);
    const macdData = await macdResp.json();
    
    const macd_line = macdData.values?.[0]?.macd ? parseFloat(macdData.values[0].macd) : undefined;
    const macd_signal = macdData.values?.[0]?.macd_signal ? parseFloat(macdData.values[0].macd_signal) : undefined;
    const macd_histogram = macdData.values?.[0]?.macd_hist ? parseFloat(macdData.values[0].macd_hist) : undefined;
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Fetch current price
    const priceUrl = `https://api.twelvedata.com/price?symbol=${ticker}&apikey=${TWELVEDATA_API_KEY}`;
    const priceResp = await fetch(priceUrl);
    const priceData = await priceResp.json();
    const close_price = priceData.price ? parseFloat(priceData.price) : undefined;
    
    console.log(`📊 ${ticker}: RSI=${rsi_14?.toFixed(2)}, SMA50=${sma_50?.toFixed(5)}, SMA200=${sma_200?.toFixed(5)}, Price=${close_price?.toFixed(5)}`);
    
    return {
      rsi_14,
      sma_50,
      sma_200,
      macd_line,
      macd_signal,
      macd_histogram,
      close_price,
    };
    
  } catch (error) {
    console.error(`Error fetching TwelveData for ${ticker}:`, error);
    return null;
  }
}
