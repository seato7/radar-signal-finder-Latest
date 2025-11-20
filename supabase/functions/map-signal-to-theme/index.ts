import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEMANTIC_THRESHOLD = 0.01; // Very low threshold for maximum coverage

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

async function mapSignalToTheme(
  supabaseClient: any,
  signalId: string,
  ticker: string,
  signalType: string,
  valueText: string,
  themes: any[]
): Promise<string | null> {
  let bestThemeId: string | null = null;
  let mapperRoute = 'none';
  let mapperScore = 0.0;

  // === STEP 1: Check ticker-based mapping (HIGHEST PRIORITY) ===
  for (const theme of themes) {
    const themeTickers = theme.metadata?.tickers || [];
    if (themeTickers.includes(ticker)) {
      bestThemeId = theme.id;
      mapperRoute = 'ticker';
      mapperScore = 1.0;
      break;
    }
  }

  // === STEP 2: Try keyword matching (includes signal_type + value_text) ===
  if (!bestThemeId) {
    // Combine signal_type and value_text for matching
    const searchText = `${signalType} ${valueText || ''}`.toLowerCase();
    let maxMatches = 0;

    for (const theme of themes) {
      const keywords = theme.keywords.map((kw: string) => kw.toLowerCase());
      const matches = keywords.filter((kw: string) => searchText.includes(kw)).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestThemeId = theme.id;
        mapperRoute = 'keyword';
        mapperScore = matches;
      }
    }

    // === STEP 3: If no keyword match, try semantic fallback ===
    if (!bestThemeId && searchText.trim()) {
      let bestSemanticScore = 0.0;
      let bestSemanticTheme: string | null = null;

      for (const theme of themes) {
        const score = computeTfidfSimilarity(searchText, theme.keywords);

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
  }

  // === Update signal with theme_id if found ===
  if (bestThemeId) {
    const { error: updateError } = await supabaseClient
      .from('signals')
      .update({
        theme_id: bestThemeId,
        raw: {
          mapper: mapperRoute,
          mapper_score: mapperScore,
        },
      })
      .eq('id', signalId);

    if (updateError) {
      console.error(`Failed to update signal ${signalId}:`, updateError);
      return null;
    }
  }

  return bestThemeId;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signal_id, value_text, batch_mode } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // === BATCH MODE: Map all unmapped signals ===
    if (batch_mode) {
      console.log('🔄 Running batch signal-to-theme mapping...');
      
      // Get all signals without theme_id
      const { data: unmappedSignals, error: signalsError } = await supabaseClient
        .from('signals')
        .select('id, asset_id, signal_type, value_text')
        .is('theme_id', null)
        .limit(1000);

      if (signalsError) throw signalsError;

      // Get asset tickers
      const assetIds = [...new Set(unmappedSignals?.map(s => s.asset_id) || [])];
      const { data: assets, error: assetsError } = await supabaseClient
        .from('assets')
        .select('id, ticker')
        .in('id', assetIds);

      if (assetsError) throw assetsError;

      const assetMap = new Map(assets?.map(a => [a.id, a.ticker]) || []);

      // Get all themes
      const { data: themes, error: themesError } = await supabaseClient
        .from('themes')
        .select('*');

      if (themesError) throw themesError;

      let mappedCount = 0;
      let skippedCount = 0;

      for (const signal of unmappedSignals || []) {
        const ticker = assetMap.get(signal.asset_id);
        const themeId = await mapSignalToTheme(
          supabaseClient,
          signal.id,
          ticker || '',
          signal.signal_type || '',
          signal.value_text || '',
          themes || []
        );

        if (themeId) {
          mappedCount++;
        } else {
          skippedCount++;
        }
      }

      console.log(`✅ Batch mapping complete: ${mappedCount} mapped, ${skippedCount} skipped`);

      return new Response(
        JSON.stringify({
          success: true,
          mapped: mappedCount,
          skipped: skippedCount,
          total: unmappedSignals?.length || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === SINGLE SIGNAL MODE ===
    if (!signal_id || !value_text) {
      throw new Error('signal_id and value_text are required');
    }

    // Get signal's ticker and signal_type
    const { data: signal, error: signalError } = await supabaseClient
      .from('signals')
      .select('asset_id, signal_type')
      .eq('id', signal_id)
      .single();

    if (signalError) throw signalError;

    const { data: asset, error: assetError } = await supabaseClient
      .from('assets')
      .select('ticker')
      .eq('id', signal.asset_id)
      .single();

    if (assetError) throw assetError;

    // Get all themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('*');

    if (themesError) throw themesError;

    const themeId = await mapSignalToTheme(
      supabaseClient,
      signal_id,
      asset.ticker,
      signal.signal_type || '',
      value_text,
      themes || []
    );

    if (themeId) {
      return new Response(
        JSON.stringify({
          success: true,
          theme_id: themeId,
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
