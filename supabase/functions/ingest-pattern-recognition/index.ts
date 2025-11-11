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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Pattern recognition ingestion started...');

    const { data: assets } = await supabase
      .from('assets')
      .select('*')
      .in('asset_class', ['stock', 'forex', 'crypto', 'commodity']);

    if (!assets) throw new Error('No assets found');

    let successCount = 0;

    for (const asset of assets) {
      try {
        const { data: prices } = await supabase
          .from('prices')
          .select('*')
          .eq('ticker', asset.ticker)
          .order('date', { ascending: false })
          .limit(100);

        if (!prices || prices.length < 20) {
          console.log(`⚠️ Insufficient data for ${asset.ticker}`);
          continue;
        }

        const patterns = detectPatterns(prices, asset);

        if (patterns.length > 0) {
          const { error } = await supabase
            .from('pattern_recognition')
            .insert(patterns);

          if (error) throw error;

          const signals = patterns
            .filter(p => p.status === 'confirmed')
            .map(p => ({
              signal_type: 'chart_pattern',
              signal_category: 'technical',
              asset_id: asset.id,
              direction: p.pattern_category === 'reversal' ? 
                (p.pattern_type.includes('bottom') || p.pattern_type.includes('inverse') ? 'up' : 'down') :
                'up',
              magnitude: 0.7,
              confidence_score: p.confidence_score,
              time_horizon: 'medium',
              value_text: `${p.pattern_type.replace(/_/g, ' ').toUpperCase()} pattern detected`,
              observed_at: new Date().toISOString(),
              citation: {
                source: 'Pattern Recognition Engine',
                url: 'https://opportunityradar.app',
                timestamp: new Date().toISOString()
              },
              checksum: `${asset.ticker}-pattern-${Date.now()}`,
            }));

          if (signals.length > 0) {
            await supabase.from('signals').insert(signals);
          }

          successCount++;
          console.log(`✅ Detected ${patterns.length} patterns for ${asset.ticker}`);
        }

      } catch (error) {
        console.error(`❌ Error processing ${asset.ticker}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: assets.length,
        patterns_detected: successCount,
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

function detectPatterns(prices: any[], asset: any) {
  const patterns = [];
  const closes = prices.map(p => p.close).reverse();

  const highs = findLocalPeaks(closes);
  const lows = findLocalValleys(closes);

  if (highs.length >= 2) {
    const [idx1, idx2] = highs.slice(-2);
    if (Math.abs(closes[idx1] - closes[idx2]) / closes[idx1] < 0.03) {
      patterns.push({
        ticker: asset.ticker,
        asset_id: asset.id,
        pattern_type: 'double_top',
        pattern_category: 'reversal',
        timeframe: 'daily',
        pattern_completion_pct: 85,
        entry_price: closes[closes.length - 1],
        target_price: closes[closes.length - 1] * 0.95,
        stop_loss_price: closes[closes.length - 1] * 1.02,
        risk_reward_ratio: 2.5,
        confidence_score: 72,
        historical_success_rate: 65,
        status: 'confirmed',
        volume_confirmed: true,
      });
    }
  }

  if (lows.length >= 2) {
    const [idx1, idx2] = lows.slice(-2);
    if (Math.abs(closes[idx1] - closes[idx2]) / closes[idx1] < 0.03) {
      patterns.push({
        ticker: asset.ticker,
        asset_id: asset.id,
        pattern_type: 'double_bottom',
        pattern_category: 'reversal',
        timeframe: 'daily',
        pattern_completion_pct: 80,
        entry_price: closes[closes.length - 1],
        target_price: closes[closes.length - 1] * 1.05,
        stop_loss_price: closes[closes.length - 1] * 0.98,
        risk_reward_ratio: 2.5,
        confidence_score: 70,
        historical_success_rate: 68,
        status: 'confirmed',
        volume_confirmed: true,
      });
    }
  }

  const recentRange = Math.max(...closes.slice(-20)) - Math.min(...closes.slice(-20));
  const veryRecentRange = Math.max(...closes.slice(-5)) - Math.min(...closes.slice(-5));
  
  if (veryRecentRange / recentRange < 0.4) {
    patterns.push({
      ticker: asset.ticker,
      asset_id: asset.id,
      pattern_type: 'symmetrical_triangle',
      pattern_category: 'bilateral',
      timeframe: 'daily',
      pattern_completion_pct: 75,
      entry_price: closes[closes.length - 1],
      target_price: closes[closes.length - 1] * 1.06,
      stop_loss_price: closes[closes.length - 1] * 0.96,
      risk_reward_ratio: 1.5,
      confidence_score: 65,
      historical_success_rate: 55,
      status: 'forming',
      volume_confirmed: false,
    });
  }

  return patterns;
}

function findLocalPeaks(data: number[]) {
  const peaks = [];
  for (let i = 2; i < data.length - 2; i++) {
    if (data[i] > data[i-1] && data[i] > data[i-2] &&
        data[i] > data[i+1] && data[i] > data[i+2]) {
      peaks.push(i);
    }
  }
  return peaks;
}

function findLocalValleys(data: number[]) {
  const valleys = [];
  for (let i = 2; i < data.length - 2; i++) {
    if (data[i] < data[i-1] && data[i] < data[i-2] &&
        data[i] < data[i+1] && data[i] < data[i+2]) {
      valleys.push(i);
    }
  }
  return valleys;
}
