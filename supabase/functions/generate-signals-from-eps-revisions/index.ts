import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { fireAiScoring } from "../_shared/fire-ai-scoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    console.log('[SIGNAL-GEN-EPS-REVISIONS] Starting EPS revision signal generation...');

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Only rows with a confirmed revision direction (> 5% threshold applied at ingest)
    const { data: revisions, error: revisionsError } = await supabase
      .from('eps_revisions')
      .select('*')
      .gte('fetched_at', sevenDaysAgo)
      .not('revision_direction', 'is', null);

    if (revisionsError) throw revisionsError;

    console.log(`[SIGNAL-GEN-EPS-REVISIONS] Found ${revisions?.length || 0} EPS revision records`);

    if (!revisions || revisions.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'generate-signals-from-eps-revisions',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'eps_revisions',
      });
      return new Response(
        JSON.stringify({ message: 'No EPS revision data to process', signals_created: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve asset_ids for any rows that don't carry asset_id directly
    const tickers = [...new Set(revisions.map((r) => r.ticker))];
    const { data: assets } = await supabase
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map((a) => [a.ticker, a.id]) || []);
    const assetIdToTicker = new Map(assets?.map((a) => [a.id, a.ticker]) || []);

    const signals = [];

    for (const rev of revisions) {
      // Prefer asset_id from the row; fall back to lookup by ticker
      const assetId = rev.asset_id ?? tickerToAssetId.get(rev.ticker);
      if (!assetId) {
        console.warn(`[SIGNAL-GEN-EPS-REVISIONS] No asset_id for ticker ${rev.ticker} — skipping`);
        continue;
      }

      const revisionPct = Number(rev.revision_pct ?? 0);
      const direction = rev.revision_direction as 'up' | 'down';
      const signalType = direction === 'up' ? 'eps_revision_up' : 'eps_revision_down';

      const magnitude = Math.min(5, (Math.abs(revisionPct) / 100) * 5);

      const signalData = {
        ticker: rev.ticker,
        period: rev.period,
        signal_type: signalType,
      };

      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: rev.fetched_at,
        value_text: `EPS estimate revised ${direction === 'up' ? 'up' : 'down'} ${Math.abs(revisionPct).toFixed(1)}% for ${rev.period} (${rev.prior_estimate?.toFixed(2) ?? 'n/a'} → ${rev.current_estimate?.toFixed(2) ?? 'n/a'})`,
        checksum: JSON.stringify(signalData),
        citation: {
          source: 'Finnhub EPS Estimates',
          timestamp: new Date().toISOString(),
        },
        raw: {
          period: rev.period,
          current_estimate: rev.current_estimate,
          prior_estimate: rev.prior_estimate,
          revision_pct: revisionPct,
          revision_direction: direction,
        },
      });
    }

    let insertedCount = 0;
    const batchSize = 100;

    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: upsertError } = await supabase
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');

      if (upsertError) {
        console.error('[SIGNAL-GEN-EPS-REVISIONS] Batch upsert error:', upsertError.message);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    console.log(`[SIGNAL-GEN-EPS-REVISIONS] ✅ Upserted ${insertedCount} EPS revision signals`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t)),
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'generate-signals-from-eps-revisions',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'eps_revisions',
    });

    return new Response(
      JSON.stringify({
        success: true,
        revisions_processed: revisions.length,
        signals_created: insertedCount,
        duplicates_skipped: signals.length - insertedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[SIGNAL-GEN-EPS-REVISIONS] ❌ Error:', error);
    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'generate-signals-from-eps-revisions',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
