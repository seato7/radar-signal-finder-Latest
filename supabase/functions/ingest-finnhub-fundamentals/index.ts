import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Finnhub free tier = 60 RPM; 350ms between sequential calls avoids 429s at tail end of 200 calls
const CALL_DELAY_MS = 350;

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

    // Top 200 stocks by computed_score — fundamentals only meaningful for equities
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker')
      .eq('asset_class', 'stock')
      .order('computed_score', { ascending: false })
      .limit(200);

    if (assetsError) throw assetsError;
    if (!assets || assets.length === 0) throw new Error('No stock assets returned');

    console.log(`[INGEST-FUNDAMENTALS] Processing ${assets.length} tickers`);

    let inserted = 0;
    let skipped = 0;
    let apiErrors = 0;

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];

      if (i > 0) {
        await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
      }

      try {
        const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(asset.ticker)}&metric=all&token=${FINNHUB_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
          console.warn(`[INGEST-FUNDAMENTALS] ${asset.ticker}: HTTP ${res.status}`);
          apiErrors++;
          continue;
        }

        const body = await res.json();
        const m = body?.metric;

        if (!m || typeof m !== 'object') {
          skipped++;
          continue;
        }

        // Extract the metrics we care about — all nullable (free tier may omit some)
        const netMargin = m.netMarginTTM ?? m.netMarginAnnual ?? m.netMargin ?? null;
        const roa = m.roaRfy ?? m.roa ?? null;
        const roe = m.roeRfy ?? m.roe ?? null;
        const revenueGrowthYoy = m.revenueGrowthTTMYoy ?? null;
        const epsGrowth5Y = m['epsGrowth5Y'] ?? m.epsGrowthTTMYoy ?? null;
        const beta = m.beta ?? null;

        // Skip rows where we got no usable data at all
        if (
          netMargin == null && roa == null && roe == null &&
          revenueGrowthYoy == null && epsGrowth5Y == null && beta == null
        ) {
          skipped++;
          continue;
        }

        const { error: upsertError } = await supabase
          .from('company_fundamentals')
          .upsert({
            ticker: asset.ticker,
            asset_id: asset.id,
            net_margin: netMargin != null ? Math.round(netMargin * 10000) / 10000 : null,
            roa: roa != null ? Math.round(roa * 10000) / 10000 : null,
            roe: roe != null ? Math.round(roe * 10000) / 10000 : null,
            revenue_growth_yoy: revenueGrowthYoy != null ? Math.round(revenueGrowthYoy * 10000) / 10000 : null,
            eps_growth_5y: epsGrowth5Y != null ? Math.round(epsGrowth5Y * 10000) / 10000 : null,
            beta: beta != null ? Math.round(beta * 10000) / 10000 : null,
            fetched_at: new Date().toISOString(),
          }, { onConflict: 'ticker' });

        if (upsertError) {
          console.error(`[INGEST-FUNDAMENTALS] Upsert error for ${asset.ticker}:`, upsertError.message);
          apiErrors++;
          continue;
        }

        inserted++;
        console.log(`[INGEST-FUNDAMENTALS] ✅ ${asset.ticker}: margin=${netMargin?.toFixed(1)}% roe=${roe?.toFixed(1)}% revGrowth=${revenueGrowthYoy?.toFixed(1)}%`);

      } catch (err) {
        console.error(`[INGEST-FUNDAMENTALS] Error for ${asset.ticker}:`, err instanceof Error ? err.message : String(err));
        apiErrors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[INGEST-FUNDAMENTALS] ✅ Complete: ${inserted} upserted, ${skipped} skipped, ${apiErrors} API errors`);

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-fundamentals',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skipped + apiErrors,
      duration_ms: duration,
      source_used: 'finnhub',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-finnhub-fundamentals',
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
    console.error('[INGEST-FUNDAMENTALS] ❌ Fatal error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-fundamentals',
      status: 'failure',
      duration_ms: duration,
      source_used: 'finnhub',
      error_message: errMsg,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-finnhub-fundamentals',
      message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
