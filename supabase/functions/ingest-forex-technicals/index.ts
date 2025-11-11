import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alpha Vantage is FREE - no API key required for basic endpoints
const ALPHA_VANTAGE_API_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY') || 'demo';

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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    console.log('📊 Starting forex technical indicators ingestion...');

    // Get all forex pairs
    const { data: forexPairs, error: pairsError } = await supabaseClient
      .from('assets')
      .select('*')
      .eq('asset_class', 'forex');

    if (pairsError) throw pairsError;

    console.log(`Found ${forexPairs.length} forex pairs to analyze`);

    let successCount = 0;
    let errorCount = 0;

    for (const pair of forexPairs) {
      try {
        // Alpha Vantage uses format: from_currency=EUR&to_currency=USD
        const [fromCurrency, toCurrency] = pair.ticker.split('/');
        
        // Fetch technical indicators from Alpha Vantage
        const indicators = await fetchTechnicalIndicators(fromCurrency, toCurrency, pair.ticker);
        
        if (!indicators) {
          console.log(`⚠️ No data for ${pair.ticker}`);
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
              source: 'Alpha Vantage Technical Analysis',
              url: 'https://www.alphavantage.co/',
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
              source: 'Alpha Vantage Technical Analysis',
              url: 'https://www.alphavantage.co/',
              timestamp: new Date().toISOString()
            },
            checksum: `${pair.ticker}-ma-${Date.now()}`,
          });
        }

        successCount++;
        console.log(`✅ Processed ${pair.ticker}`);
        
        // Rate limiting - Alpha Vantage free tier: 5 API calls per minute
        await new Promise(resolve => setTimeout(resolve, 12000));
        
      } catch (error) {
        console.error(`❌ Error processing ${pair.ticker}:`, error);
        errorCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: forexPairs.length,
        successful: successCount,
        errors: errorCount,
        message: `Ingested technical indicators for ${successCount} forex pairs`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchTechnicalIndicators(fromCurrency: string, toCurrency: string, ticker: string): Promise<TechnicalIndicators | null> {
  try {
    // For forex pairs, use FX_DAILY to get price data first
    const fxUrl = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${fromCurrency}&to_symbol=${toCurrency}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    console.log(`Fetching forex data for ${ticker} (${fromCurrency} to ${toCurrency})...`);
    console.log(`URL: ${fxUrl.replace(ALPHA_VANTAGE_API_KEY, 'API_KEY')}`);
    
    const fxResp = await fetch(fxUrl);
    const fxData = await fxResp.json();
    
    console.log(`Response for ${ticker}:`, JSON.stringify(fxData).substring(0, 500));
    
    // Check for rate limit or error
    if (fxData['Note']) {
      console.error(`⚠️ Rate limit hit for ${ticker}: ${fxData['Note']}`);
      return null;
    }
    
    if (fxData['Error Message']) {
      console.error(`❌ API Error for ${ticker}: ${fxData['Error Message']}`);
      return null;
    }
    
    const timeSeriesData = fxData['Time Series FX (Daily)'];
    
    if (!timeSeriesData) {
      console.error(`❌ No time series data for ${ticker}. Keys in response:`, Object.keys(fxData));
      return null;
    }

    // Get latest date's data
    const dates = Object.keys(timeSeriesData).sort().reverse();
    const latestDate = dates[0];
    const latestData = timeSeriesData[latestDate];
    
    console.log(`✅ Got ${dates.length} days of data for ${ticker}, latest: ${latestDate}`);
    
    const closePrices = dates.slice(0, 200).map(date => parseFloat(timeSeriesData[date]['4. close']));
    
    // Calculate simple technical indicators from price data
    const rsi14 = calculateRSI(closePrices, 14);
    const sma50 = calculateSMA(closePrices, 50);
    const sma200 = calculateSMA(closePrices, 200);

    return {
      close_price: parseFloat(latestData['4. close']),
      rsi_14: rsi14,
      sma_50: sma50,
      sma_200: sma200,
    };
  } catch (error) {
    console.error(`💥 Error fetching technical indicators for ${ticker}:`, error);
    return null;
  }
}

// Helper function to calculate RSI
function calculateRSI(prices: number[], period: number): number | undefined {
  if (prices.length < period + 1) return undefined;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i - 1] - prices[i];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Helper function to calculate SMA
function calculateSMA(prices: number[], period: number): number | undefined {
  if (prices.length < period) return undefined;
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
}
