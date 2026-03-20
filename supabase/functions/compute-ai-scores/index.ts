import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
const CACHE_HOURS = 6;
const SIGNAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SIGNALS_PER_ASSET = 20;
const TOP_ASSETS = 200;

function buildPrompt(
  ticker: string,
  formulaScore: number,
  signals: any[],
  tavilyContext: string
): string {
  const signalsFormatted = signals
    .map(
      (s) =>
        `[${s.signal_type.toUpperCase()}] direction=${s.direction} magnitude=${Number(s.magnitude).toFixed(3)} observed=${String(s.observed_at).split('T')[0]}`
    )
    .join('\n');

  return `You are a quantitative analyst scoring assets for short-term alpha (1-day horizon).

Asset: ${ticker}
Current Formula Score: ${formulaScore}/100

Active Signals (last 7 days):
${signalsFormatted || 'No active signals'}
${tavilyContext ? `\nReal-time context:\n${tavilyContext}` : ''}

Instructions:
1. Analyse the signal combination — do they confirm or contradict each other?
2. Weight insider and dark pool signals highest, social signals lowest
3. Consider signal freshness — signals from today > signals from 3 days ago
4. Identify the single strongest thesis for or against this asset
5. Penalise contradictory signals (e.g. insider buying but dark pool selling)

Respond ONLY with valid JSON in this exact format:
{
  "ai_score": <0-100 integer>,
  "confidence": <0.0-1.0 float>,
  "direction": "<up|down|neutral>",
  "reasoning": "<2-3 sentence explanation of your thesis>",
  "key_signals": ["<signal_type_1>", "<signal_type_2>"]
}`;
}

function parseAIResponse(
  content: string
): { ai_score: number; confidence: number; direction: string; reasoning: string; key_signals: string[] } | null {
  try {
    // Strip markdown code fences if present
    const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    // Extract the first {...} JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    const ai_score = Number(parsed.ai_score);
    const confidence = Number(parsed.confidence);
    const direction = String(parsed.direction || 'neutral');

    if (isNaN(ai_score) || ai_score < 0 || ai_score > 100) return null;
    if (isNaN(confidence) || confidence < 0 || confidence > 1) return null;
    if (!['up', 'down', 'neutral'].includes(direction)) return null;

    return {
      ai_score: Math.round(ai_score),
      confidence: Math.min(1, Math.max(0, confidence)),
      direction,
      reasoning: String(parsed.reasoning || '').substring(0, 1000),
      key_signals: Array.isArray(parsed.key_signals) ? parsed.key_signals.slice(0, 10) : [],
    };
  } catch {
    return null;
  }
}

async function callLLM(
  prompt: string,
  lovableApiKey: string
): Promise<string | null> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: 'You are a quantitative analyst. Always respond with valid JSON only — no markdown, no prose.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errType =
      response.status === 429 ? 'Rate limited' :
      response.status === 402 ? 'Quota exceeded' :
      response.status === 401 ? 'Auth error' : 'Gateway error';
    const body = await response.text().catch(() => '');
    throw new Error(`AI gateway ${errType} (${response.status}): ${body.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? null;
  if (content === null) {
    console.warn('[COMPUTE-AI-SCORES] callLLM: response ok but no content in choices:', JSON.stringify(data).substring(0, 300));
  }
  return content;
}

async function getTavilyContext(ticker: string, supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke('search-tavily', {
      body: { query: `${ticker} stock news today`, max_results: 3, search_depth: 'basic' },
    });
    if (error || !data?.results?.length) return '';
    const parts: string[] = [];
    if (data.answer) parts.push(data.answer);
    parts.push(
      data.results
        .map((r: any) => `${r.title}: ${(r.content || '').substring(0, 200)}`)
        .join('\n')
    );
    return parts.join('\n').substring(0, 600);
  } catch {
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // 1. Fetch top 200 assets by formula score
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker, computed_score')
      .order('computed_score', { ascending: false })
      .limit(TOP_ASSETS);

    if (assetsError) throw assetsError;
    const assetList: { id: string; ticker: string; computed_score: number }[] = assets || [];
    console.log(`[COMPUTE-AI-SCORES] ${assetList.length} assets fetched`);

    // 2. Filter out assets already scored in the last CACHE_HOURS
    const cacheThreshold = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentScores } = await supabase
      .from('ai_scores')
      .select('asset_id')
      .gte('scored_at', cacheThreshold);

    const cachedIds = new Set((recentScores || []).map((r: any) => r.asset_id));
    const assetsToProcess = assetList.filter((a) => !cachedIds.has(a.id));
    console.log(`[COMPUTE-AI-SCORES] ${cachedIds.size} cached, ${assetsToProcess.length} to process`);

    if (!assetsToProcess.length) {
      await logHeartbeat(supabase, {
        function_name: 'compute-ai-scores',
        status: 'success',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'cache_skip',
      });
      return new Response(
        JSON.stringify({ success: true, scored: 0, reason: 'all_cached' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Bulk-fetch all signals for assets to process in one query
    const assetIds = assetsToProcess.map((a) => a.id);
    const signalCutoff = new Date(Date.now() - SIGNAL_WINDOW_MS).toISOString();

    const { data: allSignals } = await supabase
      .from('signals')
      .select('asset_id, signal_type, direction, magnitude, observed_at')
      .in('asset_id', assetIds)
      .gte('observed_at', signalCutoff)
      .order('observed_at', { ascending: false });

    // Group signals by asset_id, cap at MAX_SIGNALS_PER_ASSET
    const signalsByAsset = new Map<string, any[]>();
    for (const sig of allSignals || []) {
      const list = signalsByAsset.get(sig.asset_id) || [];
      if (list.length < MAX_SIGNALS_PER_ASSET) {
        list.push(sig);
        signalsByAsset.set(sig.asset_id, list);
      }
    }

    // 4. Process in batches
    const aiScoreRows: any[] = [];
    let parseErrors = 0;
    let rateLimitErrors = 0;

    for (let i = 0; i < assetsToProcess.length; i += BATCH_SIZE) {
      const batch = assetsToProcess.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(assetsToProcess.length / BATCH_SIZE);
      console.log(`[COMPUTE-AI-SCORES] Batch ${batchNum}/${totalBatches}: ${batch.map((a) => a.ticker).join(', ')}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (asset) => {
          const signals = signalsByAsset.get(asset.id) || [];
          const formulaScore = Number(asset.computed_score ?? 50);

          // Fetch Tavily context if asset has signals (best-effort)
          const tavilyContext = signals.length > 0
            ? await getTavilyContext(asset.ticker, supabase)
            : '';

          const prompt = buildPrompt(asset.ticker, formulaScore, signals, tavilyContext);
          const llmContent = await callLLM(prompt, LOVABLE_API_KEY);
          if (!llmContent) {
            console.warn(`[COMPUTE-AI-SCORES] ${asset.ticker}: callLLM returned null content`);
            return null;
          }

          const parsed = parseAIResponse(llmContent);
          if (!parsed) {
            console.warn(`[COMPUTE-AI-SCORES] ${asset.ticker}: failed to parse LLM response:`, llmContent.substring(0, 200));
            return null;
          }

          const hybridScore = 0.4 * formulaScore + 0.6 * parsed.ai_score;

          return {
            asset_id: asset.id,
            ticker: asset.ticker,
            ai_score: parsed.ai_score,
            confidence: parsed.confidence,
            direction: parsed.direction,
            reasoning: parsed.reasoning,
            key_signals: parsed.key_signals,
            formula_score: formulaScore,
            hybrid_score: Math.round(hybridScore * 100) / 100,
            model_version: 'v1_hybrid',
          };
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const ticker = batch[j]?.ticker ?? 'unknown';
        if (result.status === 'fulfilled' && result.value) {
          aiScoreRows.push(result.value);
        } else {
          parseErrors++;
          if (result.status === 'rejected') {
            const msg = result.reason?.message || String(result.reason);
            const isRateLimit = msg.includes('429') || msg.includes('Rate limited');
            if (isRateLimit) rateLimitErrors++;
            console.warn(`[COMPUTE-AI-SCORES] ${ticker}: REJECTED — ${msg}`);
          } else {
            // fulfilled but returned null — already logged inside the map above
            console.warn(`[COMPUTE-AI-SCORES] ${ticker}: returned null (parse or content failure)`);
          }
        }
      }

      // Delay between batches (skip after last)
      if (i + BATCH_SIZE < assetsToProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`[COMPUTE-AI-SCORES] ${aiScoreRows.length} valid scores, ${parseErrors} failures (${rateLimitErrors} rate-limited)`);

    if (!aiScoreRows.length) {
      await logHeartbeat(supabase, {
        function_name: 'compute-ai-scores',
        status: 'failure',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'llm',
        error_message: `All ${parseErrors} LLM responses failed (${rateLimitErrors} rate-limited)`,
      });
      return new Response(
        JSON.stringify({ success: false, error: 'no_valid_scores', parse_errors: parseErrors, rate_limit_errors: rateLimitErrors }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Upsert into ai_scores table
    const { error: upsertError } = await supabase
      .from('ai_scores')
      .upsert(
        aiScoreRows.map((r) => ({ ...r, scored_at: new Date().toISOString() })),
        { onConflict: 'asset_id', ignoreDuplicates: false }
      );
    if (upsertError) throw upsertError;

    // 6. Update assets table with ai_score and hybrid_score in parallel batches
    const UPDATE_CONCURRENCY = 50;
    for (let i = 0; i < aiScoreRows.length; i += UPDATE_CONCURRENCY) {
      const batch = aiScoreRows.slice(i, i + UPDATE_CONCURRENCY);
      await Promise.allSettled(
        batch.map((row) =>
          supabase
            .from('assets')
            .update({ ai_score: row.ai_score, hybrid_score: row.hybrid_score })
            .eq('id', row.asset_id)
        )
      );
    }

    console.log(`[COMPUTE-AI-SCORES] ✅ Scored ${aiScoreRows.length} assets`);

    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'compute-ai-scores',
      status: 'success',
      rows_inserted: aiScoreRows.length,
      rows_skipped: parseErrors,
      duration_ms: duration,
      source_used: 'llm',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'compute-ai-scores',
      status: 'success',
      rowsInserted: aiScoreRows.length,
      rowsSkipped: parseErrors,
      sourceUsed: 'gemini-2.5-flash',
      duration,
      latencyMs: duration,
    });

    return new Response(
      JSON.stringify({
        success: true,
        scored: aiScoreRows.length,
        parse_errors: parseErrors,
        rate_limit_errors: rateLimitErrors,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[COMPUTE-AI-SCORES] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error));

    await logHeartbeat(supabase, {
      function_name: 'compute-ai-scores',
      status: 'failure',
      duration_ms: duration,
      source_used: 'llm',
      error_message: errMsg,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'compute-ai-scores',
      message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
