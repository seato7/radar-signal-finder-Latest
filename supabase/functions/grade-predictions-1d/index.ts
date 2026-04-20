import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SlackAlerter } from '../_shared/slack-alerts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Winsorize returns to avoid extreme outliers skewing results
const MAX_RETURN_WINSORIZE = 0.20; // Cap at +-20%

// Ticker batch size for price queries (avoids URL length limits)
const TICKER_CHUNK_SIZE = 200;

// How many calendar days to search when looking for the nearest trading day
const TRADING_DAY_WINDOW = 7;

// Extra buffer days beyond horizonDays before we attempt grading, to ensure T1 prices exist.
// US market closes at ~9pm UTC; cron fires at 6am UTC the next day.
// Using 1 extra day means T1 = snapshot_date + 1d, and we only attempt grading when
// snapshot_date + 1d + 1d_buffer <= today, i.e. snapshot_date <= today - 2d.
// This guarantees T1 prices are in the DB before we attempt to grade.
const T1_PRICE_BUFFER_DAYS = 1;

// How far back to scan for ungraded predictions (avoids re-scanning entire table on each run)
const LOOKBACK_DAYS = 30;

function winsorize(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}

/**
 * Fetch the nearest available price for each ticker relative to targetDate.
 * direction='before': most recent trading day on or before targetDate (T0).
 * direction='after':  first trading day on or after targetDate (T1).
 * Queries are chunked to avoid URL length limits.
 */
async function fetchNearestPrices(
  supabase: any,
  tickers: string[],
  targetDate: string,
  direction: 'before' | 'after',
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  const target = new Date(targetDate);

  for (let i = 0; i < tickers.length; i += TICKER_CHUNK_SIZE) {
    const chunk = tickers.slice(i, i + TICKER_CHUNK_SIZE);

    if (direction === 'before') {
      // Find the most recent price on or before targetDate within the window
      const windowStart = new Date(target.getTime() - TRADING_DAY_WINDOW * 24 * 60 * 60 * 1000);
      const windowStartStr = windowStart.toISOString().slice(0, 10);

      const { data } = await supabase
        .from('prices')
        .select('ticker, date, close')
        .in('ticker', chunk)
        .lte('date', targetDate)
        .gte('date', windowStartStr)
        .order('date', { ascending: false });

      // Rows are ordered newest-first; first occurrence per ticker = nearest date <= targetDate
      for (const row of data || []) {
        if (!priceMap.has(row.ticker)) {
          priceMap.set(row.ticker, row.close);
        }
      }
    } else {
      // Find the first price on or after targetDate within the window
      const windowEnd = new Date(target.getTime() + TRADING_DAY_WINDOW * 24 * 60 * 60 * 1000);
      const windowEndStr = windowEnd.toISOString().slice(0, 10);

      const { data } = await supabase
        .from('prices')
        .select('ticker, date, close')
        .in('ticker', chunk)
        .gte('date', targetDate)
        .lte('date', windowEndStr)
        .order('date', { ascending: true });

      // Rows are ordered oldest-first; first occurrence per ticker = nearest date >= targetDate
      for (const row of data || []) {
        if (!priceMap.has(row.ticker)) {
          priceMap.set(row.ticker, row.close);
        }
      }
    }
  }

  return priceMap;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse optional parameters
    let body: { horizon?: string; date?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body provided
    }

    const horizon = body.horizon || '1d';
    const horizonDays = horizon === '1d' ? 1 : horizon === '3d' ? 3 : 7;

    const now = new Date();

    // Determine the snapshot date range to scan for ungraded predictions.
    //
    // FIX: Previously this graded only "yesterday", which meant the cron at 6am UTC
    // would set T1 = today, but today's prices don't exist yet (US market closes ~9pm UTC).
    // Every date got exactly one attempt, always failed on T1 lookup, and was permanently
    // missed. Now we:
    //   1. Scan all ungraded dates within the past LOOKBACK_DAYS
    //   2. Only attempt dates where T1 is guaranteed to have prices:
    //      snapshot_date + horizonDays + T1_PRICE_BUFFER_DAYS <= today
    //      i.e. snapshot_date <= today - (horizonDays + T1_PRICE_BUFFER_DAYS)
    //   3. Process each eligible date in one run (automatic backfill)
    //
    // Manual override: if body.date is specified, grade exactly that date regardless of
    // the buffer (useful for testing or forced re-grade).

    let scanFrom: string;
    let scanTo: string;

    if (body.date) {
      // Manual single-date mode
      scanFrom = body.date;
      scanTo = body.date;
      console.log(`Manual mode: grading predictions for ${body.date} with ${horizon} horizon...`);
    } else {
      // Automatic mode: scan ungraded dates, applying T1 price availability buffer
      const bufferMs = (horizonDays + T1_PRICE_BUFFER_DAYS) * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(now.getTime() - bufferMs);
      scanTo = cutoffDate.toISOString().slice(0, 10);

      const lookbackDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      scanFrom = lookbackDate.toISOString().slice(0, 10);

      console.log(`Auto mode: scanning ungraded ${horizon} predictions from ${scanFrom} to ${scanTo}...`);
    }

    // Fetch all predictions in the date range with their existing results for this horizon
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
      .gte('snapshot_date', scanFrom)
      .lte('snapshot_date', scanTo)
      .order('snapshot_date', { ascending: true });

    if (predError) throw predError;

    // Filter out predictions already graded for this horizon
    const ungraded = (preds || []).filter(p => {
      const results = p.asset_prediction_results || [];
      return !results.some((r: any) => r.horizon === horizon);
    });

    console.log(`Found ${ungraded.length} ungraded predictions across date range ${scanFrom}–${scanTo}`);

    if (ungraded.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          graded: 0,
          note: 'No ungraded predictions in range',
          scan_from: scanFrom,
          scan_to: scanTo,
          horizon,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group ungraded predictions by snapshot_date so we can do per-date T0/T1 price lookups
    const byDate = new Map<string, typeof ungraded>();
    for (const pred of ungraded) {
      const d = pred.snapshot_date;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(pred);
    }

    const datesFound = [...byDate.keys()].sort();
    console.log(`Processing ${datesFound.length} snapshot date(s): ${datesFound.join(', ')}`);

    // Accumulate results across all dates
    const allResults: {
      prediction_id: string;
      horizon: string;
      realized_return: number;
      hit: boolean;
    }[] = [];

    let totalHits = 0;
    let totalSkippedNoPrices = 0;

    // Track by top_n buckets (across all dates)
    const bucketStats = new Map<number, { hits: number; total: number; returns: number[] }>();

    // Per-date summary for logging
    const perDateSummary: Record<string, { graded: number; hits: number; skipped: number }> = {};

    for (const [snapshotDate, predsForDate] of byDate) {
      // T0: closing price on or just before snapshot_date
      // T1: closing price on or just after snapshot_date + horizonDays
      const t0Date = snapshotDate;
      const t1Base = new Date(new Date(snapshotDate).getTime() + horizonDays * 24 * 60 * 60 * 1000);
      const t1Date = t1Base.toISOString().slice(0, 10);

      const tickers = [...new Set(predsForDate.map(p => p.ticker))];

      const [priceT0Map, priceT1Map] = await Promise.all([
        fetchNearestPrices(supabase, tickers, t0Date, 'before'),
        fetchNearestPrices(supabase, tickers, t1Date, 'after'),
      ]);

      console.log(`${snapshotDate}: T0=${t0Date} (${priceT0Map.size} prices), T1=${t1Date} (${priceT1Map.size} prices), ${predsForDate.length} predictions`);

      let dateHits = 0;
      let dateSkipped = 0;
      let dateGraded = 0;

      for (const pred of predsForDate) {
        const c0 = priceT0Map.get(pred.ticker);
        const c1 = priceT1Map.get(pred.ticker);

        if (!c0 || !c1 || c0 === 0) {
          totalSkippedNoPrices++;
          dateSkipped++;
          continue;
        }

        // Calculate raw return
        let realizedReturn = (c1 / c0) - 1;

        // Winsorize to avoid extreme outliers
        realizedReturn = winsorize(realizedReturn, MAX_RETURN_WINSORIZE);

        // Skip if no directional prediction was made
        if (pred.expected_return === 0) {
          totalSkippedNoPrices++;
          dateSkipped++;
          continue;
        }

        const expectedDirection = pred.expected_return > 0 ? 1 : -1;
        const realizedDirection = realizedReturn > 0 ? 1 : -1;
        const hit = expectedDirection === realizedDirection;

        if (hit) {
          totalHits++;
          dateHits++;
        }

        allResults.push({
          prediction_id: pred.id,
          horizon,
          realized_return: realizedReturn,
          hit,
        });
        dateGraded++;

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

      perDateSummary[snapshotDate] = { graded: dateGraded, hits: dateHits, skipped: dateSkipped };
    }

    const gradedCount = allResults.length;
    const hitRateStr = gradedCount > 0 ? (totalHits / gradedCount * 100).toFixed(1) : '0.0';
    console.log(`Total: ${gradedCount} graded, ${totalHits} hits (${hitRateStr}% accuracy), ${totalSkippedNoPrices} skipped (no prices)`);

    // Insert results in batches
    if (allResults.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < allResults.length; i += BATCH_SIZE) {
        const batch = allResults.slice(i, i + BATCH_SIZE);
        const { error: insErr } = await supabase.from('asset_prediction_results').insert(batch);
        if (insErr) throw insErr;
      }
    }

    const duration = Date.now() - startTime;
    const hitRate = gradedCount > 0 ? totalHits / gradedCount : 0;
    const avgReturn = gradedCount > 0 ? allResults.reduce((s, r) => s + r.realized_return, 0) / gradedCount : 0;

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
      rows_inserted: allResults.length,
      duration_ms: duration,
      metadata: {
        scan_from: scanFrom,
        scan_to: scanTo,
        dates_processed: datesFound,
        horizon,
        predictions_graded: allResults.length,
        hit_rate: hitRate,
        avg_realized_return: avgReturn,
        hits: totalHits,
        misses: allResults.length - totalHits,
        skipped_no_prices: totalSkippedNoPrices,
        per_date_summary: perDateSummary,
        bucket_breakdown: bucketBreakdown,
        winsorize_threshold: MAX_RETURN_WINSORIZE,
      },
    });

    // Alert if predictions existed but none were graded — silent failure condition
    if (gradedCount === 0 && ungraded.length > 0) {
      const alerter = new SlackAlerter();
      await alerter.sendCriticalAlert({
        type: 'no_data_found',
        etlName: 'grade-predictions-1d',
        message: `grade-predictions-1d ran with ${ungraded.length} ungraded prediction(s) but graded 0. All were skipped: T1 prices likely missing for all tickers.`,
        details: {
          ungraded_count: String(ungraded.length),
          dates_scanned: datesFound.join(', '),
          skipped_no_prices: String(totalSkippedNoPrices),
          horizon,
          scan_range: `${scanFrom} to ${scanTo}`,
        },
      });
    }

    console.log(`grade-predictions-1d completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        graded: allResults.length,
        dates_processed: datesFound,
        scan_from: scanFrom,
        scan_to: scanTo,
        horizon,
        hit_rate: hitRate,
        hits: totalHits,
        misses: allResults.length - totalHits,
        avg_realized_return: avgReturn,
        skipped_no_prices: totalSkippedNoPrices,
        per_date_summary: perDateSummary,
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
