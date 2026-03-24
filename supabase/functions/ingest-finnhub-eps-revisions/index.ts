import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CALL_DELAY_MS = 300; // Sequential, 300ms between calls to respect Finnhub rate limits
const EPS_REVISION_THRESHOLD = 5; // % change required to record a revision direction

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
    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    if (!FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY not configured');

    // Fetch top 200 assets by computed_score (stocks only — estimate endpoint is equity-only)
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker')
      .eq('asset_class', 'stock')
      .order('computed_score', { ascending: false })
      .limit(200);

    if (assetsError) throw assetsError;
    if (!assets || assets.length === 0) throw new Error('No assets returned');

    console.log(`[INGEST-EPS-REVISIONS] Processing ${assets.length} tickers`);

    // Pre-fetch existing eps_revisions for comparison (these are the "prior" estimates)
    const { data: priorRecords } = await supabase
      .from('eps_revisions')
      .select('ticker, period, current_estimate, fetched_at')
      .in('ticker', assets.map((a) => a.ticker));

    // Keyed by "ticker|period" for O(1) lookup
    const priorMap = new Map<string, { current_estimate: number | null; fetched_at: string }>();
    for (const r of priorRecords || []) {
      priorMap.set(`${r.ticker}|${r.period}`, {
        current_estimate: r.current_estimate != null ? Number(r.current_estimate) : null,
        fetched_at: r.fetched_at,
      });
    }

    console.log(`[INGEST-EPS-REVISIONS] Loaded ${priorMap.size} prior estimate records`);

    let inserted = 0;
    let skipped = 0;
    let apiErrors = 0;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      // Sequential delay (skip before first call)
      if (i > 0) {
        await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      }

      try {
        const url = `https://finnhub.io/api/v1/estimate?symbol=${encodeURIComponent(asset.ticker)}&freq=quarterly&token=${FINNHUB_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
          console.warn(`[INGEST-EPS-REVISIONS] ${asset.ticker}: HTTP ${res.status}`);
          apiErrors++;
          continue;
        }

        const body = await res.json();
        const estimates: any[] = body?.data || [];

        if (!Array.isArray(estimates) || estimates.length === 0) {
          skipped++;
          continue;
        }

        // Sort descending by period — take the most recent with a valid epsAvg
        estimates.sort((a: any, b: any) => String(b.period ?? '').localeCompare(String(a.period ?? '')));
        const latest = estimates.find((e: any) => e.epsAvg != null);

        if (!latest) {
          skipped++;
          continue;
        }

        const period = String(latest.period).substring(0, 10);
        const currentEstimate = Number(latest.epsAvg);

        // Compare vs stored prior estimate for this ticker+period
        const prior = priorMap.get(`${asset.ticker}|${period}`);
        let revisionPct: number | null = null;
        let revisionDirection: string | null = null;
        const priorEstimate = prior?.current_estimate ?? null;

        if (priorEstimate != null && priorEstimate !== 0) {
          revisionPct = ((currentEstimate - priorEstimate) / Math.abs(priorEstimate)) * 100;
          if (revisionPct > EPS_REVISION_THRESHOLD) {
            revisionDirection = 'up';
          } else if (revisionPct < -EPS_REVISION_THRESHOLD) {
            revisionDirection = 'down';
          }
        }

        const { error: upsertError } = await supabase
          .from('eps_revisions')
          .upsert({
            ticker: asset.ticker,
            asset_id: asset.id,
            period,
            current_estimate: currentEstimate,
            prior_estimate: priorEstimate,
            revision_pct: revisionPct != null ? Math.round(revisionPct * 100) / 100 : null,
            revision_direction: revisionDirection,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'ticker,period' });

        if (upsertError) {
          console.error(`[INGEST-EPS-REVISIONS] Upsert error for ${asset.ticker}:`, upsertError.message);
          apiErrors++;
          continue;
        }

        inserted++;
        if (revisionDirection) {
          console.log(`[INGEST-EPS-REVISIONS] ✅ ${asset.ticker} ${period}: ${revisionDirection} ${revisionPct?.toFixed(1)}% (${priorEstimate?.toFixed(2)} → ${currentEstimate.toFixed(2)})`);
        }

      } catch (err) {
        console.error(`[INGEST-EPS-REVISIONS] Error for ${asset.ticker}:`, err instanceof Error ? err.message : String(err));
        apiErrors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[INGEST-EPS-REVISIONS] ✅ Complete: ${inserted} upserted, ${skipped} skipped, ${apiErrors} API errors`);

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-eps-revisions',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped + apiErrors,
      duration_ms: duration,
      source_used: 'finnhub',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-finnhub-eps-revisions',
      status: 'success',
      rowsInserted: inserted,
      rowsSkipped: skipped + apiErrors,
      sourceUsed: 'finnhub',
      duration,
    });

    return new Response(
      JSON.stringify({ success: true, inserted, skipped, api_errors: apiErrors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[INGEST-EPS-REVISIONS] ❌ Fatal error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-eps-revisions',
      status: 'failure',
      duration_ms: duration,
      source_used: 'finnhub',
      error_message: errMsg,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-finnhub-eps-revisions',
      message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
