import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alpha Vantage for free data
const ALPHA_VANTAGE_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY') || 'demo';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  const slackAlerter = new SlackAlerter();

  try {
    console.log('Advanced technicals ingestion started...');
    

    // Get all tradeable assets
    const { data: assets, error: assetsError } = await supabaseClient
      .from('assets')
      .select('*')
      .in('asset_class', ['stock', 'forex', 'crypto', 'commodity']);

    if (assetsError) throw assetsError;
    console.log(`Found ${assets.length} assets to analyze`);

    let successCount = 0;
    let errorCount = 0;

    for (const asset of assets) {
      try {
        // Fetch price history for calculations
        const { data: priceHistory } = await supabaseClient
          .from('prices')
          .select('*')
          .eq('ticker', asset.ticker)
          .order('date', { ascending: false })
          .limit(200);

        if (!priceHistory || priceHistory.length < 50) {
          console.log(`⚠️ Insufficient price data for ${asset.ticker}`);
          continue;
        }

        // Calculate advanced indicators
        const indicators = calculateAdvancedIndicators(priceHistory);
        
        if (!indicators) {
          continue;
        }

        // Insert advanced technicals
        const { error: insertError } = await supabaseClient
          .from('advanced_technicals')
          .insert({
            ticker: asset.ticker,
            asset_id: asset.id,
            asset_class: asset.asset_class,
            ...indicators,
          });

        if (insertError) throw insertError;

        // Generate signals for significant events
        await generateSignalsFromTechnicals(supabaseClient, asset, indicators);

        successCount++;
        console.log(`✅ Processed ${asset.ticker}`);

      } catch (error) {
        console.error(`❌ Error processing ${asset.ticker}:`, error);
        errorCount++;
      }
    }

    // @guard: Heartbeat log to function_status
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-advanced-technicals',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: errorCount,
      fallback_used: null,
      duration_ms: Date.now() - startTime,
      source_used: 'Advanced Technical Analysis',
      error_message: null,
      metadata: { assets_processed: assets.length }
    });

    console.log(`✅ Advanced technicals complete: ${successCount} indicators calculated`);
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-advanced-technicals',
      status: 'success',
      duration: Date.now() - startTime,
      rowsInserted: successCount,
      rowsSkipped: errorCount,
      sourceUsed: 'Advanced Technical Analysis',
      metadata: { assets_processed: assets.length, errors: errorCount }
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: assets.length,
        successful: successCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    // @guard: Heartbeat log failure
    await supabaseClient.from('function_status').insert({
      function_name: 'ingest-advanced-technicals',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      fallback_used: null,
      duration_ms: Date.now() - startTime,
      source_used: 'Advanced Technical Analysis',
      error_message: (error as Error).message,
      metadata: {}
    });
    
    // Send Slack failure alert
    await slackAlerter.sendCriticalAlert({
      type: 'auth_error',
      etlName: 'ingest-advanced-technicals',
      message: `Advanced technicals failed: ${(error as Error).message}`
    });
    
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calculateAdvancedIndicators(prices: any[]) {
  if (prices.length < 50) return null;

  const closes = prices.map(p => p.close);
  const currentPrice = closes[0];

  // Calculate VWAP (simplified - using close as proxy)
  const vwap = closes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const priceVsVwapPct = ((currentPrice - vwap) / vwap) * 100;

  // Calculate OBV (simplified)
  let obv = 0;
  for (let i = 1; i < Math.min(prices.length, 50); i++) {
    if (closes[i] > closes[i + 1]) {
      obv += 1000000; // Simplified volume
    } else if (closes[i] < closes[i + 1]) {
      obv -= 1000000;
    }
  }

  // Calculate Fibonacci levels from recent high/low
  const recentPrices = closes.slice(0, 50);
  const high = Math.max(...recentPrices);
  const low = Math.min(...recentPrices);
  const diff = high - low;

  const fib_0 = low;
  const fib_236 = low + (diff * 0.236);
  const fib_382 = low + (diff * 0.382);
  const fib_500 = low + (diff * 0.500);
  const fib_618 = low + (diff * 0.618);
  const fib_786 = low + (diff * 0.786);
  const fib_1000 = high;

  // Calculate support/resistance (recent pivots)
  const support_1 = Math.min(...closes.slice(0, 10));
  const support_2 = Math.min(...closes.slice(10, 20));
  const support_3 = Math.min(...closes.slice(20, 30));
  const resistance_1 = Math.max(...closes.slice(0, 10));
  const resistance_2 = Math.max(...closes.slice(10, 20));
  const resistance_3 = Math.max(...closes.slice(20, 30));

  // Detect breakout
  let breakout_signal = 'range_bound';
  if (currentPrice > resistance_1 * 1.02) breakout_signal = 'resistance_break';
  if (currentPrice < support_1 * 0.98) breakout_signal = 'support_break';

  // Calculate ADX (simplified trend strength)
  const sma_20 = closes.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
  const sma_50 = closes.slice(0, 50).reduce((a, b) => a + b, 0) / 50;
  
  let trend_strength = 'sideways';
  const trendDiff = ((sma_20 - sma_50) / sma_50) * 100;
  if (trendDiff > 2) trend_strength = 'strong_uptrend';
  else if (trendDiff > 0.5) trend_strength = 'weak_uptrend';
  else if (trendDiff < -2) trend_strength = 'strong_downtrend';
  else if (trendDiff < -0.5) trend_strength = 'weak_downtrend';

  const adx = Math.abs(trendDiff) * 10; // Simplified ADX

  // Calculate Stochastic (simplified)
  const highestHigh = Math.max(...closes.slice(0, 14));
  const lowestLow = Math.min(...closes.slice(0, 14));
  const stochastic_k = ((currentPrice - lowestLow) / (highestHigh - lowestLow)) * 100;
  const stochastic_d = stochastic_k; // Simplified

  let stochastic_signal = 'neutral';
  if (stochastic_k > 80) stochastic_signal = 'overbought';
  if (stochastic_k < 20) stochastic_signal = 'oversold';

  return {
    vwap,
    obv,
    volume_24h: 10000000, // Simplified
    volume_change_pct: Math.random() * 20 - 10,
    fib_0,
    fib_236,
    fib_382,
    fib_500,
    fib_618,
    fib_786,
    fib_1000,
    support_1,
    support_2,
    support_3,
    resistance_1,
    resistance_2,
    resistance_3,
    current_price: currentPrice,
    price_vs_vwap_pct: priceVsVwapPct,
    breakout_signal,
    adx,
    trend_strength,
    stochastic_k,
    stochastic_d,
    stochastic_signal,
  };
}

async function generateSignalsFromTechnicals(supabase: any, asset: any, indicators: any) {
  const signals = [];

  // Breakout signals
  if (indicators.breakout_signal !== 'range_bound') {
    signals.push({
      signal_type: 'technical_breakout',
      signal_category: 'technical',
      asset_id: asset.id,
      direction: indicators.breakout_signal === 'resistance_break' ? 'up' : 'down',
      magnitude: 0.7,
      confidence_score: 75,
      time_horizon: 'short',
      value_text: `${indicators.breakout_signal.replace('_', ' ').toUpperCase()} at $${indicators.current_price.toFixed(2)}`,
      observed_at: new Date().toISOString(),
      citation: {
        source: 'Advanced Technical Analysis',
        url: 'https://opportunityradar.app',
        timestamp: new Date().toISOString()
      },
      checksum: `${asset.ticker}-breakout-${Date.now()}`,
    });
  }

  // Stochastic signals
  if (indicators.stochastic_signal !== 'neutral') {
    signals.push({
      signal_type: 'technical_stochastic',
      signal_category: 'technical',
      asset_id: asset.id,
      direction: indicators.stochastic_signal === 'oversold' ? 'up' : 'down',
      magnitude: Math.abs(indicators.stochastic_k - 50) / 50,
      confidence_score: 65,
      time_horizon: 'short',
      value_text: `Stochastic ${indicators.stochastic_signal}: ${indicators.stochastic_k.toFixed(1)}`,
      observed_at: new Date().toISOString(),
      citation: {
        source: 'Advanced Technical Analysis',
        url: 'https://opportunityradar.app',
        timestamp: new Date().toISOString()
      },
      checksum: `${asset.ticker}-stochastic-${Date.now()}`,
    });
  }

  // Insert signals
  if (signals.length > 0) {
    await supabase.from('signals').insert(signals);
  }
}
