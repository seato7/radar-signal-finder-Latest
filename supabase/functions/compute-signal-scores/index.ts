// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoringWeights {
  technical: number;
  institutional: number;
  sentiment: number;
  macro: number;
  onchain: number;
}

interface SignalScoreFactors {
  technical_score: number;
  institutional_score: number;
  sentiment_score: number;
  macro_score: number;
  onchain_score: number;
  normalized_magnitude: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch active scoring configuration
    const { data: configData, error: configError } = await supabase
      .from('scoring_config')
      .select('weights')
      .eq('is_active', true)
      .eq('config_name', 'default')
      .single();

    if (configError) throw configError;

    const weights: ScoringWeights = configData.weights as ScoringWeights;

    // Fetch all signals without composite_score
    const { data: signals, error: signalsError } = await supabase
      .from('signals')
      .select('id, signal_type, magnitude, direction, asset_id, observed_at, raw, source_used')
      .is('composite_score', null)
      .order('observed_at', { ascending: false })
      .limit(1000);

    if (signalsError) throw signalsError;

    if (!signals || signals.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No signals to score', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch asset information to determine asset_class
    const assetIds = [...new Set(signals.map(s => s.asset_id).filter(Boolean))];
    const { data: assets } = await supabase
      .from('assets')
      .select('id, asset_class')
      .in('id', assetIds);

    const assetClassMap = new Map(assets?.map(a => [a.id, a.asset_class]) || []);

    // Compute scores for each signal
    const updates = signals.map(signal => {
      const assetClass = signal.asset_id ? assetClassMap.get(signal.asset_id) || 'unknown' : 'unknown';
      const scoreFactors = computeScoreFactors(signal, weights);
      const compositeScore = computeCompositeScore(scoreFactors, weights, assetClass);
      const signalClassification = classifySignal(compositeScore, signal.direction);

      return {
        id: signal.id,
        composite_score: compositeScore,
        score_factors: scoreFactors,
        signal_classification: signalClassification,
        asset_class: assetClass,
      };
    });

    // Batch update signals (update only, not upsert)
    let updateCount = 0;
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('signals')
        .update({
          composite_score: update.composite_score,
          score_factors: update.score_factors,
          signal_classification: update.signal_classification,
        })
        .eq('id', update.id);

      if (updateError) {
        console.error(`Failed to update signal ${update.id}:`, updateError);
      } else {
        updateCount++;
      }
    }

    console.log(`Updated ${updateCount}/${updates.length} signals`);

    // PHASE 4: Check for signal distribution skew after scoring
    const { data: skewCheck, error: skewError } = await supabase
      .rpc('check_signal_distribution_skew');

    let skewAlert = null;
    if (!skewError && skewCheck && skewCheck.length > 0) {
      const skew = skewCheck[0];
      if (skew.is_skewed) {
        console.warn(skew.message);
        skewAlert = skew;

        // PHASE 4: Trigger alert for excessive skew
        const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
        if (slackWebhook) {
          try {
            await fetch(slackWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: skew.message,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `*Signal Distribution Alert*\n\n${skew.message}\n\n• Buy signals: ${skew.buy_count} (${skew.buy_percentage}%)\n• Sell signals: ${skew.sell_count} (${skew.sell_percentage}%)\n• Neutral signals: ${skew.neutral_count} (${skew.neutral_percentage}%)`
                    }
                  }
                ]
              })
            });
          } catch (err) {
            console.error('Failed to send Slack alert for signal skew:', err);
          }
        }

        // Also insert to alerts table
        await supabase.from('system_alerts').insert({
          alert_type: 'signal_skew',
          severity: 'high',
          message: skew.message,
          metadata: {
            buy_count: skew.buy_count,
            sell_count: skew.sell_count,
            neutral_count: skew.neutral_count,
            buy_percentage: skew.buy_percentage,
            sell_percentage: skew.sell_percentage,
          }
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Signal scores computed successfully',
        processed: updates.length,
        timestamp: new Date().toISOString(),
        skew_detected: skewAlert ? true : false,
        skew_alert: skewAlert,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error computing signal scores:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function computeScoreFactors(signal: any, weights: ScoringWeights): SignalScoreFactors {
  const factors: SignalScoreFactors = {
    technical_score: 0,
    institutional_score: 0,
    sentiment_score: 0,
    macro_score: 0,
    onchain_score: 0,
    normalized_magnitude: 0,
  };

  // Normalize magnitude to 0-100 scale
  // FIX: Magnitude is now on 0-5 scale (was 0-1). Divide by 5 before multiplying by 100.
  const magnitude = signal.magnitude || 1.0;
  factors.normalized_magnitude = Math.min((Math.abs(magnitude) / 5) * 100, 100);

  // Map signal types to scoring dimensions
  const signalType = signal.signal_type.toLowerCase();

  // Technical signals
  if (signalType.includes('technical') || signalType.includes('pattern') || 
      signalType.includes('breakout') || signalType.includes('support') || 
      signalType.includes('resistance') || signalType.includes('rsi') || 
      signalType.includes('macd')) {
    factors.technical_score = factors.normalized_magnitude;
  }

  // Institutional/Insider signals
  if (signalType.includes('13f') || signalType.includes('insider') || 
      signalType.includes('institutional') || signalType.includes('dark_pool') ||
      signalType.includes('smart_money')) {
    factors.institutional_score = factors.normalized_magnitude;
  }

  // Sentiment signals
  if (signalType.includes('sentiment') || signalType.includes('news') || 
      signalType.includes('social') || signalType.includes('reddit') ||
      signalType.includes('stocktwits')) {
    factors.sentiment_score = factors.normalized_magnitude;
  }

  // Macro/Economic signals
  if (signalType.includes('economic') || signalType.includes('cot') || 
      signalType.includes('fed') || signalType.includes('interest_rate') ||
      signalType.includes('gdp') || signalType.includes('cpi')) {
    factors.macro_score = factors.normalized_magnitude;
  }

  // On-chain signals (crypto only)
  if (signalType.includes('onchain') || signalType.includes('whale') || 
      signalType.includes('exchange_flow') || signalType.includes('nvt') ||
      signalType.includes('mvrv')) {
    factors.onchain_score = factors.normalized_magnitude;
  }

  return factors;
}

function computeCompositeScore(
  factors: SignalScoreFactors,
  weights: ScoringWeights,
  assetClass: string
): number {
  let score = 0;
  let totalWeight = 0;

  // Technical
  if (factors.technical_score > 0) {
    score += factors.technical_score * weights.technical;
    totalWeight += weights.technical;
  }

  // Institutional
  if (factors.institutional_score > 0) {
    score += factors.institutional_score * weights.institutional;
    totalWeight += weights.institutional;
  }

  // Sentiment
  if (factors.sentiment_score > 0) {
    score += factors.sentiment_score * weights.sentiment;
    totalWeight += weights.sentiment;
  }

  // Macro
  if (factors.macro_score > 0) {
    score += factors.macro_score * weights.macro;
    totalWeight += weights.macro;
  }

  // On-chain (crypto only)
  if (assetClass === 'crypto' && factors.onchain_score > 0) {
    score += factors.onchain_score * weights.onchain;
    totalWeight += weights.onchain;
  }

  // Normalize by total weight to get 0-100 scale
  const raw = totalWeight > 0 ? (score / totalWeight) * 100 : 0;
  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100; // clamp 0-100
}

function classifySignal(score: number, direction: string | null): string {
  if (score >= 75) {
    return direction === 'up' ? 'strong bullish' : direction === 'down' ? 'strong bearish' : 'strong signal';
  } else if (score >= 50) {
    return direction === 'up' ? 'bullish' : direction === 'down' ? 'bearish' : 'moderate signal';
  } else if (score >= 25) {
    return direction === 'up' ? 'weak bullish' : direction === 'down' ? 'weak bearish' : 'weak signal';
  } else {
    return direction === 'up' ? 'noise bullish (ignore)' : direction === 'down' ? 'noise bearish (ignore)' : 'noise (ignore)';
  }
}
