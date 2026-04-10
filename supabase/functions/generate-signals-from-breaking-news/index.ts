import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { fireAiScoring } from '../_shared/fire-ai-scoring.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-BREAKING] Starting breaking news signal generation...');

    // DEBUG: count total rows in breaking_news so we can see if query filtering is the problem
    const { count: totalCount } = await supabaseClient
      .from('breaking_news')
      .select('*', { count: 'exact', head: true });
    console.log(`[SIGNAL-GEN-BREAKING] DEBUG total breaking_news rows: ${totalCount}`);

    // DEBUG: count rows with non-null, non-zero sentiment
    const { count: sentimentCount } = await supabaseClient
      .from('breaking_news')
      .select('*', { count: 'exact', head: true })
      .not('sentiment_score', 'is', null)
      .neq('sentiment_score', 0);
    console.log(`[SIGNAL-GEN-BREAKING] DEBUG rows with non-null non-zero sentiment_score: ${sentimentCount}`);

    // DEBUG: count rows with null sentiment_score
    const { count: nullSentimentCount } = await supabaseClient
      .from('breaking_news')
      .select('*', { count: 'exact', head: true })
      .is('sentiment_score', null);
    console.log(`[SIGNAL-GEN-BREAKING] DEBUG rows with NULL sentiment_score: ${nullSentimentCount}`);

    // DEBUG: count rows with null published_at
    const { count: nullDateCount } = await supabaseClient
      .from('breaking_news')
      .select('*', { count: 'exact', head: true })
      .is('published_at', null);
    console.log(`[SIGNAL-GEN-BREAKING] DEBUG rows with NULL published_at: ${nullDateCount}`);

    // FIX 1: Removed .neq('sentiment_score', 0) from DB query — in PostgreSQL,
    // NULL != 0 evaluates to NULL (falsy), silently excluding all NULL-sentiment rows.
    // We handle sentiment filtering in code instead (null-safe).
    //
    // FIX 2: Include articles with NULL published_at — the RSS ingest stores null
    // when pubDate is missing or unparseable. We still want to process those.
    // Use .or() to include both recent and null-dated articles.
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: news, error: newsError } = await supabaseClient
      .from('breaking_news')
      .select('*')
      .or(`published_at.gte.${cutoffDate},published_at.is.null`)
      .order('published_at', { ascending: false })
      .limit(5000);

    if (newsError) throw newsError;

    const totalNews = news?.length || 0;
    const nullSentiment = news?.filter(n => n.sentiment_score === null).length ?? 0;
    const zeroSentiment = news?.filter(n => n.sentiment_score === 0).length ?? 0;
    const nonZeroSentiment = news?.filter(n => (n.sentiment_score ?? 0) !== 0).length ?? 0;
    const sampleArticles = (news ?? []).slice(0, 3).map(n => ({
      ticker: n.ticker,
      sentiment_score: n.sentiment_score,
      published_at: n.published_at,
    }));

    console.log(`[SIGNAL-GEN-BREAKING] Found ${totalNews} breaking news records (incl. null dates, all sentiments)`);

    if (!news || news.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-breaking-news',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'breaking_news',
        metadata: { totalNews, nullSentiment, zeroSentiment, nonZeroSentiment, sampleArticles },
      });
      return new Response(JSON.stringify({ message: 'No breaking news to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings — exact match first, then normalised fallback for crypto pairs
    const tickers = [...new Set(news.map(n => n.ticker))];
    console.log(`[SIGNAL-GEN-BREAKING] Unique tickers in news (${tickers.length}): ${tickers.join(', ')}`);

    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map<string, string>();
    const assetIdToTicker = new Map<string, string>();

    for (const a of assets ?? []) {
      tickerToAssetId.set(a.ticker, a.id);
      assetIdToTicker.set(a.id, a.ticker);
    }

    // FIX: normalised fallback for tickers not found by exact match
    // e.g. news has 'BTC' but assets stores 'BTC/USD'
    const missingTickers = tickers.filter(t => !tickerToAssetId.has(t));
    if (missingTickers.length > 0) {
      console.log(`[SIGNAL-GEN-BREAKING] ${missingTickers.length} tickers not found by exact match — trying normalised lookup: ${missingTickers.join(', ')}`);

      const expandedVariants: string[] = [];
      for (const t of missingTickers) {
        expandedVariants.push(`${t}/USD`, `${t}USD`, `${t}-USD`, `${t}/BTC`, `${t}BTC`, `${t}/USDT`);
      }
      // Known stock aliases
      if (missingTickers.includes('GOOG')) expandedVariants.push('GOOGL');

      const { data: expandedAssets } = await supabaseClient
        .from('assets')
        .select('id, ticker')
        .in('ticker', expandedVariants);

      for (const missing of missingTickers) {
        const variants = [`${missing}/USD`, `${missing}USD`, `${missing}-USD`, `${missing}/BTC`, `${missing}BTC`, `${missing}/USDT`];
        if (missing === 'GOOG') variants.push('GOOGL');

        for (const variant of variants) {
          const found = (expandedAssets ?? []).find(a => a.ticker === variant);
          if (found) {
            tickerToAssetId.set(missing, found.id);
            if (!assetIdToTicker.has(found.id)) assetIdToTicker.set(found.id, found.ticker);
            console.log(`[SIGNAL-GEN-BREAKING] Normalised: ${missing} → ${found.ticker} (id: ${found.id})`);
            break;
          }
        }
      }
    }

    const stillMissing = tickers.filter(t => !tickerToAssetId.has(t));
    if (stillMissing.length > 0) {
      console.log(`[SIGNAL-GEN-BREAKING] ⚠ ${stillMissing.length} tickers still not in assets after normalisation: ${stillMissing.join(', ')}`);
    }
    console.log(`[SIGNAL-GEN-BREAKING] Asset map: ${tickerToAssetId.size}/${tickers.length} tickers resolved`);

    // --- Filter chain with per-step counters ---
    const signals = [];
    let skippedNoAsset = 0;
    let skippedNeutral = 0;
    let skippedLowMagnitude = 0;

    for (const item of news) {
      // Filter 1: asset lookup
      const assetId = tickerToAssetId.get(item.ticker);
      if (!assetId) {
        skippedNoAsset++;
        continue;
      }

      const sentimentScore = item.sentiment_score ?? 0;
      const relevanceScore = item.relevance_score || 0.5;

      // Filter 2: skip neutral news with low relevance
      if (Math.abs(sentimentScore) < 0.05 && relevanceScore < 0.2) {
        skippedNeutral++;
        continue;
      }

      let direction = 'neutral';
      if (sentimentScore > 0.1) direction = 'up';
      else if (sentimentScore < -0.1) direction = 'down';

      // Filter 3: skip neutral direction
      if (direction === 'neutral') {
        skippedNeutral++;
        continue;
      }

      // Filter 4: magnitude threshold
      const magnitude = Math.min(5, Math.abs(sentimentScore) * 5 * relevanceScore);
      if (magnitude < 0.1) {
        skippedLowMagnitude++;
        continue;
      }

      const signalType = direction === 'up' ? 'breaking_news_bullish' :
                         direction === 'down' ? 'breaking_news_bearish' : 'breaking_news';

      // FIX: checksum uses full published_at timestamp + URL so each unique article
      // gets a unique checksum — prevents same-day articles being blocked as duplicates
      // on every hourly run after the first
      signals.push({
        asset_id: assetId,
        signal_type: signalType,
        direction,
        magnitude,
        observed_at: item.published_at || new Date().toISOString(),
        value_text: item.headline?.substring(0, 200) || 'Breaking news',
        checksum: JSON.stringify({
          ticker: item.ticker,
          signal_type: signalType,
          url: item.url ?? item.headline?.substring(0, 30),
          published_at: item.published_at,
        }),
        citation: {
          source: item.source || 'Breaking News',
          url: item.url,
          timestamp: new Date().toISOString()
        },
        raw: {
          headline: item.headline,
          summary: item.summary,
          sentiment_score: sentimentScore,
          relevance_score: relevanceScore,
          source: item.source
        }
      });
    }

    console.log(`[SIGNAL-GEN-BREAKING] Filter results — no asset: ${skippedNoAsset}, neutral/low relevance: ${skippedNeutral}, low magnitude: ${skippedLowMagnitude}, passed all filters: ${signals.length}`);

    // Batch upsert
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');

      if (insertError) {
        console.error('Signal insert error:', insertError.message, insertError.details);
      } else {
        insertedCount += data?.length || 0;
      }
    }

    const checksumBlocked = signals.length - insertedCount;
    console.log(`[SIGNAL-GEN-BREAKING] ✅ Created ${insertedCount} breaking news signals (${checksumBlocked} duplicates)`);

    if (insertedCount > 0) {
      const affectedTickers = [...new Set(
        signals.map((s: any) => assetIdToTicker.get(s.asset_id)).filter((t): t is string => Boolean(t))
      )];
      fireAiScoring(affectedTickers);
    }

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-breaking-news',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: checksumBlocked,
      duration_ms: duration,
      source_used: 'breaking_news',
      metadata: {
        totalNews,
        nullSentiment,
        zeroSentiment,
        nonZeroSentiment,
        noAssetMatch: skippedNoAsset,
        neutralSkipped: skippedNeutral,
        lowMagnitude: skippedLowMagnitude,
        checksumBlocked,
        inserted: insertedCount,
        sampleArticles,
      },
    });

    return new Response(JSON.stringify({ 
      success: true,
      news_processed: news.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-BREAKING] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-breaking-news',
      status: 'failure',
      duration_ms: duration,
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
