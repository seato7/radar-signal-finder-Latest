import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Signal {
  id: string;
  signal_type: string;
  observed_at: string;
  magnitude: number;
}

// Component weights from backend/scoring.py
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

const HALF_LIFE_DAYS = 14; // Default from backend config

function exponentialDecay(daysAgo: number, halfLife: number = HALF_LIFE_DAYS): number {
  if (daysAgo <= 0) return 1.0;
  return Math.exp(-Math.log(2) * daysAgo / halfLife);
}

function computeComponentScores(signals: Signal[], asOf: Date = new Date()): Record<string, number> {
  const components: Record<string, number> = {};
  for (const key in WEIGHTS) {
    components[key] = 0.0;
  }

  for (const signal of signals) {
    const observedAt = new Date(signal.observed_at);
    const daysAgo = (asOf.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decay = exponentialDecay(daysAgo);
    
    const magnitude = signal.magnitude || 1.0;
    const contribution = magnitude * decay;
    
    // Map signal types to components
    if (['policy_keyword', 'policy_mention'].includes(signal.signal_type)) {
      components.PolicyMomentum += contribution;
    } else if (['flow_pressure', 'flow_pressure_etf'].includes(signal.signal_type)) {
      components.FlowPressure += contribution;
    } else if (['filing_13f_new', 'filing_13f_increase'].includes(signal.signal_type)) {
      components.BigMoneyConfirm += contribution;
    } else if (['insider_buy', 'politician_buy'].includes(signal.signal_type)) {
      components.InsiderPoliticianConfirm += contribution;
    } else if (['social_mention', 'news_mention'].includes(signal.signal_type)) {
      components.Attention += contribution;
    } else if (signal.signal_type.startsWith('risk_')) {
      components.RiskFlags += contribution;
    }
  }

  return components;
}

function computeThemeScore(signals: Signal[], asOf: Date = new Date()): {
  score: number;
  components: Record<string, number>;
  positives: string[];
} {
  const components = computeComponentScores(signals, asOf);
  
  // Calculate weighted score
  let score = 0.0;
  for (const [component, value] of Object.entries(components)) {
    const weight = WEIGHTS[component as keyof typeof WEIGHTS];
    const normalized = Math.min(value * 10, 100);
    score += weight * normalized;
  }
  
  // Ensure score is in 0-100 range
  score = Math.max(0, Math.min(100, score));
  
  // Identify positive components
  const positives = Object.entries(components)
    .filter(([k, v]) => v > 0.5 && WEIGHTS[k as keyof typeof WEIGHTS] > 0)
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
    const themeId = url.searchParams.get('theme_id');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const since = new Date();
    since.setDate(since.getDate() - days);

    if (themeId) {
      // Get specific theme
      const { data: theme, error: themeError } = await supabaseClient
        .from('themes')
        .select('*')
        .eq('id', themeId)
        .single();

      if (themeError) throw themeError;

      // Get signals for this theme
      const { data: signals, error: signalsError } = await supabaseClient
        .from('signals')
        .select('id, signal_type, observed_at, magnitude')
        .eq('theme_id', themeId)
        .gte('observed_at', since.toISOString())
        .order('observed_at', { ascending: false });

      if (signalsError) throw signalsError;

      const { score, components, positives } = computeThemeScore(signals || []);

      return new Response(
        JSON.stringify({
          id: theme.id,
          name: theme.name,
          score: Math.round(score * 100) / 100,
          components: Object.fromEntries(
            Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
          positives,
          weights: WEIGHTS,
          signal_count: signals?.length || 0,
          as_of: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Get all themes
      const { data: themes, error: themesError } = await supabaseClient
        .from('themes')
        .select('*');

      if (themesError) throw themesError;

      const results = [];
      for (const theme of themes || []) {
        const { data: signals } = await supabaseClient
          .from('signals')
          .select('id, signal_type, observed_at, magnitude')
          .eq('theme_id', theme.id)
          .gte('observed_at', since.toISOString());

        const { score, components } = computeThemeScore(signals || []);

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

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      return new Response(
        JSON.stringify(results),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in compute-theme-scores:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
