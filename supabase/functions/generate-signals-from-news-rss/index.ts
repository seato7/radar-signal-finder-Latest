import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[SIGNAL-GEN-NEWS-RSS] Starting news RSS signal generation...');

    // Fetch news RSS articles
    const { data: articles, error: articlesError } = await supabaseClient
      .from('news_rss_articles')
      .select('*')
      .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('published_at', { ascending: false })
      .limit(2000);

    if (articlesError) throw articlesError;

    console.log(`[SIGNAL-GEN-NEWS-RSS] Found ${articles?.length || 0} news articles`);

    if (!articles || articles.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabaseClient, {
        function_name: 'generate-signals-from-news-rss',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'news_rss_articles',
      });
      return new Response(JSON.stringify({ message: 'No news articles to process', signals_created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get asset mappings (for articles that have ticker)
    const tickers = [...new Set(articles.filter(a => a.ticker).map(a => a.ticker))];
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Positive/negative keywords for basic sentiment
    const POSITIVE_KEYWORDS = ['surge', 'soar', 'jump', 'rally', 'gain', 'bullish', 'upgrade', 'beat', 'profit', 'growth', 'record', 'breakthrough'];
    const NEGATIVE_KEYWORDS = ['crash', 'plunge', 'drop', 'fall', 'bearish', 'downgrade', 'miss', 'loss', 'decline', 'warning', 'lawsuit', 'scandal'];

    const signals = [];
    for (const article of articles) {
      if (!article.ticker) continue;
      
      const assetId = tickerToAssetId.get(article.ticker);
      if (!assetId) continue;

      // Basic sentiment analysis from title/content
      const text = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
      
      let positiveScore = 0;
      let negativeScore = 0;
      
      for (const keyword of POSITIVE_KEYWORDS) {
        if (text.includes(keyword)) positiveScore++;
      }
      for (const keyword of NEGATIVE_KEYWORDS) {
        if (text.includes(keyword)) negativeScore++;
      }

      const netScore = positiveScore - negativeScore;
      
      // Skip neutral articles
      if (netScore === 0) continue;

      const direction = netScore > 0 ? 'up' : 'down';
      const magnitude = Math.min(4, Math.abs(netScore) * 1.5);

      signals.push({
        asset_id: assetId,
        signal_type: 'news_article',
        direction,
        magnitude,
        observed_at: article.published_at || new Date().toISOString(),
        value_text: article.title?.substring(0, 200) || 'News article',
        checksum: JSON.stringify({ 
          ticker: article.ticker, 
          signal_type: 'news_article', 
          title: article.title?.substring(0, 50),
          published_at: article.published_at 
        }),
        citation: { 
          source: article.source || 'News RSS', 
          url: article.url,
          timestamp: new Date().toISOString() 
        },
        raw: {
          title: article.title,
          summary: article.summary,
          source: article.source,
          positive_keywords: positiveScore,
          negative_keywords: negativeScore,
          net_score: netScore
        }
      });
    }

    // Batch upsert
    let insertedCount = 0;
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      const { data, error: insertError } = await supabaseClient
        .from('signals')
        .upsert(batch, { onConflict: 'checksum', ignoreDuplicates: true })
        .select('id');
      
      if (!insertError) insertedCount += data?.length || 0;
    }

    console.log(`[SIGNAL-GEN-NEWS-RSS] ✅ Created ${insertedCount} news RSS signals (${signals.length - insertedCount} duplicates)`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-news-rss',
      status: 'success',
      rows_inserted: insertedCount,
      rows_skipped: signals.length - insertedCount,
      duration_ms: duration,
      source_used: 'news_rss_articles',
    });

    return new Response(JSON.stringify({ 
      success: true,
      articles_processed: articles.length,
      signals_created: insertedCount,
      duplicates_skipped: signals.length - insertedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[SIGNAL-GEN-NEWS-RSS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    await logHeartbeat(supabaseClient, {
      function_name: 'generate-signals-from-news-rss',
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
