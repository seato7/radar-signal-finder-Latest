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
    
    // Get all users
    const { data: users } = await supabaseClient.auth.admin.listUsers();
    
    for (const user of users.users) {
      // Get user's watchlist themes
      const { data: watchlist } = await supabaseClient
        .from('watchlist')
        .select('tickers')
        .eq('user_id', user.id)
        .single();
      
      if (!watchlist || !watchlist.tickers) continue;
      
      // Get recent signals for watchlist tickers
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const { data: recentSignals } = await supabaseClient
        .from('signals')
        .select(`
          *,
          themes(id, name),
          assets(ticker, name)
        `)
        .in('assets.ticker', watchlist.tickers)
        .gte('observed_at', oneDayAgo.toISOString())
        .order('observed_at', { ascending: false });
      
      if (!recentSignals || recentSignals.length === 0) continue;
      
      // Group signals by theme
      const byTheme: Record<string, any[]> = {};
      
      for (const signal of recentSignals) {
        const themeId = signal.theme_id;
        if (!themeId) continue;
        
        if (!byTheme[themeId]) {
          byTheme[themeId] = [];
        }
        byTheme[themeId].push(signal);
      }
      
      // Create alerts for themes with multiple signals
      for (const [themeId, signals] of Object.entries(byTheme)) {
        if (signals.length < 2) continue;
        
        const positiveSignals = signals.filter(s => s.direction === 'up');
        const avgScore = signals.reduce((sum, s) => sum + (s.magnitude || 0), 0) / signals.length;
        const score = avgScore * signals.length * 10; // Amplify by signal count
        
        if (score < 50) continue; // Only high-scoring themes
        
        // Check if alert already exists
        const { data: existingAlert } = await supabaseClient
          .from('alerts')
          .select('id')
          .eq('user_id', user.id)
          .eq('theme_id', themeId)
          .gte('created_at', oneDayAgo.toISOString())
          .single();
        
        if (existingAlert) continue;
        
        // Create alert
        await supabaseClient
          .from('alerts')
          .insert({
            user_id: user.id,
            theme_id: themeId,
            theme_name: signals[0].themes?.name || 'Unknown Theme',
            score,
            status: 'active',
            positives: positiveSignals.map(s => s.signal_type),
            dont_miss: {
              tickers: signals.map(s => s.assets?.ticker).filter(Boolean),
              signal_count: signals.length
            }
          });
        
        console.log(`[GENERATE-ALERTS] Created alert for user ${user.id}, theme ${themeId}, score ${score}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
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
