// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate alerts from high-scoring themes
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
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
    
    console.log(`[GENERATE-ALERTS] Found ${users.users.length} users`);
    
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
      
      console.log(`[GENERATE-ALERTS] User ${user.email}: watchlist = ${watchlist ? watchlist.tickers.join(', ') : 'NONE'}`);
      
      if (!watchlist || !watchlist.tickers || watchlist.tickers.length === 0) {
        continue;
      }
      
      // For each high-scoring theme, check if any watchlist tickers are involved
      for (const theme of highScoringThemes) {
        console.log(`[GENERATE-ALERTS] Processing theme "${theme.name}" for user ${user.email}`);
        
        // Get signals mapped to this theme
        const { data: signalMaps, error: signalError } = await supabaseClient
          .from('signal_theme_map')
          .select(`
            signal_id,
            signals!inner(
              id,
              asset_id,
              signal_type,
              direction,
              magnitude,
              observed_at,
              value_text
            )
          `)
          .eq('theme_id', theme.id)
          .limit(200); // cap per-theme signal load to prevent 10K+ row queries
        
        if (signalError) {
          console.error(`[GENERATE-ALERTS] Error fetching signals for theme "${theme.name}":`, signalError);
          continue;
        }
        
        console.log(`[GENERATE-ALERTS] Theme "${theme.name}": Retrieved ${signalMaps?.length || 0} signal mappings`);
        
        // Extract signals and filter for recent ones
        const allSignals = signalMaps?.map((m: any) => m.signals).filter(Boolean) || [];
        const recentSignals = allSignals.filter((s: any) => 
          new Date(s.observed_at) >= oneDayAgo
        );
        
        console.log(`[GENERATE-ALERTS] Theme "${theme.name}": ${recentSignals.length} recent signals (last 24h)`);
        
        if (recentSignals.length === 0) continue;
        
        // Get asset info for these signals
        const assetIds = [...new Set(recentSignals.map((s: any) => s.asset_id).filter(Boolean))];
        if (assetIds.length === 0) continue;
        
        const { data: assets } = await supabaseClient
          .from('assets')
          .select('id, ticker')
          .in('id', assetIds);
        
        const assetMap = new Map(assets?.map(a => [a.id, a]) || []);
        
        // Attach asset info to signals
        recentSignals.forEach((s: any) => {
          if (s.asset_id) {
            s.assets = assetMap.get(s.asset_id);
          }
        });
        
        console.log(`[GENERATE-ALERTS] Theme "${theme.name}": ${recentSignals.length} recent signals found`);
        
        if (recentSignals.length === 0) continue;
        
        // Filter for watchlist tickers
        const relevantSignals = recentSignals
          .filter((s: any) => s.assets && watchlist.tickers.includes(s.assets.ticker));
        
        console.log(`[GENERATE-ALERTS] Theme "${theme.name}": ${relevantSignals.length} relevant signals matching watchlist ${watchlist.tickers.join(', ')}`);
        
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

    const duration = Date.now() - startTime;
    
    // Log success to function_status
    await supabaseClient.from('function_status').insert({
      function_name: 'generate-alerts',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: alertsCreated,
      rows_skipped: 0,
      metadata: {
        high_scoring_themes: highScoringThemes.length,
        users_processed: users.users.length
      }
    });
    
    // Send Slack notification
    const slackAlerter = new SlackAlerter();
    await slackAlerter.sendLiveAlert({
      etlName: 'generate-alerts',
      status: 'success',
      duration: duration,
      rowsInserted: alertsCreated,
      rowsSkipped: 0,
      sourceUsed: 'Alert Generation Engine',
      metadata: {
        high_scoring_themes: highScoringThemes.length,
        users_processed: users.users.length,
        themes_list: highScoringThemes.map(t => t.name).join(', ')
      }
    });

    console.log(`[GENERATE-ALERTS] ✅ Created ${alertsCreated} alerts in ${duration}ms`);

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
    
    const duration = Date.now() - startTime;
    
    // Log failure to function_status
    await supabaseClient.from('function_status').insert({
      function_name: 'generate-alerts',
      status: 'failure',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      rows_inserted: 0,
      rows_skipped: 0
    });
    
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
