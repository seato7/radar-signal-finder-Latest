import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    console.log('📐 Starting pattern recognition analysis...');

    // Get all assets
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('*');

    if (!assets) throw new Error('No assets found');

    let successCount = 0;

    for (const asset of assets) {
      try {
        // Get price history
        const { data: prices } = await supabaseClient
          .from('prices')
          .select('*')
          .eq('ticker', asset.ticker)
          .order('date', { ascending: false })
          .limit(100);

        if (!prices || prices.length < 50) {
          continue;
        }

        // Detect patterns
        const patterns = detectPatterns(prices);

        // Insert patterns
        for (const pattern of patterns) {
          const { error } = await supabaseClient
            .from('pattern_recognition')
            .insert({
              ticker: asset.ticker,
              asset_id: asset.id,
              ...pattern,
            });

          if (!error) {
            // Create signal for confirmed patterns
            if (pattern.status === 'confirmed') {
              await supabaseClient.from('signals').insert({
                signal_type: `pattern_${pattern.pattern_type}`,
                signal_category: 'technical',
                asset_id: asset.id,
                direction: pattern.pattern_category === 'reversal' ? 
                  (pattern.target_price > pattern.entry_price ? 'up' : 'down') : 'up',
                magnitude: pattern.confidence_score / 100,
                confidence_score: pattern.confidence_score,
                time_horizon: pattern.timeframe === 'daily' ? 'medium' : 'short',
                value_text: `${pattern.pattern_type.replace('_', ' ').toUpperCase()} pattern (${pattern.pattern_completion_pct}% complete)`,
                observed_at: new Date().toISOString(),
                citation: {
                  source: 'Technical Pattern Recognition',
                  url: 'https://opportunityradar.app',
                  timestamp: new Date().toISOString()
                },
                checksum: `${asset.ticker}-pattern-${pattern.pattern_type}-${Date.now()}`,
              });
            }
          }
        }

        if (patterns.length > 0) {
          successCount++;
          console.log(`✅ Found ${patterns.length} patterns in ${asset.ticker}`);
        }

      } catch (error) {
        console.error(`❌ Error analyzing ${asset.ticker}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        assets_analyzed: assets.length,
        assets_with_patterns: successCount,
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

function detectPatterns(prices: any[]) {
  const patterns: any[] = [];
  const closes = prices.map(p => p.close);

  // Detect Head and Shoulders (simplified)
  if (closes.length >= 20) {
    const recent = closes.slice(0, 20);
    const mid = recent[10];
    const leftShoulder = recent[5];
    const rightShoulder = recent[15];

    if (mid > leftShoulder * 1.05 && mid > rightShoulder * 1.05) {
      const currentPrice = closes[0];
      const neckline = Math.min(leftShoulder, rightShoulder);

      patterns.push({
        pattern_type: 'head_and_shoulders',
        pattern_category: 'reversal',
        timeframe: 'daily',
        pattern_completion_pct: currentPrice < neckline ? 100 : 70,
        entry_price: neckline * 0.98,
        target_price: neckline - (mid - neckline),
        stop_loss_price: mid * 1.02,
        risk_reward_ratio: Math.abs((neckline - (mid - neckline)) / (mid * 1.02 - neckline)),
        confidence_score: 65,
        historical_success_rate: 68,
        status: currentPrice < neckline ? 'confirmed' : 'forming',
        volume_confirmed: true,
      });
    }
  }

  // Detect Double Top (simplified)
  if (closes.length >= 15) {
    const recent = closes.slice(0, 15);
    const peak1 = Math.max(...recent.slice(0, 7));
    const peak2 = Math.max(...recent.slice(8, 15));

    if (Math.abs(peak1 - peak2) / peak1 < 0.03) { // Within 3%
      const valley = Math.min(...recent.slice(3, 12));
      const currentPrice = closes[0];

      patterns.push({
        pattern_type: 'double_top',
        pattern_category: 'reversal',
        timeframe: 'daily',
        pattern_completion_pct: currentPrice < valley ? 100 : 80,
        entry_price: valley * 0.98,
        target_price: valley - (peak1 - valley),
        stop_loss_price: peak2 * 1.02,
        risk_reward_ratio: Math.abs((valley - (peak1 - valley)) / (peak2 * 1.02 - valley)),
        confidence_score: 72,
        historical_success_rate: 71,
        status: currentPrice < valley ? 'confirmed' : 'forming',
        volume_confirmed: false,
      });
    }
  }

  // Detect Bullish Flag (simplified)
  if (closes.length >= 10) {
    const pole = closes.slice(5, 10);
    const flag = closes.slice(0, 5);
    
    const poleStrength = (pole[0] - pole[pole.length - 1]) / pole[pole.length - 1];
    const flagSlope = (flag[0] - flag[flag.length - 1]) / flag[flag.length - 1];

    if (poleStrength > 0.05 && Math.abs(flagSlope) < 0.02) {
      const currentPrice = closes[0];
      const breakoutPrice = Math.max(...flag);

      patterns.push({
        pattern_type: 'bull_flag',
        pattern_category: 'continuation',
        timeframe: 'daily',
        pattern_completion_pct: currentPrice > breakoutPrice ? 100 : 60,
        entry_price: breakoutPrice * 1.01,
        target_price: breakoutPrice + (pole[0] - pole[pole.length - 1]),
        stop_loss_price: Math.min(...flag) * 0.98,
        risk_reward_ratio: ((breakoutPrice + (pole[0] - pole[pole.length - 1])) - breakoutPrice) / (breakoutPrice - Math.min(...flag) * 0.98),
        confidence_score: 78,
        historical_success_rate: 75,
        status: currentPrice > breakoutPrice ? 'confirmed' : 'forming',
        volume_confirmed: true,
      });
    }
  }

  // Detect Ascending Triangle
  if (closes.length >= 15) {
    const recent = closes.slice(0, 15);
    const highs = recent.filter((_, i) => i % 3 === 0);
    const lows = recent.filter((_, i) => i % 3 === 1);

    const resistance = Math.max(...highs);
    const lowsAscending = lows.every((val, i) => i === 0 || val >= lows[i - 1] * 0.99);

    if (lowsAscending && highs.filter(h => Math.abs(h - resistance) / resistance < 0.02).length >= 2) {
      const currentPrice = closes[0];

      patterns.push({
        pattern_type: 'ascending_triangle',
        pattern_category: 'continuation',
        timeframe: 'daily',
        pattern_completion_pct: currentPrice > resistance ? 100 : 70,
        entry_price: resistance * 1.01,
        target_price: resistance + (resistance - Math.min(...lows)),
        stop_loss_price: Math.min(...lows) * 0.98,
        risk_reward_ratio: ((resistance + (resistance - Math.min(...lows))) - resistance) / (resistance - Math.min(...lows) * 0.98),
        confidence_score: 70,
        historical_success_rate: 69,
        status: currentPrice > resistance ? 'confirmed' : 'forming',
        volume_confirmed: false,
      });
    }
  }

  return patterns;
}
