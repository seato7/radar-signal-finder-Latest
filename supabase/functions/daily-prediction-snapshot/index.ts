import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Track predictions for these N values separately
const TOP_N_VALUES = [50, 100, 250, 500];
const MAX_PREDICTIONS = 2000; // Maximum total predictions to store

// Universe filters
const MIN_PRICE_USD = 1.00;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const today = new Date();
    const snapshotDate = today.toISOString().slice(0, 10); // YYYY-MM-DD

    console.log(`Creating daily prediction snapshot for ${snapshotDate}...`);

    // Fetch top BULLISH assets by expected_return
    // Using assets table directly with price_status filter (no external joins needed)
    // The compute-asset-scores function already sets price_status = 'fresh' for valid assets
    const { data: topAssets, error: topError } = await supabase
      .from('assets')
      .select('id, ticker, expected_return, confidence_score, confidence_label, model_version, score_explanation')
      .gt('expected_return', 0)
      .eq('price_status', 'fresh')
      .gte('score_computed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Scored in last 24h
      .order('expected_return', { ascending: false })
      .limit(MAX_PREDICTIONS);

    if (topError) throw topError;

    console.log(`Fetched ${topAssets?.length || 0} bullish assets from database`);

    // Also fetch bottom assets (negative expected returns) for completeness
    const { data: bottomAssets, error: bottomError } = await supabase
      .from('assets')
      .select('id, ticker, expected_return, confidence_score, confidence_label, model_version, score_explanation')
      .lt('expected_return', 0)
      .eq('price_status', 'fresh')
      .gte('score_computed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('expected_return', { ascending: true })
      .limit(100);

    if (bottomError) throw bottomError;

    // Bulk-fetch most recent closing price for all candidate assets in one query
    const allCandidates = [...(topAssets || []), ...(bottomAssets || [])];
    const assetIds = allCandidates.map(a => a.id);
    const priceMap = new Map<string, number>();

    if (assetIds.length > 0) {
      const { data: priceRows } = await supabase
        .from('prices')
        .select('asset_id, close')
        .in('asset_id', assetIds)
        .order('date', { ascending: false })
        .limit(10000);

      for (const row of priceRows || []) {
        if (!priceMap.has(row.asset_id)) {
          priceMap.set(row.asset_id, row.close);
        }
      }
    }

    console.log(`Fetched closing prices for ${priceMap.size} of ${assetIds.length} assets`);

    // Filter by price threshold using real closing prices
    const filteredTopAssets = (topAssets || []).filter(a => {
      const price = priceMap.get(a.id) ?? null;
      if (price === null) return true; // No price data yet — include, grader will handle
      return price >= MIN_PRICE_USD;
    });

    console.log(`After price filter: ${filteredTopAssets.length} bullish assets`);

    // Filter bottom assets by price
    const filteredBottomAssets = (bottomAssets || []).filter(a => {
      const price = priceMap.get(a.id) ?? null;
      if (price === null) return true;
      return price >= MIN_PRICE_USD;
    });

    const allAssets = [...filteredTopAssets, ...filteredBottomAssets];

    console.log(`Found ${allAssets.length} assets to snapshot after filtering (${filteredTopAssets.length} bullish, ${filteredBottomAssets.length} bearish)`);

    // Create rows with top_n tracking
    const rows: {
      snapshot_date: string;
      asset_id: string;
      ticker: string;
      expected_return: number;
      confidence_score: number;
      confidence_label: string;
      rank: number;
      model_version: string;
      feature_snapshot: object;
      top_n: number;
    }[] = [];

    // For bullish assets, determine top_n buckets
    for (let i = 0; i < filteredTopAssets.length; i++) {
      const a = filteredTopAssets[i];
      const rank = i + 1;
      
      // Determine largest applicable top_n
      let topN = MAX_PREDICTIONS;
      for (const n of TOP_N_VALUES) {
        if (rank <= n) {
          topN = n;
          break;
        }
      }

      rows.push({
        snapshot_date: snapshotDate,
        asset_id: a.id,
        ticker: a.ticker,
        expected_return: Number(a.expected_return ?? 0),
        confidence_score: Number(a.confidence_score ?? 0),
        confidence_label: String(a.confidence_label ?? 'moderate'),
        rank,
        model_version: String(a.model_version ?? 'v1_alpha'),
        feature_snapshot: {
          expected_return: Number(a.expected_return ?? 0),
          confidence_score: Number(a.confidence_score ?? 0),
          score_explanation: a.score_explanation || [],
          price_at_prediction: priceMap.get(a.id) ?? null,
        },
        top_n: topN,
      });
    }

    // Add bearish assets with high rank (indicating bearish position)
    for (let i = 0; i < filteredBottomAssets.length; i++) {
      const a = filteredBottomAssets[i];
      const rank = filteredTopAssets.length + i + 1;

      rows.push({
        snapshot_date: snapshotDate,
        asset_id: a.id,
        ticker: a.ticker,
        expected_return: Number(a.expected_return ?? 0),
        confidence_score: Number(a.confidence_score ?? 0),
        confidence_label: String(a.confidence_label ?? 'moderate'),
        rank,
        model_version: String(a.model_version ?? 'v1_alpha'),
        feature_snapshot: {
          expected_return: Number(a.expected_return ?? 0),
          confidence_score: Number(a.confidence_score ?? 0),
          score_explanation: a.score_explanation || [],
          price_at_prediction: priceMap.get(a.id) ?? null,
        },
        top_n: MAX_PREDICTIONS, // Bearish predictions stored with max top_n
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      // Upsert in batches of 100 — idempotent on (snapshot_date, asset_id)
      // Safe to re-run if a previous invocation crashed mid-batch
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error: upsertErr } = await supabase
          .from('asset_predictions')
          .upsert(batch, { onConflict: 'snapshot_date,asset_id' });
        if (upsertErr) throw upsertErr;
        inserted += batch.length;
      }
    }

    const duration = Date.now() - startTime;

    // Calculate metrics for summary
    const top20Count = rows.filter(r => r.rank <= 20 && r.expected_return > 0).length;
    const top50Count = rows.filter(r => r.rank <= 50 && r.expected_return > 0).length;
    const top100Count = rows.filter(r => r.rank <= 100 && r.expected_return > 0).length;

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'daily-prediction-snapshot',
      status: 'success',
      rows_inserted: inserted,
      duration_ms: duration,
      metadata: {
        snapshot_date: snapshotDate,
        bullish_count: filteredTopAssets.length,
        bearish_count: filteredBottomAssets.length,
        top_20: top20Count,
        top_50: top50Count,
        top_100: top100Count,
        price_filter_applied: MIN_PRICE_USD,
      },
    });

    console.log(`daily-prediction-snapshot completed in ${duration}ms, inserted ${inserted} records`);

    return new Response(
      JSON.stringify({
        ok: true,
        inserted,
        snapshot_date: snapshotDate,
        bullish_count: filteredTopAssets.length,
        bearish_count: filteredBottomAssets.length,
        top_20: top20Count,
        top_50: top50Count,
        top_100: top100Count,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('daily-prediction-snapshot error:', e);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await supabase.from('function_status').insert({
        function_name: 'daily-prediction-snapshot',
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
