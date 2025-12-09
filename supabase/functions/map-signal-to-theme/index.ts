import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEMANTIC_THRESHOLD = 0.01;

function computeTfidfSimilarity(text: string, keywords: string[]): number {
  if (!text || !keywords || keywords.length === 0) return 0.0;
  
  const textLower = text.toLowerCase();
  
  let phraseMatchScore = 0;
  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase();
    if (textLower.includes(kwLower)) {
      phraseMatchScore += kwLower.split(/\s+/).length * 2;
    }
  }
  
  if (phraseMatchScore > 5) {
    return 0.9 + (phraseMatchScore * 0.01);
  }
  
  const textTokens = textLower.split(/\s+/);
  
  const textTf: Record<string, number> = {};
  for (const token of textTokens) {
    textTf[token] = (textTf[token] || 0) + 1;
  }
  
  const keywordTokens: string[] = [];
  for (const kw of keywords) {
    keywordTokens.push(...kw.toLowerCase().split(/\s+/));
  }
  
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
  
  const cosineSim = dotProduct / (Math.sqrt(textMagnitude) * Math.sqrt(keywordMagnitude));
  
  return Math.min(1.0, cosineSim + (phraseMatchScore * 0.05));
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

  for (const theme of themes) {
    const themeTickers = theme.metadata?.tickers || [];
    if (themeTickers.includes(ticker)) {
      bestThemeId = theme.id;
      mapperRoute = 'ticker';
      mapperScore = 1.0;
      break;
    }
  }

  if (!bestThemeId) {
    const searchText = `${signalType} ${valueText || ''}`.toLowerCase();
    let maxMatches = 0;

    for (const theme of themes) {
      const keywords = theme.keywords.map((kw: string) => kw.toLowerCase());
      
      let matches = 0;
      for (const kw of keywords) {
        if (searchText.includes(kw)) {
          matches += kw.split(/\s+/).length;
        }
      }

      if (matches > maxMatches) {
        maxMatches = matches;
        bestThemeId = theme.id;
        mapperRoute = 'keyword';
        mapperScore = matches;
      }
    }

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

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();

  try {
    const body = await req.json();
    // Accept both "batch" and "batch_mode" for backwards compatibility with cron
    const batch_mode = body.batch_mode || body.batch;
    const { signal_id, value_text } = body;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (batch_mode) {
      console.log('🔄 Running batch signal-to-theme mapping...');
      
      const { data: unmappedSignals, error: signalsError } = await supabaseClient
        .from('signals')
        .select('id, asset_id, signal_type, value_text')
        .is('theme_id', null)
        .not('asset_id', 'is', null)
        .limit(2000);

      if (signalsError) throw signalsError;

      const assetIds = [...new Set(unmappedSignals?.map(s => s.asset_id) || [])];
      const { data: assets, error: assetsError } = await supabaseClient
        .from('assets')
        .select('id, ticker')
        .in('id', assetIds);

      if (assetsError) throw assetsError;

      const assetMap = new Map(assets?.map(a => [a.id, a.ticker]) || []);

      const { data: themes, error: themesError } = await supabaseClient
        .from('themes')
        .select('*');

      if (themesError) throw themesError;

      let mappedCount = 0;
      let skippedCount = 0;

      for (const signal of unmappedSignals || []) {
        const ticker = assetMap.get(signal.asset_id);
        
        if (!ticker) {
          skippedCount++;
          continue;
        }
        
        const themeId = await mapSignalToTheme(
          supabaseClient,
          signal.id,
          ticker,
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

      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'map-signal-to-theme',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: mappedCount,
        rowsSkipped: skippedCount,
      });

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

    if (!signal_id || !value_text) {
      throw new Error('signal_id and value_text are required');
    }

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

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'map-signal-to-theme',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: themeId ? 1 : 0,
    });

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
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'map-signal-to-theme',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
