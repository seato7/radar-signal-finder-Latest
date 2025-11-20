import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate alerts from high-scoring themes
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    console.log('[GENERATE-ALERTS] Starting alert generation');
    
    // Get themes with score > 50 (high-performing themes)
    const { data: highScoringThemes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name, score, keywords, metadata')
      .gt('score', 50)
      .order('score', { ascending: false });
    
    if (themesError) throw themesError;
    
    if (!highScoringThemes || highScoringThemes.length === 0) {
      console.log('[GENERATE-ALERTS] No high-scoring themes found');
      return new Response(JSON.stringify({
        success: true,
        message: 'No high-scoring themes to alert on',
        alerts_created: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[GENERATE-ALERTS] Found ${highScoringThemes.length} high-scoring themes`);
    
    // Get all users
    const { data: users } = await supabaseClient.auth.admin.listUsers();
    
    let alertsCreated = 0;
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    for (const user of users.users) {
      // Get user's watchlist
      const { data: watchlist } = await supabaseClient
        .from('watchlist')
        .select('tickers')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!watchlist || !watchlist.tickers || watchlist.tickers.length === 0) {
        continue;
      }
      
      // For each high-scoring theme, check if any watchlist tickers are involved
      for (const theme of highScoringThemes) {
        // Get signals mapped to this theme directly
        const { data: signals } = await supabaseClient
          .from('signals')
          .select('id, asset_id, signal_type, direction, magnitude, observed_at, value_text, assets(ticker)')
          .eq('theme_id', theme.id)
          .gte('observed_at', oneDayAgo.toISOString());
        
        if (!signals || signals.length === 0) continue;
        
        // Filter for watchlist tickers
        const relevantSignals = signals
          .filter((s: any) => s.assets && watchlist.tickers.includes(s.assets.ticker));
        
        if (relevantSignals.length === 0) continue;
        
        // Check if alert already exists
        const { data: existingAlert } = await supabaseClient
          .from('alerts')
          .select('id')
          .eq('user_id', user.id)
          .eq('theme_id', theme.id)
          .gte('created_at', oneDayAgo.toISOString())
          .maybeSingle();
        
        if (existingAlert) continue;
        
        // Calculate alert score based on theme score and signal count
        const positiveSignals = relevantSignals.filter((s: any) => s.direction === 'up');
        const score = theme.score * (1 + Math.log10(relevantSignals.length + 1) / 2);
        
        // Create alert
        const { error: alertError } = await supabaseClient
          .from('alerts')
          .insert({
            user_id: user.id,
            theme_id: theme.id,
            theme_name: theme.name,
            score: Math.min(100, score),
            status: 'active',
            positives: positiveSignals.map((s: any) => s.signal_type),
            dont_miss: {
              tickers: relevantSignals.map((s: any) => s.assets?.ticker).filter(Boolean),
              signal_count: relevantSignals.length,
              theme_score: theme.score,
              top_signals: relevantSignals.slice(0, 3).map((s: any) => s.signal_type)
            }
          });
        
        if (alertError) {
          console.error(`[GENERATE-ALERTS] Failed to create alert:`, alertError);
        } else {
          alertsCreated++;
          console.log(`[GENERATE-ALERTS] Created alert for user ${user.id}, theme "${theme.name}", score ${score.toFixed(2)}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      alerts_created: alertsCreated,
      high_scoring_themes: highScoringThemes.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GENERATE-ALERTS] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
