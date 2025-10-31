import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEMANTIC_THRESHOLD = 0.35;

function computeTfidfSimilarity(text: string, keywords: string[]): number {
  if (!text || !keywords || keywords.length === 0) return 0.0;
  
  const textLower = text.toLowerCase();
  const textTokens = textLower.split(/\s+/);
  
  const textTf: Record<string, number> = {};
  for (const token of textTokens) {
    textTf[token] = (textTf[token] || 0) + 1;
  }
  
  const keywordTokens = keywords.map(kw => kw.toLowerCase());
  const keywordTf: Record<string, number> = {};
  for (const token of keywordTokens) {
    keywordTf[token] = (keywordTf[token] || 0) + 1;
  }
  
  let dotProduct = 0;
  let textMagnitude = 0;
  let keywordMagnitude = 0;
  
  const allTerms = new Set([...Object.keys(textTf), ...Object.keys(keywordTf)]);
  
  for (const term of allTerms) {
    const textVal = textTf[term] || 0;
    const keywordVal = keywordTf[term] || 0;
    
    dotProduct += textVal * keywordVal;
    textMagnitude += textVal ** 2;
    keywordMagnitude += keywordVal ** 2;
  }
  
  if (textMagnitude === 0 || keywordMagnitude === 0) return 0.0;
  
  return dotProduct / (Math.sqrt(textMagnitude) * Math.sqrt(keywordMagnitude));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signal_id, value_text } = await req.json();

    if (!signal_id || !value_text) {
      throw new Error('signal_id and value_text are required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const valueLower = value_text.toLowerCase();

    // Get all themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('*');

    if (themesError) throw themesError;

    // Find best matching theme by keyword count (strict)
    let bestThemeId: string | null = null;
    let maxMatches = 0;
    let mapperRoute = 'keyword';
    let mapperScore = 0.0;

    for (const theme of themes || []) {
      const keywords = theme.keywords.map((kw: string) => kw.toLowerCase());
      const matches = keywords.filter((kw: string) => valueLower.includes(kw)).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestThemeId = theme.id;
        mapperScore = matches;
      }
    }

    // If no keyword match, try semantic fallback
    if (!bestThemeId) {
      let bestSemanticScore = 0.0;
      let bestSemanticTheme: string | null = null;

      for (const theme of themes || []) {
        const score = computeTfidfSimilarity(value_text, theme.keywords);

        if (score > bestSemanticScore) {
          bestSemanticScore = score;
          bestSemanticTheme = theme.id;
        }
      }

      if (bestSemanticScore >= SEMANTIC_THRESHOLD) {
        bestThemeId = bestSemanticTheme;
        mapperRoute = 'semantic';
        mapperScore = bestSemanticScore;
      }
    }

    // Update signal with theme_id if found
    if (bestThemeId && (maxMatches > 0 || mapperRoute === 'semantic')) {
      const { error: updateError } = await supabaseClient
        .from('signals')
        .update({
          theme_id: bestThemeId,
          raw: {
            mapper: mapperRoute,
            mapper_score: mapperScore,
          },
        })
        .eq('id', signal_id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          success: true,
          theme_id: bestThemeId,
          mapper_route: mapperRoute,
          mapper_score: mapperScore,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        message: 'No theme match found',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in map-signal-to-theme:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
