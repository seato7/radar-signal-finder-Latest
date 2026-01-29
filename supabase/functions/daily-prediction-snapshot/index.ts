import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Track predictions for these N values separately
const TOP_N_VALUES = [20, 50, 100];
const MAX_PREDICTIONS = 500; // Maximum total predictions to store

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

    // Check if we already have a snapshot for today
    const { count: existingCount } = await supabase
      .from('asset_predictions')
      .select('*', { count: 'exact', head: true })
      .eq('snapshot_date', snapshotDate);

    if (existingCount && existingCount > 0) {
      console.log(`Snapshot for ${snapshotDate} already exists with ${existingCount} records`);
      return new Response(
        JSON.stringify({
          ok: true,
          inserted: 0,
          message: `Snapshot already exists for ${snapshotDate}`,
          existing_count: existingCount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get price coverage status - only include assets with 'fresh' price data
    const { data: freshCoverage, error: coverageError } = await supabase
      .from('price_coverage_daily')
      .select('ticker')
      .eq('status', 'fresh');

    if (coverageError) {
      console.warn('Could not fetch price coverage, proceeding without filter:', coverageError.message);
    }

    const freshTickers = new Set((freshCoverage || []).map(c => c.ticker));
    console.log(`Found ${freshTickers.size} tickers with fresh price coverage`);

    // Get tickers to filter with current prices
    const tickersWithPrices = new Map<string, number>();
    
    // Fetch recent prices to filter by MIN_PRICE_USD
    const { data: recentPrices, error: priceError } = await supabase
      .from('prices')
      .select('ticker, close')
      .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('date', { ascending: false });

    if (!priceError && recentPrices) {
      for (const p of recentPrices) {
        if (!tickersWithPrices.has(p.ticker)) {
          tickersWithPrices.set(p.ticker, Number(p.close));
        }
      }
    }

    console.log(`Found ${tickersWithPrices.size} tickers with recent prices`);

    // Fetch top assets by expected_return (positive expected returns)
    // Apply universe filter: price >= $1.00
    const { data: topAssets, error: topError } = await supabase
      .from('assets')
      .select('id, ticker, expected_return, confidence_score, confidence_label, model_version, score_explanation')
      .gt('expected_return', 0)
      .order('expected_return', { ascending: false })
      .limit(MAX_PREDICTIONS);

    if (topError) throw topError;

    // Filter by price threshold AND fresh price coverage
    const filteredTopAssets = (topAssets || []).filter(a => {
      // Must have fresh price coverage for tracking
      if (freshTickers.size > 0 && !freshTickers.has(a.ticker)) {
        return false;
      }
      
      const price = tickersWithPrices.get(a.ticker);
      if (price === undefined) return false; // Require price data for tracking
      return price >= MIN_PRICE_USD;
    });

    // Also fetch bottom assets (negative expected returns) for completeness
    const { data: bottomAssets, error: bottomError } = await supabase
      .from('assets')
      .select('id, ticker, expected_return, confidence_score, confidence_label, model_version, score_explanation')
      .lt('expected_return', 0)
      .order('expected_return', { ascending: true })
      .limit(100);

    if (bottomError) throw bottomError;

    // Filter bottom assets by price AND fresh coverage
    const filteredBottomAssets = (bottomAssets || []).filter(a => {
      if (freshTickers.size > 0 && !freshTickers.has(a.ticker)) {
        return false;
      }
      
      const price = tickersWithPrices.get(a.ticker);
      if (price === undefined) return false;
      return price >= MIN_PRICE_USD;
    });

    const allAssets = [...filteredTopAssets, ...filteredBottomAssets];

    console.log(`Found ${allAssets.length} assets to snapshot after filtering (${filteredTopAssets.length} bullish, ${filteredBottomAssets.length} bearish)`);
    console.log(`Excluded ${(topAssets?.length || 0) - filteredTopAssets.length} bullish assets due to missing price data or coverage`);

    // Create rows with top_n tracking
    // For each asset, determine which top_n buckets it belongs to
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
          price_at_prediction: tickersWithPrices.get(a.ticker) || null,
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
          price_at_prediction: tickersWithPrices.get(a.ticker) || null,
        },
        top_n: MAX_PREDICTIONS, // Bearish predictions stored with max top_n
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      // Insert in batches of 100
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error: insErr } = await supabase.from('asset_predictions').insert(batch);
        if (insErr) throw insErr;
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
        tickers_with_price_data: tickersWithPrices.size,
        fresh_coverage_count: freshTickers.size,
        excluded_no_coverage: (topAssets?.length || 0) - filteredTopAssets.length,
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
        fresh_coverage_count: freshTickers.size,
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
