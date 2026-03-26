import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================================================================
  // CRON SECRET ENFORCEMENT
  // If CRON_SHARED_SECRET is set, require x-cron-secret header to match
  // ========================================================================
  const expectedSecret = Deno.env.get('CRON_SHARED_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  
  if (expectedSecret && providedSecret !== expectedSecret) {
    console.warn('[PRICE-COVERAGE] Unauthorized: missing or invalid x-cron-secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Parse inputs
    let snapshotDate: string;
    let freshnessDays = 7;
    let vendor = 'twelvedata';

    try {
      const body = await req.json();
      snapshotDate = body?.snapshot_date ?? new Date().toISOString().split('T')[0];
      freshnessDays = body?.freshness_days ?? 7;
      vendor = body?.vendor ?? 'twelvedata';
    } catch {
      snapshotDate = new Date().toISOString().split('T')[0];
    }

    console.log(`[PRICE-COVERAGE] Computing coverage for ${snapshotDate}, freshness=${freshnessDays}d, vendor=${vendor}`);

    // ========================================================================
    // CALL THE RPC FUNCTION - Does all work DB-side in one transaction:
    // 1. Aggregates prices per ticker (last_price_date, points_30d, points_90d)
    // 2. Upserts into price_coverage_daily
    // 3. Updates assets table with price_status, rank_status, etc.
    // ========================================================================
    const { data: rpcResult, error: rpcError } = await supabase.rpc('compute_and_update_coverage', {
      p_snapshot_date: snapshotDate,
      p_vendor: vendor,
      p_freshness_days: freshnessDays,
    });

    if (rpcError) {
      throw new Error(`RPC compute_and_update_coverage failed: ${rpcError.message}`);
    }

    const result = rpcResult?.[0] || { 
      coverage_rows_upserted: 0, 
      assets_updated: 0, 
      fresh_count: 0, 
      stale_count: 0, 
      missing_count: 0 
    };

    console.log(`[PRICE-COVERAGE] RPC complete: coverage=${result.coverage_rows_upserted}, assets=${result.assets_updated}, fresh=${result.fresh_count}, stale=${result.stale_count}, missing=${result.missing_count}`);

    const duration = Date.now() - startTime;

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'compute-price-coverage-daily',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: result.coverage_rows_upserted,
      metadata: {
        snapshot_date: snapshotDate,
        freshness_days: freshnessDays,
        vendor,
        coverage_rows_upserted: result.coverage_rows_upserted,
        assets_updated: result.assets_updated,
        fresh: result.fresh_count,
        stale: result.stale_count,
        missing: result.missing_count,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      snapshot_date: snapshotDate,
      coverage_rows_upserted: result.coverage_rows_upserted,
      assets_updated: result.assets_updated,
      fresh: result.fresh_count,
      stale: result.stale_count,
      missing: result.missing_count,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PRICE-COVERAGE] Error:', errorMessage);

    const duration = Date.now() - startTime;

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      await supabase.from('function_status').insert({
        function_name: 'compute-price-coverage-daily',
        status: 'failure',
        executed_at: new Date().toISOString(),
        duration_ms: duration,
        error_message: errorMessage,
      });
    } catch {
      // Ignore logging errors
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
