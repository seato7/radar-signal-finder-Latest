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
        const symbol = pair.ticker.replace('/', '');
        
        // Fetch technical indicators from Alpha Vantage
        const indicators = await fetchTechnicalIndicators(symbol);
        
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

async function fetchTechnicalIndicators(symbol: string): Promise<TechnicalIndicators | null> {
  try {
    // Fetch RSI
    const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const rsiResp = await fetch(rsiUrl);
    const rsiData = await rsiResp.json();
    
    // Fetch MACD
    const macdUrl = `https://www.alphavantage.co/query?function=MACD&symbol=${symbol}&interval=daily&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const macdResp = await fetch(macdUrl);
    const macdData = await macdResp.json();

    // Fetch SMA
    const smaUrl = `https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=50&series_type=close&apikey=${ALPHA_VANTAGE_API_KEY}`;
    const smaResp = await fetch(smaUrl);
    const smaData = await smaResp.json();

    // Extract latest values
    const rsiValues = rsiData['Technical Analysis: RSI'];
    const macdValues = macdData['Technical Analysis: MACD'];
    const smaValues = smaData['Technical Analysis: SMA'];

    if (!rsiValues && !macdValues && !smaValues) {
      return null;
    }

    const latestRsiKey = rsiValues ? Object.keys(rsiValues)[0] : null;
    const latestMacdKey = macdValues ? Object.keys(macdValues)[0] : null;
    const latestSmaKey = smaValues ? Object.keys(smaValues)[0] : null;

    return {
      rsi_14: latestRsiKey ? parseFloat(rsiValues[latestRsiKey]['RSI']) : undefined,
      macd_line: latestMacdKey ? parseFloat(macdValues[latestMacdKey]['MACD']) : undefined,
      macd_signal: latestMacdKey ? parseFloat(macdValues[latestMacdKey]['MACD_Signal']) : undefined,
      macd_histogram: latestMacdKey ? parseFloat(macdValues[latestMacdKey]['MACD_Hist']) : undefined,
      sma_50: latestSmaKey ? parseFloat(smaValues[latestSmaKey]['SMA']) : undefined,
    };
  } catch (error) {
    console.error('Error fetching technical indicators:', error);
    return null;
  }
}
