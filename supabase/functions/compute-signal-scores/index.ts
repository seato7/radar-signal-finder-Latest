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
      .select('id, signal_type, magnitude, direction, asset_id, observed_at, raw')
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

    // Batch update signals
    const { error: updateError } = await supabase
      .from('signals')
      .upsert(updates, { onConflict: 'id' });

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ 
        message: 'Signal scores computed successfully',
        processed: updates.length,
        timestamp: new Date().toISOString()
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
  const magnitude = signal.magnitude || 1.0;
  factors.normalized_magnitude = Math.min(Math.abs(magnitude) * 100, 100);

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
  return totalWeight > 0 ? Math.round((score / totalWeight) * 100) / 100 : 0;
}

function classifySignal(score: number, direction: string | null): string {
  if (score >= 75) {
    return direction === 'up' ? 'strong_bullish' : direction === 'down' ? 'strong_bearish' : 'strong_signal';
  } else if (score >= 50) {
    return direction === 'up' ? 'bullish' : direction === 'down' ? 'bearish' : 'moderate_signal';
  } else if (score >= 25) {
    return 'watchlist';
  } else {
    return 'neutral';
  }
}
