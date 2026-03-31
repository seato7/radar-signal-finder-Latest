import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

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

  // Parse body — return 400 fast if empty/invalid
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid or empty request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Finnhub may POST a single object or an array
  const newsItems: any[] = Array.isArray(body) ? body : (body.data ? body.data : [body]);

  if (!newsItems.length) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Collect all unique tickers from related fields
  const allTickers = [
    ...new Set(newsItems.flatMap((item) => item.related || []).filter(Boolean)),
  ];

  const tickerToAssetId = new Map<string, string>();
  if (allTickers.length > 0) {
    const { data: assets } = await supabase
      .from('assets')
      .select('id, ticker')
      .in('ticker', allTickers);
    for (const a of assets || []) {
      tickerToAssetId.set(a.ticker, a.id);
    }
  }

  // Build one row per ticker per news item
  const rows: any[] = [];
  for (const item of newsItems) {
    const tickers: string[] = item.related || [];
    for (const ticker of tickers) {
      if (!ticker) continue;
      rows.push({
        ticker,
        asset_id: tickerToAssetId.get(ticker) || null,
        headline: item.headline,
        summary: item.summary || null,
        source: item.source || 'Finnhub',
        url: item.url || null,
        published_at: item.datetime
          ? new Date(item.datetime * 1000).toISOString()
          : new Date().toISOString(),
        relevance_score: 0.75,
        metadata: {
          category: item.category,
          image: item.image || null,
          finnhub_id: item.id,
        },
      });
    }
  }

  if (!rows.length) {
    return new Response(JSON.stringify({ ok: true, inserted: 0, reason: 'no_tickers_in_related' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: upsertError } = await supabase
    .from('breaking_news')
    .upsert(rows, { onConflict: 'url,ticker', ignoreDuplicates: true });

  if (upsertError) {
    console.error('[FINNHUB-WEBHOOK] Upsert error:', upsertError);
    await logHeartbeat(supabase, {
      function_name: 'finnhub-webhook',
      status: 'failure',
      rows_inserted: 0,
      duration_ms: Date.now() - startTime,
      source_used: 'finnhub',
      error_message: typeof upsertError === 'object' ? JSON.stringify(upsertError) : String(upsertError),
    });
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await logHeartbeat(supabase, {
    function_name: 'finnhub-webhook',
    status: 'success',
    rows_inserted: rows.length,
    duration_ms: Date.now() - startTime,
    source_used: 'finnhub',
  });

  // Fire and forget — trigger signal generation immediately, don't block response
  supabase.functions.invoke('generate-signals-from-breaking-news', {}).catch((err: any) => {
    console.error('[FINNHUB-WEBHOOK] Signal generation invoke failed:', err);
  });

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
