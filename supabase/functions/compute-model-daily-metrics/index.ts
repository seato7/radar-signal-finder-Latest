import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Objective function coefficients per requirements
const OBJECTIVE_COEFFICIENTS = {
  hitRate: 0.65,
  meanReturn: 0.35,
  tailLossPenalty: -0.50,
  volatilityPenalty: -0.25,
};

// Thresholds
const TAIL_LOSS_THRESHOLD = -0.02; // -2%
const MAX_VOLATILITY_THRESHOLD = 0.03; // 3%

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function computeObjectiveScore(
  hitRate: number, 
  meanReturn: number, 
  p5Return: number, 
  volatility: number
): number {
  // Tail loss penalty: increases when p5 is worse than -2%
  const tailLossPenalty = p5Return < TAIL_LOSS_THRESHOLD 
    ? Math.abs(p5Return - TAIL_LOSS_THRESHOLD) * 10 
    : 0;
  
  // Volatility penalty: increases as volatility exceeds threshold
  const volPenalty = volatility > MAX_VOLATILITY_THRESHOLD
    ? (volatility - MAX_VOLATILITY_THRESHOLD) * 10
    : 0;
  
  // Normalize hit rate to 0-1 scale (it's already 0-1)
  // Normalize mean return: 1% daily return = 0.01, scale up
  const scaledMeanReturn = meanReturn * 100; // Convert to percentage points
  
  const objective = 
    OBJECTIVE_COEFFICIENTS.hitRate * hitRate +
    OBJECTIVE_COEFFICIENTS.meanReturn * scaledMeanReturn +
    OBJECTIVE_COEFFICIENTS.tailLossPenalty * tailLossPenalty +
    OBJECTIVE_COEFFICIENTS.volatilityPenalty * volPenalty;
  
  return objective;
}

function computeMaxDrawdown(cumulativeReturns: number[]): number {
  if (cumulativeReturns.length === 0) return 0;
  
  // Convert returns to equity curve (starting at 1)
  const equity: number[] = [1];
  for (let i = 0; i < cumulativeReturns.length; i++) {
    equity.push(equity[equity.length - 1] * (1 + cumulativeReturns[i]));
  }
  
  // Calculate max drawdown
  let maxDD = 0;
  let peak = equity[0];
  
  for (const val of equity) {
    if (val > peak) peak = val;
    const dd = (peak - val) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  
  return maxDD;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse optional parameters
    let body: { date?: string; model_version?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    const modelVersion = body.model_version || 'v1_alpha';
    
    // Process metrics for each date with graded results
    // Get all dates that have been graded
    const { data: gradedDates, error: datesError } = await supabase
      .from('asset_prediction_results')
      .select('prediction_id')
      .limit(1);

    if (datesError) throw datesError;

    if (!gradedDates || gradedDates.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: 'No graded predictions available yet',
          note: 'Run grade-predictions-1d first after predictions are at least 1 day old',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all graded results with their predictions
    const { data: results, error: resultsError } = await supabase
      .from('asset_prediction_results')
      .select(`
        id,
        prediction_id,
        horizon,
        realized_return,
        hit,
        asset_predictions!inner(
          snapshot_date,
          ticker,
          expected_return,
          rank,
          model_version,
          top_n
        )
      `)
      .eq('horizon', '1d');

    if (resultsError) throw resultsError;

    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: 'No 1d graded results available',
          graded_count: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${results.length} graded results...`);

    // Group results by date, model_version, and top_n
    const groupedResults = new Map<string, {
      date: string;
      version: string;
      topN: number;
      returns: number[];
      hits: number;
      total: number;
    }>();

    const TOP_N_VALUES = [20, 50, 100];

    for (const r of results) {
      const pred = r.asset_predictions as any;
      const dateStr = pred.snapshot_date;
      const version = pred.model_version || modelVersion;
      const rank = pred.rank || 1;

      // Check each top_n threshold
      for (const topN of TOP_N_VALUES) {
        if (rank <= topN) {
          const key = `${dateStr}|${version}|${topN}`;
          
          if (!groupedResults.has(key)) {
            groupedResults.set(key, {
              date: dateStr,
              version,
              topN,
              returns: [],
              hits: 0,
              total: 0,
            });
          }
          
          const group = groupedResults.get(key)!;
          group.returns.push(Number(r.realized_return));
          if (r.hit) group.hits++;
          group.total++;
        }
      }
    }

    console.log(`Grouped into ${groupedResults.size} date/version/topN combinations`);

    // Calculate metrics for each group
    const metricsToInsert: {
      model_version: string;
      snapshot_date: string;
      top_n: number;
      hit_rate: number;
      mean_return: number;
      median_return: number;
      volatility: number;
      p5_return: number;
      max_drawdown: number;
      cumulative_return: number;
      objective_score: number;
      predictions_count: number;
      graded_count: number;
      metadata: object;
    }[] = [];

    for (const [key, group] of groupedResults) {
      const { date, version, topN, returns, hits, total } = group;

      if (returns.length === 0) continue;

      const hitRate = total > 0 ? hits / total : 0;
      const meanRet = mean(returns);
      const medianRet = median(returns);
      const vol = std(returns);
      const p5 = percentile(returns, 5);
      const maxDD = computeMaxDrawdown(returns);
      
      // Cumulative return: product of (1 + r) - 1
      const cumRet = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
      
      const objScore = computeObjectiveScore(hitRate, meanRet, p5, vol);

      metricsToInsert.push({
        model_version: version,
        snapshot_date: date,
        top_n: topN,
        hit_rate: hitRate,
        mean_return: meanRet,
        median_return: medianRet,
        volatility: vol,
        p5_return: p5,
        max_drawdown: maxDD,
        cumulative_return: cumRet,
        objective_score: objScore,
        predictions_count: total,
        graded_count: returns.length,
        metadata: {
          computed_at: new Date().toISOString(),
          objective_formula: 'hit_rate*0.65 + mean_return*0.35 - tail_loss*0.50 - vol*0.25',
        },
      });
    }

    console.log(`Inserting ${metricsToInsert.length} metric records...`);
    let upsertErrors = 0;

    // Upsert metrics
    if (metricsToInsert.length > 0) {
      for (const metric of metricsToInsert) {
        const { error: upsertErr } = await supabase
          .from('model_daily_metrics')
          .upsert(metric, { 
            onConflict: 'model_version,snapshot_date,top_n',
          });
        
        if (upsertErr) {
          console.error(`Error upserting metric for ${metric.snapshot_date}/${metric.top_n}:`, upsertErr);
          upsertErrors++;
        }
      }
    }

    const duration = Date.now() - startTime;

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'compute-model-daily-metrics',
      status: 'success',
      rows_inserted: metricsToInsert.length,
      duration_ms: duration,
      metadata: {
        model_version: modelVersion,
        groups_processed: groupedResults.size,
        total_results_analyzed: results.length,
      },
    });

    console.log(`compute-model-daily-metrics completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        ok: upsertErrors === 0,
        upsert_errors: upsertErrors,
        metrics_computed: metricsToInsert.length,
        groups_analyzed: groupedResults.size,
        total_graded_results: results.length,
        duration_ms: duration,
        sample_metrics: metricsToInsert.slice(0, 3),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('compute-model-daily-metrics error:', e);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await supabase.from('function_status').insert({
        function_name: 'compute-model-daily-metrics',
        status: 'error',
        error_message: String(e),
        duration_ms: Date.now() - startTime,
      });
    }

    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
