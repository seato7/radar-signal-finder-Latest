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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query parameters
    const url = new URL(req.url);
    const scoreMin = parseFloat(url.searchParams.get('score_min') || '0');
    const signalType = url.searchParams.get('signal_type');
    const assetClass = url.searchParams.get('asset_class');
    const limit = parseInt(url.searchParams.get('limit') || '100');

    // Build query
    let query = supabase
      .from('signals')
      .select(`
        id,
        signal_type,
        composite_score,
        score_factors,
        signal_classification,
        asset_class,
        direction,
        magnitude,
        observed_at,
        created_at,
        citation,
        value_text,
        assets (
          id,
          ticker,
          name,
          exchange,
          asset_class
        )
      `)
      .not('composite_score', 'is', null)
      .gte('composite_score', scoreMin)
      .order('composite_score', { ascending: false })
      .limit(limit);

    // Apply filters
    // FIX: Use signal_type column (signal_classification doesn't exist in signals table)
    if (signalType) {
      query = query.eq('signal_type', signalType);
    }

    if (assetClass) {
      query = query.eq('asset_class', assetClass);
    }

    const { data: signals, error } = await query;

    if (error) throw error;

    // Compute summary statistics
    const summary = {
      total_signals: signals?.length || 0,
      avg_score: signals?.length ? 
        (signals.reduce((sum, s) => sum + (s.composite_score || 0), 0) / signals.length).toFixed(2) : 0,
      by_classification: {} as Record<string, number>,
      by_asset_class: {} as Record<string, number>,
      top_assets: [] as any[],
    };

    if (signals && signals.length > 0) {
      // Count by classification
      signals.forEach(s => {
        if (s.signal_classification) {
          summary.by_classification[s.signal_classification] = 
            (summary.by_classification[s.signal_classification] || 0) + 1;
        }
        if (s.asset_class) {
          summary.by_asset_class[s.asset_class] = 
            (summary.by_asset_class[s.asset_class] || 0) + 1;
        }
      });

      // Get top assets by average signal score
      const assetScores = new Map<string, { ticker: string; name: string; scores: number[]; }>();
      
      signals.forEach(s => {
        if (s.assets && s.composite_score) {
          const asset = s.assets as any;
          if (!assetScores.has(asset.ticker)) {
            assetScores.set(asset.ticker, {
              ticker: asset.ticker,
              name: asset.name,
              scores: [],
            });
          }
          assetScores.get(asset.ticker)!.scores.push(s.composite_score);
        }
      });

      summary.top_assets = Array.from(assetScores.values())
        .map(a => ({
          ticker: a.ticker,
          name: a.name,
          avg_score: (a.scores.reduce((sum, s) => sum + s, 0) / a.scores.length).toFixed(2),
          signal_count: a.scores.length,
        }))
        .sort((a, b) => parseFloat(b.avg_score) - parseFloat(a.avg_score))
        .slice(0, 10);
    }

    return new Response(
      JSON.stringify({
        summary,
        signals,
        filters: {
          score_min: scoreMin,
          signal_type: signalType,
          asset_class: assetClass,
          limit,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching signals:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
