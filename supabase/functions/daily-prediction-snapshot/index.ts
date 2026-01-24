import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const TOP_N = 500; // Top 500 assets by expected return

    // Fetch top assets by expected_return (positive expected returns)
    const { data: topAssets, error: topError } = await supabase
      .from('assets')
      .select('id, ticker, expected_return, confidence_score, confidence_label, model_version, score_explanation')
      .gt('expected_return', 0)
      .order('expected_return', { ascending: false })
      .limit(TOP_N);

    if (topError) throw topError;

    // Also fetch bottom assets (negative expected returns) for completeness
    const { data: bottomAssets, error: bottomError } = await supabase
      .from('assets')
      .select('id, ticker, expected_return, confidence_score, confidence_label, model_version, score_explanation')
      .lt('expected_return', 0)
      .order('expected_return', { ascending: true })
      .limit(100);

    if (bottomError) throw bottomError;

    const allAssets = [...(topAssets || []), ...(bottomAssets || [])];

    console.log(`Found ${allAssets.length} assets to snapshot (${topAssets?.length || 0} bullish, ${bottomAssets?.length || 0} bearish)`);

    const rows = allAssets.map((a, idx) => ({
      snapshot_date: snapshotDate,
      asset_id: a.id,
      ticker: a.ticker,
      expected_return: Number(a.expected_return ?? 0),
      confidence_score: Number(a.confidence_score ?? 0),
      confidence_label: String(a.confidence_label ?? 'moderate'),
      rank: idx + 1,
      model_version: String(a.model_version ?? 'v1_alpha'),
      feature_snapshot: {
        expected_return: Number(a.expected_return ?? 0),
        confidence_score: Number(a.confidence_score ?? 0),
        score_explanation: a.score_explanation || [],
      },
    }));

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

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'daily-prediction-snapshot',
      status: 'success',
      rows_inserted: inserted,
      duration_ms: duration,
      metadata: {
        snapshot_date: snapshotDate,
        bullish_count: topAssets?.length || 0,
        bearish_count: bottomAssets?.length || 0,
      },
    });

    console.log(`daily-prediction-snapshot completed in ${duration}ms, inserted ${inserted} records`);

    return new Response(
      JSON.stringify({
        ok: true,
        inserted,
        snapshot_date: snapshotDate,
        bullish_count: topAssets?.length || 0,
        bearish_count: bottomAssets?.length || 0,
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
