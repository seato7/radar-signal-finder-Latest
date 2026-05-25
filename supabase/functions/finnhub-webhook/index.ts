import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-finnhub-secret, x-finnhub-signature',
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get('FINNHUB_WEBHOOK_SECRET') ?? '';
  if (!expectedSecret) {
    console.error('[FINNHUB-WEBHOOK] FINNHUB_WEBHOOK_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Read raw body once so we can verify HMAC AND parse JSON
  const rawBody = await req.text();

  // Finnhub supports two auth modes:
  //   1. Shared-secret header: X-Finnhub-Secret == FINNHUB_WEBHOOK_SECRET
  //   2. HMAC-SHA256 header:   X-Finnhub-Signature == hmac_sha256(secret, raw_body)
  // We accept either, both compared in constant time. Reject if both missing/invalid.
  const sharedSecretHeader = req.headers.get('x-finnhub-secret') ?? '';
  const signatureHeader = req.headers.get('x-finnhub-signature') ?? '';

  let authorized = false;
  if (sharedSecretHeader && timingSafeEqual(sharedSecretHeader, expectedSecret)) {
    authorized = true;
  } else if (signatureHeader) {
    const computed = await hmacSha256Hex(expectedSecret, rawBody);
    if (timingSafeEqual(signatureHeader.toLowerCase(), computed)) authorized = true;
  }

  if (!authorized) {
    console.warn('[FINNHUB-WEBHOOK] Rejected unauthenticated webhook call');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let body: any;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid or empty request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!body) {
    return new Response(JSON.stringify({ error: 'Empty body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const newsItems: any[] = Array.isArray(body) ? body : (body.data ? body.data : [body]);

  if (!newsItems.length) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const allTickers = [
    ...new Set(newsItems.flatMap((item) => item.related || []).filter(Boolean)),
  ];

  const tickerToAssetId = new Map<string, string>();
  if (allTickers.length > 0) {
    const { data: assets } = await supabase
      .from('assets').select('id, ticker').in('ticker', allTickers);
    for (const a of assets || []) tickerToAssetId.set(a.ticker, a.id);
  }

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
        metadata: { category: item.category, image: item.image || null, finnhub_id: item.id },
      });
    }
  }

  if (!rows.length) {
    return new Response(JSON.stringify({ ok: true, inserted: 0, reason: 'no_tickers_in_related' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: upsertError } = await supabase
    .from('breaking_news')
    .upsert(rows, { onConflict: 'url,ticker', ignoreDuplicates: true });

  if (upsertError) {
    console.error('[FINNHUB-WEBHOOK] Upsert error:', upsertError);
    await logHeartbeat(supabase, {
      function_name: 'finnhub-webhook', status: 'failure', rows_inserted: 0,
      duration_ms: Date.now() - startTime, source_used: 'finnhub',
      error_message: typeof upsertError === 'object' ? JSON.stringify(upsertError) : String(upsertError),
    });
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await logHeartbeat(supabase, {
    function_name: 'finnhub-webhook', status: 'success', rows_inserted: rows.length,
    duration_ms: Date.now() - startTime, source_used: 'finnhub',
  });

  supabase.functions.invoke('generate-signals-from-breaking-news', {}).catch((err: any) => {
    console.error('[FINNHUB-WEBHOOK] Signal generation invoke failed:', err);
  });

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
