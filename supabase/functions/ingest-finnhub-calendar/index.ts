import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
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

    const today = new Date();
    const from = toDateString(today);
    const to = toDateString(new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000));

    console.log(`[INGEST-FINNHUB-CALENDAR] Fetching earnings calendar ${from} → ${to}`);

    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Finnhub calendar API returned ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const body = await res.json();
    // Finnhub wraps the array in { earningsCalendar: [...] }
    const calendarItems: any[] = body.earningsCalendar || body || [];

    console.log(`[INGEST-FINNHUB-CALENDAR] ${calendarItems.length} upcoming earnings events`);

    if (!calendarItems.length) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-finnhub-calendar',
        status: 'success',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'finnhub_calendar',
      });
      return new Response(
        JSON.stringify({ success: true, inserted: 0, reason: 'no_calendar_events' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Collect all unique tickers and fetch asset IDs in one query
    const allTickers = [...new Set(calendarItems.map((item) => item.symbol).filter(Boolean))];

    const tickerToAssetId = new Map<string, string>();
    // Query in chunks of 500 to stay within IN clause limits
    const CHUNK = 500;
    for (let i = 0; i < allTickers.length; i += CHUNK) {
      const chunk = allTickers.slice(i, i + CHUNK);
      const { data: assets } = await supabase
        .from('assets')
        .select('id, ticker')
        .in('ticker', chunk);
      for (const a of assets || []) {
        tickerToAssetId.set(a.ticker, a.id);
      }
    }

    // Build rows — only for tickers we recognise in our assets table
    const rows: any[] = [];
    for (const item of calendarItems) {
      const ticker = item.symbol;
      if (!ticker) continue;
      // Only store events for assets we track
      if (!tickerToAssetId.has(ticker)) continue;

      const dateStr = String(item.date || '').substring(0, 10);
      if (!dateStr) continue;

      rows.push({
        ticker,
        quarter: dateStr,           // VARCHAR(10) — date used as quarter identifier
        earnings_date: dateStr,
        earnings_surprise: 0,       // Not yet reported
        revenue_surprise: null,
        sentiment_score: 0.5,       // Neutral — not yet reported
        metadata: {
          epsEstimate: item.epsEstimate ?? null,
          revenueEstimate: item.revenueEstimate ?? null,
          hour: item.hour ?? null,  // 'bmo' (before market open) or 'amc' (after market close)
          source: 'finnhub_calendar',
          status: 'upcoming',
        },
      });
    }

    console.log(`[INGEST-FINNHUB-CALENDAR] ${rows.length} rows matched to known assets`);

    if (!rows.length) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-finnhub-calendar',
        status: 'success',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'finnhub_calendar',
      });
      return new Response(
        JSON.stringify({ success: true, inserted: 0, reason: 'no_known_tickers' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert — ignoreDuplicates: false so estimates get refreshed on each run
    const { error: upsertError } = await supabase
      .from('earnings_sentiment')
      .upsert(rows, { onConflict: 'ticker,quarter', ignoreDuplicates: false });

    if (upsertError) throw upsertError;

    console.log(`[INGEST-FINNHUB-CALENDAR] ✅ Upserted ${rows.length} calendar events`);

    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-calendar',
      status: 'success',
      rows_inserted: rows.length,
      duration_ms: duration,
      source_used: 'finnhub_calendar',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-finnhub-calendar',
      status: 'success',
      rowsInserted: rows.length,
      rowsSkipped: calendarItems.length - rows.length,
      sourceUsed: 'finnhub_calendar',
      duration,
      latencyMs: duration,
    });

    return new Response(
      JSON.stringify({
        success: true,
        inserted: rows.length,
        total_events: calendarItems.length,
        unmatched: calendarItems.length - rows.length,
        window: { from, to },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[INGEST-FINNHUB-CALENDAR] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error));

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-calendar',
      status: 'failure',
      duration_ms: duration,
      source_used: 'finnhub_calendar',
      error_message: errMsg,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-finnhub-calendar',
      message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
