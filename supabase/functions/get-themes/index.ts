import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WEIGHTS = {
  "PolicyMomentum": 1.0,
  "FlowPressure": 1.0,
  "BigMoneyConfirm": 1.0,
  "InsiderPoliticianConfirm": 0.8,
  "Attention": 0.5,
  "TechEdge": 0.4,
  "RiskFlags": -1.0,
  "CapexMomentum": 0.6,
};

const HALF_LIFE_DAYS = 14;

function exponentialDecay(daysAgo: number): number {
  if (daysAgo <= 0) return 1.0;
  return Math.exp(-Math.log(2) * daysAgo / HALF_LIFE_DAYS);
}

function computeThemeScore(signals: any[]): { score: number; components: Record<string, number>; positives: string[] } {
  const components: Record<string, number> = {};
  for (const key in WEIGHTS) components[key] = 0.0;

  const now = new Date();
  const signalContributions: Record<string, number[]> = {};
  for (const key in WEIGHTS) signalContributions[key] = [];

  for (const signal of signals) {
    const observedAt = new Date(signal.observed_at);
    const daysAgo = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decay = exponentialDecay(daysAgo);
    const magnitude = signal.magnitude || 1.0;
    const contribution = magnitude * decay;
    
    // Map actual signal types from database to scoring components
    const type = signal.signal_type;
    
    // Policy signals
    if (type.startsWith('policy_') || type === 'policy_approval') {
      signalContributions.PolicyMomentum.push(contribution);
    }
    // Smart money, dark pool, institutional flows
    else if (type === 'smart_money_flow' || type === 'dark_pool_activity' || type.startsWith('filing_')) {
      signalContributions.FlowPressure.push(contribution);
    }
    // Insider & congressional trades
    else if (type.startsWith('insider_') || type.startsWith('congressional_') || type === 'politician_buy') {
      signalContributions.BigMoneyConfirm.push(contribution);
    }
    // Sentiment & attention signals
    else if (type === 'sentiment_extreme' || type.startsWith('social_') || type === 'news_mention') {
      signalContributions.Attention.push(contribution);
    }
    // Technical signals (RSI, MACD, stochastic, patterns)
    else if (type.startsWith('technical_') || type === 'chart_pattern') {
      signalContributions.TechEdge.push(contribution);
    }
    // Crypto whale & exchange flows
    else if (type === 'crypto_whale_activity' || type === 'crypto_exchange_outflow' || type === 'crypto_exchange_inflow') {
      signalContributions.InsiderPoliticianConfirm.push(contribution * 0.5);
    }
    // Economic & risk indicators
    else if (type.startsWith('risk_') || type === 'economic_indicator') {
      signalContributions.RiskFlags.push(contribution);
    }
  }

  // Normalize components: count of signals scaled logarithmically
  for (const [component, contributions] of Object.entries(signalContributions)) {
    const count = contributions.length;
    if (count > 0) {
      // Use logarithmic scaling: more signals = higher score, but with diminishing returns
      // log2(count + 1) gives: 1 signal = 1, 3 signals = 2, 7 signals = 3, 15 signals = 4, etc.
      // Multiply by 2.5 to stretch the scale
      components[component] = Math.min(Math.log2(count + 1) * 2.5, 10);
    }
  }

  // Calculate weighted score
  let score = 0.0;
  for (const [component, value] of Object.entries(components)) {
    const weight = WEIGHTS[component as keyof typeof WEIGHTS];
    score += weight * value;
  }
  
  // Scale to 0-100 range (max possible raw score is ~53, scale up)
  score = Math.max(0, Math.min(100, score * 1.5));
  
  const positives = Object.entries(components)
    .filter(([k, v]) => v > 0.1 && WEIGHTS[k as keyof typeof WEIGHTS] > 0)
    .map(([k]) => k);
  
  return { score, components, positives };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('*');

    if (themesError) throw themesError;

    const results = [];
    for (const theme of themes || []) {
      // Get signals via signal_theme_map table (newer approach) AND direct theme_id (legacy)
      const { data: mappedSignals } = await supabaseClient
        .from('signal_theme_map')
        .select('signal_id')
        .eq('theme_id', theme.id);
      
      const signalIds = mappedSignals?.map(m => m.signal_id) || [];
      
      // Also get signals with direct theme_id
      const { data: directSignals } = await supabaseClient
        .from('signals')
        .select('id')
        .eq('theme_id', theme.id);
      
      const directSignalIds = directSignals?.map(s => s.id) || [];
      const allSignalIds = [...new Set([...signalIds, ...directSignalIds])];
      
      // Fetch full signal data in batches
      let signals: any[] = [];
      if (allSignalIds.length > 0) {
        const BATCH_SIZE = 100;
        
        for (let i = 0; i < allSignalIds.length; i += BATCH_SIZE) {
          const batch = allSignalIds.slice(i, i + BATCH_SIZE);
          const { data, error: signalsError } = await supabaseClient
            .from('signals')
            .select('id, signal_type, observed_at, magnitude')
            .in('id', batch);
          
          if (signalsError) {
            console.error(`Error fetching batch:`, signalsError);
          } else if (data) {
            signals.push(...data);
          }
        }
      }

      const { score, components } = computeThemeScore(signals);

      results.push({
        id: theme.id,
        name: theme.name,
        score: Math.round(score * 100) / 100,
        components: Object.fromEntries(
          Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
        as_of: new Date().toISOString(),
        weights: WEIGHTS,
      });
    }

    results.sort((a, b) => b.score - a.score);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-themes:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
