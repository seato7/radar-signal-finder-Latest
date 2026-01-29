import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role key to bypass any RLS issues for this read-only function
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch themes with pre-computed scores
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name, score, alpha, metadata, updated_at')
      .order('score', { ascending: false });

    if (themesError) throw themesError;

    console.log(`[get-themes] Fetched ${themes?.length || 0} themes`);

    // Fetch latest theme_scores for each theme (contains component data)
    // Only get scores with signal_count > 0 to speed up
    const { data: themeScores, error: scoresError } = await supabaseClient
      .from('theme_scores')
      .select('theme_id, score, signal_count, component_scores, positive_components, computed_at')
      .gt('signal_count', 0)
      .order('computed_at', { ascending: false });

    if (scoresError) {
      console.error('[get-themes] Error fetching theme_scores:', scoresError);
    }

    console.log(`[get-themes] Fetched ${themeScores?.length || 0} theme_scores with signal_count > 0`);

    // Map theme_scores by theme_id - keep only the latest per theme
    const scoresMap = new Map<string, {
      theme_id: string;
      score: number;
      signal_count: number;
      component_scores: Record<string, unknown>;
      positive_components: string[];
      computed_at: string;
    }>();
    
    for (const ts of themeScores || []) {
      if (!scoresMap.has(ts.theme_id)) {
        scoresMap.set(ts.theme_id, ts as typeof scoresMap extends Map<string, infer V> ? V : never);
      }
    }

    console.log(`[get-themes] Built scoresMap with ${scoresMap.size} entries`);

    const results = (themes || []).map(theme => {
      const themeScore = scoresMap.get(theme.id);
      const components = (themeScore?.component_scores || {}) as Record<string, unknown>;
      
      // Extract values from component_scores (this is where compute-theme-scores stores them)
      const assetCount = (components.asset_count as number) || themeScore?.signal_count || 0;
      const expectedReturn = (components.expected_return as number) || theme.alpha || 0;
      const confidenceScore = (components.confidence_score as number) || 0;
      const totalSignalMass = (components.total_signal_mass as number) || 0;
      const topAssets = (components.top_assets as string[]) || themeScore?.positive_components || [];
      
      return {
        id: theme.id,
        name: theme.name,
        score: Math.round((theme.score || 50) * 100) / 100,
        expected_return: expectedReturn,
        confidence_score: confidenceScore,
        asset_count: assetCount,
        total_signal_mass: totalSignalMass,
        top_assets: topAssets,
        components: {
          expected_return: expectedReturn,
          confidence_score: confidenceScore,
          asset_count: assetCount,
          total_signal_mass: totalSignalMass,
        },
        model_version: (components.model_version as string) || 'v3_alpha',
        as_of: themeScore?.computed_at || theme.updated_at || new Date().toISOString(),
      };
    });

    // Sort: first by asset_count DESC (themes with data first), then by score DESC
    results.sort((a, b) => {
      // Primary: themes with assets first
      if (a.asset_count > 0 && b.asset_count === 0) return -1;
      if (a.asset_count === 0 && b.asset_count > 0) return 1;
      // Secondary: by score
      return b.score - a.score;
    });

    // Log top 3 results for debugging
    console.log(`[get-themes] Top 3 results:`, results.slice(0, 3).map(r => ({
      name: r.name,
      score: r.score,
      asset_count: r.asset_count
    })));

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
