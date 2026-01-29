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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    // Fetch themes with pre-computed scores
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name, score, alpha, metadata, updated_at')
      .order('score', { ascending: false });

    if (themesError) throw themesError;

    // Also fetch theme_scores for additional component data
    const { data: themeScores } = await supabaseClient
      .from('theme_scores')
      .select('theme_id, score, signal_count, component_scores, positive_components, computed_at');

    // Map theme_scores by theme_id
    const scoresMap = new Map<string, typeof themeScores extends (infer T)[] | null ? T : never>();
    for (const ts of themeScores || []) {
      scoresMap.set(ts.theme_id, ts);
    }

    const results = (themes || []).map(theme => {
      const themeScore = scoresMap.get(theme.id);
      const metadata = theme.metadata || {};
      const components = themeScore?.component_scores || metadata;
      
      return {
        id: theme.id,
        name: theme.name,
        score: Math.round((theme.score || 50) * 100) / 100,
        expected_return: theme.alpha || metadata.expected_return || 0,
        confidence_score: metadata.confidence_score || 0,
        asset_count: metadata.asset_count || themeScore?.signal_count || 0,
        total_signal_mass: metadata.total_signal_mass || 0,
        top_assets: metadata.top_assets || themeScore?.positive_components || [],
        components: {
          expected_return: components.expected_return || theme.alpha || 0,
          confidence_score: components.confidence_score || 0,
          asset_count: components.asset_count || 0,
          total_signal_mass: components.total_signal_mass || 0,
        },
        model_version: metadata.model_version || 'v3_alpha',
        as_of: themeScore?.computed_at || theme.updated_at || new Date().toISOString(),
      };
    });

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
