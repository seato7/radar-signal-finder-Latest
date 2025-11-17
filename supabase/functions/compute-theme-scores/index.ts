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
    
    // === UPDATED SIGNAL TYPE MAPPINGS (matches actual DB signal types) ===
    
    // PolicyMomentum: policy-related signals
    if (['policy_keyword', 'policy_mention', 'policy_approval'].includes(signal.signal_type)) {
      components.PolicyMomentum += contribution;
    } 
    
    // FlowPressure: capital flows and crypto movements
    else if (['flow_pressure', 'flow_pressure_etf', 'crypto_whale_activity', 'crypto_exchange_outflow'].includes(signal.signal_type)) {
      components.FlowPressure += contribution;
    } 
    
    // BigMoneyConfirm: institutional money and dark pool
    else if (['filing_13f_new', 'filing_13f_increase', 'smart_money_flow', 'dark_pool_activity'].includes(signal.signal_type)) {
      components.BigMoneyConfirm += contribution;
    } 
    
    // InsiderPoliticianConfirm: insider trading
    else if (['insider_buy', 'politician_buy', 'insider_sell', 'politician_sell'].includes(signal.signal_type)) {
      components.InsiderPoliticianConfirm += contribution;
    } 
    
    // Attention: sentiment and social signals
    else if (['social_mention', 'news_mention', 'sentiment_extreme'].includes(signal.signal_type)) {
      components.Attention += contribution;
    } 
    
    // TechEdge: technical analysis signals (NEW - this was missing!)
    else if (['technical_stochastic', 'technical_ma_crossover', 'technical_rsi', 'chart_pattern'].includes(signal.signal_type)) {
      components.TechEdge += contribution;
    } 
    
    // CapexMomentum: futures positioning
    else if (['cot_positioning'].includes(signal.signal_type)) {
      components.CapexMomentum += contribution;
    }
    
    // RiskFlags: risk-related signals
    else if (signal.signal_type.startsWith('risk_')) {
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

  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const themeId = url.searchParams.get('theme_id');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[THEME-SCORING] Starting theme score computation...');

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

      console.log(`[THEME-SCORING] Theme: ${theme.name}, Signals found: ${signals?.length || 0}`);
      if (signals && signals.length > 0) {
        console.log(`[THEME-SCORING] Sample signal:`, signals[0]);
        console.log(`[THEME-SCORING] Signal types:`, [...new Set(signals.map(s => s.signal_type))]);
      }

      const { score, components, positives } = computeThemeScore(signals || []);

      console.log(`[THEME-SCORING] Score: ${score}, Components:`, components);

      // Update theme with new score
      const { error: updateError } = await supabaseClient
        .from('themes')
        .update({ 
          updated_at: new Date().toISOString(),
          metadata: {
            ...theme.metadata,
            last_score: Math.round(score * 100) / 100,
            last_scored_at: new Date().toISOString()
          }
        })
        .eq('id', themeId);

      if (updateError) {
        console.error('[THEME-SCORING] ❌ Failed to update theme:', updateError);
      }

      console.log(`[THEME-SCORING] ✅ Computed score for ${theme.name}: ${score.toFixed(2)}`);

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
      let updatedCount = 0;

      for (const theme of themes || []) {
        const { data: signals } = await supabaseClient
          .from('signals')
          .select('id, signal_type, observed_at, magnitude')
          .eq('theme_id', theme.id)
          .gte('observed_at', since.toISOString());

        const { score, components } = computeThemeScore(signals || []);

        // Update theme with new score
        const { error: updateError } = await supabaseClient
          .from('themes')
          .update({ 
            updated_at: new Date().toISOString(),
            metadata: {
              ...theme.metadata,
              last_score: Math.round(score * 100) / 100,
              last_scored_at: new Date().toISOString()
            }
          })
          .eq('id', theme.id);

        if (!updateError) {
          updatedCount++;
        }

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

      const duration = Date.now() - startTime;

      // Log to function_status for monitoring
      await supabaseClient.from('function_status').insert({
        function_name: 'compute-theme-scores',
        status: 'success',
        executed_at: new Date().toISOString(),
        duration_ms: duration,
        rows_inserted: updatedCount,
        rows_skipped: (themes?.length || 0) - updatedCount,
        metadata: {
          themes_processed: themes?.length || 0,
          themes_updated: updatedCount
        }
      });

      console.log(`[THEME-SCORING] ✅ Computed scores for ${themes?.length || 0} themes (${updatedCount} updated) in ${duration}ms`);

      return new Response(
        JSON.stringify(results),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[THEME-SCORING] ❌ Error:', error);
    
    const duration = Date.now() - startTime;

    // Log failure to function_status
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    await supabaseClient.from('function_status').insert({
      function_name: 'compute-theme-scores',
      status: 'failure',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
