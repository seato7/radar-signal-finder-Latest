import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Batches of 10 tickers processed in parallel, 200ms delay between batches
// Respects Finnhub rate limit (60 calls/min on free tier; higher on paid plans)
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 200;

function sentimentFromSurprise(surprisePercent: number): number {
  if (surprisePercent > 5) return 0.7;
  if (surprisePercent > 0) return 0.55;
  if (surprisePercent > -5) return 0.45;
  return 0.3;
}

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

    // Fetch top 500 assets by score
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker')
      .order('computed_score', { ascending: false })
      .limit(500);

    if (assetsError) throw assetsError;

    const assetList: { id: string; ticker: string }[] = assets || [];
    console.log(`[INGEST-FINNHUB-EARNINGS] Processing ${assetList.length} tickers`);

    const rows: any[] = [];
    let apiErrors = 0;

    // Process in batches of BATCH_SIZE with delay between batches
    for (let i = 0; i < assetList.length; i += BATCH_SIZE) {
      const batch = assetList.slice(i, i + BATCH_SIZE);

      // Fetch all tickers in the batch in parallel
      const results = await Promise.allSettled(
        batch.map(async (asset) => {
          const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${asset.ticker}&token=${FINNHUB_API_KEY}`;
          const res = await fetch(url);
          if (!res.ok) {
            console.warn(`[INGEST-FINNHUB-EARNINGS] ${asset.ticker}: HTTP ${res.status}`);
            return null;
          }
          const quarters: any[] = await res.json();
          if (!Array.isArray(quarters) || quarters.length === 0) return null;

          // Map each reported quarter to an earnings_sentiment row
          return quarters
            .filter((q) => q.period && q.actual != null && q.estimate != null)
            .map((q) => {
              const surprisePercent =
                q.surprisePercent != null
                  ? Math.max(-100, Math.min(100, q.surprisePercent))
                  : 0;
              return {
                ticker: asset.ticker,
                quarter: String(q.period).substring(0, 10),
                earnings_date: String(q.period).substring(0, 10),
                earnings_surprise: surprisePercent,
                revenue_surprise: null,
                sentiment_score: sentimentFromSurprise(q.surprisePercent ?? 0),
                metadata: {
                  actual: q.actual,
                  estimate: q.estimate,
                  surprise: q.surprise,
                  source: 'finnhub',
                },
              };
            });
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          rows.push(...result.value);
        } else if (result.status === 'rejected') {
          apiErrors++;
        }
      }

      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(assetList.length / BATCH_SIZE);
      console.log(`[INGEST-FINNHUB-EARNINGS] Batch ${batchNum}/${totalBatches} done — ${rows.length} rows so far`);

      // Delay between batches (skip after last batch)
      if (i + BATCH_SIZE < assetList.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    console.log(`[INGEST-FINNHUB-EARNINGS] ${rows.length} rows to upsert, ${apiErrors} API errors`);

    // Upsert in batches of 500 to avoid payload limits
    let insertedCount = 0;
    const UPSERT_BATCH = 500;
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const batch = rows.slice(i, i + UPSERT_BATCH);
      const { error: upsertError } = await supabase
        .from('earnings_sentiment')
        .upsert(batch, { onConflict: 'ticker,quarter', ignoreDuplicates: false });

      if (upsertError) {
        console.error('[INGEST-FINNHUB-EARNINGS] Upsert error:', upsertError);
        throw upsertError;
      }
      insertedCount += batch.length;
    }

    console.log(`[INGEST-FINNHUB-EARNINGS] ✅ Upserted ${insertedCount} earnings records`);

    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-earnings',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: apiErrors,
      duration_ms: duration,
      source_used: 'finnhub',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-finnhub-earnings',
      status: 'success',
      rowsInserted: insertedCount,
      rowsSkipped: apiErrors,
      sourceUsed: 'finnhub',
      duration,
      latencyMs: duration,
    });

    return new Response(
      JSON.stringify({ success: true, inserted: insertedCount, api_errors: apiErrors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[INGEST-FINNHUB-EARNINGS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error));

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-earnings',
      status: 'failure',
      duration_ms: duration,
      source_used: 'finnhub',
      error_message: errMsg,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-finnhub-earnings',
      message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
