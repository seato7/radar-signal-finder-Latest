import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Winsorize returns to avoid extreme outliers skewing results
const MAX_RETURN_WINSORIZE = 0.20; // Cap at +-20%

function winsorize(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
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
    let body: { horizon?: string; date?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    const horizon = body.horizon || '1d';
    
    // Grade yesterday's predictions by default, or specified date
    const now = new Date();
    let targetDate: Date;
    
    if (body.date) {
      targetDate = new Date(body.date);
    } else {
      // Yesterday
      targetDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    console.log(`Grading predictions for ${targetDateStr} with ${horizon} horizon...`);

    // Get predictions for the target date that haven't been graded yet for this horizon
    const { data: preds, error: predError } = await supabase
      .from('asset_predictions')
      .select(`
        id,
        asset_id,
        snapshot_date,
        ticker,
        expected_return,
        rank,
        top_n,
        asset_prediction_results!left(id, horizon)
      `)
      .eq('snapshot_date', targetDateStr);

    if (predError) throw predError;

    // Filter out predictions already graded for this horizon
    const ungraded = (preds || []).filter(p => {
      const results = p.asset_prediction_results || [];
      return !results.some((r: any) => r.horizon === horizon);
    });

    console.log(`Found ${ungraded.length} ungraded predictions for ${targetDateStr}`);

    if (ungraded.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          graded: 0,
          note: 'No ungraded predictions for this date/horizon',
          target_date: targetDateStr,
          horizon,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate future date based on horizon
    const horizonDays = horizon === '1d' ? 1 : horizon === '3d' ? 3 : 7;
    const futureDate = new Date(targetDate.getTime() + horizonDays * 24 * 60 * 60 * 1000);
    const futureDateStr = futureDate.toISOString().slice(0, 10);

    // Get unique tickers
    const tickers = [...new Set(ungraded.map(p => p.ticker))];

    // Fetch prices for the prediction date and future date
    const { data: pricesT0, error: p0Error } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', tickers)
      .eq('date', targetDateStr);

    if (p0Error) throw p0Error;

    const { data: pricesT1, error: p1Error } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', tickers)
      .eq('date', futureDateStr);

    if (p1Error) throw p1Error;

    // Build price lookups
    const priceT0Map = new Map<string, number>();
    const priceT1Map = new Map<string, number>();

    for (const p of pricesT0 || []) {
      priceT0Map.set(p.ticker, p.close);
    }
    for (const p of pricesT1 || []) {
      priceT1Map.set(p.ticker, p.close);
    }

    console.log(`Found prices for ${priceT0Map.size} tickers at T0, ${priceT1Map.size} at T1`);

    // Calculate results
    const results: {
      prediction_id: string;
      horizon: string;
      realized_return: number;
      hit: boolean;
    }[] = [];

    let hits = 0;
    let totalReturns = 0;
    let skippedNoPrices = 0;

    // Track by top_n buckets
    const bucketStats = new Map<number, { hits: number; total: number; returns: number[] }>();

    for (const pred of ungraded) {
      const c0 = priceT0Map.get(pred.ticker);
      const c1 = priceT1Map.get(pred.ticker);

      if (!c0 || !c1 || c0 === 0) {
        skippedNoPrices++;
        continue;
      }

      // Calculate raw return
      let realizedReturn = (c1 / c0) - 1;
      
      // Winsorize to avoid extreme outliers
      realizedReturn = winsorize(realizedReturn, MAX_RETURN_WINSORIZE);
      
      // A "hit" is when the prediction direction was correct:
      // - If expected_return > 0 (bullish), hit if realized_return > 0
      // - If expected_return < 0 (bearish), hit if realized_return < 0
      const expectedDirection = pred.expected_return > 0 ? 1 : -1;
      const realizedDirection = realizedReturn > 0 ? 1 : -1;
      const hit = expectedDirection === realizedDirection;

      if (hit) hits++;
      totalReturns += realizedReturn;

      results.push({
        prediction_id: pred.id,
        horizon,
        realized_return: realizedReturn,
        hit,
      });

      // Track bucket stats
      const topN = pred.top_n || 100;
      if (!bucketStats.has(topN)) {
        bucketStats.set(topN, { hits: 0, total: 0, returns: [] });
      }
      const bucket = bucketStats.get(topN)!;
      bucket.total++;
      if (hit) bucket.hits++;
      bucket.returns.push(realizedReturn);
    }

    console.log(`Calculated ${results.length} results, ${hits} hits (${(hits/results.length*100).toFixed(1)}% accuracy), ${skippedNoPrices} skipped (no prices)`);

    // Insert results in batches
    if (results.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const batch = results.slice(i, i + BATCH_SIZE);
        const { error: insErr } = await supabase.from('asset_prediction_results').insert(batch);
        if (insErr) throw insErr;
      }
    }

    const duration = Date.now() - startTime;
    const hitRate = results.length > 0 ? hits / results.length : 0;
    const avgReturn = results.length > 0 ? totalReturns / results.length : 0;

    // Prepare bucket breakdown for metadata
    const bucketBreakdown: Record<string, { hit_rate: number; count: number; avg_return: number }> = {};
    for (const [topN, stats] of bucketStats) {
      bucketBreakdown[`top_${topN}`] = {
        hit_rate: stats.total > 0 ? stats.hits / stats.total : 0,
        count: stats.total,
        avg_return: stats.returns.length > 0 ? stats.returns.reduce((a, b) => a + b, 0) / stats.returns.length : 0,
      };
    }

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'grade-predictions-1d',
      status: 'success',
      rows_inserted: results.length,
      duration_ms: duration,
      metadata: {
        target_date: targetDateStr,
        future_date: futureDateStr,
        horizon,
        predictions_graded: results.length,
        hit_rate: hitRate,
        avg_realized_return: avgReturn,
        hits,
        misses: results.length - hits,
        skipped_no_prices: skippedNoPrices,
        bucket_breakdown: bucketBreakdown,
        winsorize_threshold: MAX_RETURN_WINSORIZE,
      },
    });

    console.log(`grade-predictions-1d completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        graded: results.length,
        target_date: targetDateStr,
        future_date: futureDateStr,
        horizon,
        hit_rate: hitRate,
        hits,
        misses: results.length - hits,
        avg_realized_return: avgReturn,
        skipped_no_prices: skippedNoPrices,
        bucket_breakdown: bucketBreakdown,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('grade-predictions-1d error:', e);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await supabase.from('function_status').insert({
        function_name: 'grade-predictions-1d',
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
