import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('[INGEST-FINNHUB-NEWS] Polling Finnhub general + forex news...');

    // Fetch both categories in parallel
    const [generalRes, forexRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`),
      fetch(`https://finnhub.io/api/v1/news?category=forex&token=${FINNHUB_API_KEY}`),
    ]);

    const [generalNews, forexNews] = await Promise.all([
      generalRes.ok ? generalRes.json() : [],
      forexRes.ok ? forexRes.json() : [],
    ]);

    const allNews: any[] = [...(generalNews || []), ...(forexNews || [])];
    console.log(`[INGEST-FINNHUB-NEWS] Fetched ${allNews.length} total articles`);

    // Only keep articles from the last 35 minutes (avoids re-processing on 30-min cron)
    const cutoff = Date.now() - 35 * 60 * 1000;
    const recentNews = allNews.filter(
      (item) => item.datetime && item.datetime * 1000 >= cutoff
    );
    console.log(`[INGEST-FINNHUB-NEWS] ${recentNews.length} articles within last 35 minutes`);

    if (!recentNews.length) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-finnhub-news',
        status: 'success',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'finnhub',
      });
      return new Response(
        JSON.stringify({ success: true, inserted: 0, reason: 'no_recent_news' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch top 200 most-scored assets for ticker matching
    const { data: assets } = await supabase
      .from('assets')
      .select('id, ticker')
      .order('computed_score', { ascending: false })
      .limit(200);

    const assetList: { id: string; ticker: string }[] = assets || [];

    // Match tickers appearing in headline or summary (word-boundary match)
    const rows: any[] = [];
    for (const item of recentNews) {
      const text = `${item.headline || ''} ${item.summary || ''}`.toUpperCase();

      const matched = assetList.filter((a) => {
        const re = new RegExp(`(?<![A-Z0-9])${a.ticker}(?![A-Z0-9])`);
        return re.test(text);
      });

      if (!matched.length) continue;

      for (const asset of matched) {
        rows.push({
          ticker: asset.ticker,
          asset_id: asset.id,
          headline: item.headline,
          summary: item.summary || null,
          source: item.source || 'Finnhub',
          url: item.url || null,
          published_at: new Date(item.datetime * 1000).toISOString(),
          relevance_score: 0.75,
          metadata: {
            category: item.category,
            image: item.image || null,
            finnhub_id: item.id,
          },
        });
      }
    }

    console.log(`[INGEST-FINNHUB-NEWS] ${rows.length} rows matched to assets`);

    if (!rows.length) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-finnhub-news',
        status: 'success',
        rows_inserted: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'finnhub',
      });
      return new Response(
        JSON.stringify({ success: true, inserted: 0, reason: 'no_ticker_matches' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: upsertError } = await supabase
      .from('breaking_news')
      .upsert(rows, { onConflict: 'url,ticker', ignoreDuplicates: true });

    if (upsertError) throw upsertError;

    console.log(`[INGEST-FINNHUB-NEWS] ✅ Upserted ${rows.length} articles`);

    const duration = Date.now() - startTime;

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-news',
      status: 'success',
      rows_inserted: rows.length,
      duration_ms: duration,
      source_used: 'finnhub',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-finnhub-news',
      status: 'success',
      rowsInserted: rows.length,
      rowsSkipped: 0,
      sourceUsed: 'finnhub',
      duration,
      latencyMs: duration,
    });

    // Fire and forget — generate signals from newly ingested news
    supabase.functions.invoke('generate-signals-from-breaking-news', {}).catch((err: any) => {
      console.error('[INGEST-FINNHUB-NEWS] Signal generation invoke failed:', err);
    });

    return new Response(
      JSON.stringify({ success: true, inserted: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[INGEST-FINNHUB-NEWS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : (typeof error === 'object' ? JSON.stringify(error) : String(error));

    await logHeartbeat(supabase, {
      function_name: 'ingest-finnhub-news',
      status: 'failure',
      duration_ms: duration,
      source_used: 'finnhub',
      error_message: errMsg,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-finnhub-news',
      message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
