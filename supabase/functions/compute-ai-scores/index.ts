import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const CACHE_HOURS_FALLBACK = 24;   // daily fallback: skip assets scored in last 24h
const SIGNAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SIGNALS_PER_ASSET = 20;
const MAX_TICKERS_ON_DEMAND = 20;  // cap per on-demand call to prevent overload

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
  "reasoning": "<10 words max>",
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
    // 1. Parse request body — check for on-demand tickers[] parameter
    let requestedTickers: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.tickers) && body.tickers.length > 0) {
        requestedTickers = (body.tickers as string[]).slice(0, MAX_TICKERS_ON_DEMAND);
      }
    } catch { /* no body or not JSON — fallback mode */ }

    const mode = requestedTickers ? 'on_demand' : 'fallback_daily';
    console.log(`[COMPUTE-AI-SCORES] mode=${mode}${requestedTickers ? ` tickers=[${requestedTickers.join(',')}]` : ''}`);

    // 2. Fetch assets — on-demand: by ticker list; fallback: all signal-active assets
    let assetList: { id: string; ticker: string; computed_score: number }[] = [];

    if (requestedTickers) {
      // On-demand: score only the requested tickers, no cache filter (signals just arrived)
      const { data, error: assetsError } = await supabase
        .from('assets')
        .select('id, ticker, computed_score')
        .in('ticker', requestedTickers);
      if (assetsError) throw assetsError;
      assetList = data || [];
      console.log(`[COMPUTE-AI-SCORES] ${assetList.length}/${requestedTickers.length} requested tickers found in assets`);
    } else {
      // Fallback: find all assets with signals in last 7 days — NOT top-200 blind scan
      const signalCutoff = new Date(Date.now() - SIGNAL_WINDOW_MS).toISOString();
      const { data: recentSignalRows } = await supabase
        .from('signals')
        .select('asset_id')
        .gte('observed_at', signalCutoff);
      const activeAssetIds = [...new Set((recentSignalRows || []).map((r: any) => r.asset_id))];
      console.log(`[COMPUTE-AI-SCORES] ${activeAssetIds.length} signal-active assets found`);

      if (!activeAssetIds.length) {
        await logHeartbeat(supabase, { function_name: 'compute-ai-scores', status: 'success', rows_inserted: 0, duration_ms: Date.now() - startTime, source_used: 'no_active_signals' });
        return new Response(JSON.stringify({ success: true, scored: 0, reason: 'no_signal_active_assets' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error: assetsError } = await supabase
        .from('assets')
        .select('id, ticker, computed_score')
        .in('id', activeAssetIds);
      if (assetsError) throw assetsError;
      assetList = data || [];

      // Fallback: filter out assets already scored in last 24h
      const cacheThreshold = new Date(Date.now() - CACHE_HOURS_FALLBACK * 60 * 60 * 1000).toISOString();
      const { data: recentScores } = await supabase.from('ai_scores').select('asset_id').gte('scored_at', cacheThreshold);
      const cachedIds = new Set((recentScores || []).map((r: any) => r.asset_id));
      assetList = assetList.filter((a) => !cachedIds.has(a.id));
      console.log(`[COMPUTE-AI-SCORES] ${cachedIds.size} cached (24h), ${assetList.length} to process`);
    }

    const assetsToProcess = assetList;
    console.log(`[COMPUTE-AI-SCORES] ${assetsToProcess.length} assets to process`);

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

    // Filter to only assets with at least 1 active signal — zero-signal assets return score=50/neutral which is useless
    const assetsWithSignals = assetsToProcess.filter((a) => (signalsByAsset.get(a.id)?.length ?? 0) > 0);
    const noSignalCount = assetsToProcess.length - assetsWithSignals.length;
    console.log(`[COMPUTE-AI-SCORES] signal coverage: ${assetsWithSignals.length} have signals, ${noSignalCount} skipped (no signals in last 7d)`);

    if (!assetsWithSignals.length) {
      await logHeartbeat(supabase, {
        function_name: 'compute-ai-scores',
        status: 'success',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'signal_filter_skip',
      });
      return new Response(
        JSON.stringify({ success: true, scored: 0, reason: 'no_assets_with_signals', assets_fetched: assetList.length, cached: cachedIds.size, no_signals: noSignalCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Process in batches
    const aiScoreRows: any[] = [];
    let parseErrors = 0;
    let rateLimitErrors = 0;

    for (let i = 0; i < assetsWithSignals.length; i += BATCH_SIZE) {
      const batch = assetsWithSignals.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(assetsWithSignals.length / BATCH_SIZE);
      console.log(`[COMPUTE-AI-SCORES] Batch ${batchNum}/${totalBatches}: ${batch.map((a) => a.ticker).join(', ')}`);

      // Process assets sequentially within the batch — 300ms between each call
      // to avoid bursting 5-10 simultaneous requests against the gateway rate limit
      for (let j = 0; j < batch.length; j++) {
        const asset = batch[j];
        try {
          const signals = signalsByAsset.get(asset.id) || [];
          const formulaScore = Number(asset.computed_score ?? 50);

          // Fetch Tavily context if asset has signals (best-effort)
          const tavilyContext = signals.length > 0
            ? await getTavilyContext(asset.ticker, supabase)
            : '';

          const prompt = buildPrompt(asset.ticker, formulaScore, signals, tavilyContext);
          const llmContent = await callGemini(prompt, 1000, 'json');
          if (!llmContent) {
            console.warn(`[COMPUTE-AI-SCORES] ${asset.ticker}: callGemini returned null content`);
            parseErrors++;
          } else {
            const parsed = parseAIResponse(llmContent);
            if (!parsed) {
              console.warn(`[COMPUTE-AI-SCORES] ${asset.ticker}: failed to parse LLM response:`, llmContent.substring(0, 200));
              parseErrors++;
            } else {
              const hybridScore = 0.4 * formulaScore + 0.6 * parsed.ai_score;
              aiScoreRows.push({
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
              });
            }
          }
        } catch (err) {
          parseErrors++;
          const msg = err instanceof Error ? err.message : String(err);
          const isRateLimit = msg.includes('429') || msg.includes('Rate limited');
          if (isRateLimit) rateLimitErrors++;
          console.warn(`[COMPUTE-AI-SCORES] ${asset.ticker}: REJECTED — ${msg}`);
        }

        // 300ms pause between individual asset calls (skip after last asset in last batch)
        const isLastAsset = i + j + 1 >= assetsWithSignals.length;
        if (!isLastAsset) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      // Inter-batch delay (skip after last batch)
      if (i + BATCH_SIZE < assetsWithSignals.length) {
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
      sourceUsed: 'gemini-2.0-flash',
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
