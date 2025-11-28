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
  for (const signal of signals) {
    const observedAt = new Date(signal.observed_at);
    const daysAgo = (now.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decay = exponentialDecay(daysAgo);
    const magnitude = signal.magnitude || 1.0;
    const contribution = magnitude * decay;
    
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

  let score = 0.0;
  for (const [component, value] of Object.entries(components)) {
    const weight = WEIGHTS[component as keyof typeof WEIGHTS];
    const normalized = Math.min(value * 10, 100);
    score += weight * normalized;
  }
  
  score = Math.max(0, Math.min(100, score));
  
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
        .eq('theme_id', theme.id)
        .gte('observed_at', since.toISOString());
      
      const directSignalIds = directSignals?.map(s => s.id) || [];
      const allSignalIds = [...new Set([...signalIds, ...directSignalIds])];
      
      // Fetch full signal data
      let signals: any[] = [];
      if (allSignalIds.length > 0) {
        const { data } = await supabaseClient
          .from('signals')
          .select('id, signal_type, observed_at, magnitude')
          .in('id', allSignalIds)
          .gte('observed_at', since.toISOString());
        signals = data || [];
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
