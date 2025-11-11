import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Log to ingest_logs
  const logId = crypto.randomUUID();
  await supabase.from('ingest_logs').insert({
    id: logId,
    etl_name: 'ingest-news-sentiment',
    status: 'running',
    started_at: new Date().toISOString(),
    source_used: 'Aggregation',
  });

  try {
    console.log('News sentiment aggregation started...');

    const { data: news } = await supabase
      .from('breaking_news')
      .select('*')
      .gte('published_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('published_at', { ascending: false });

    if (!news || news.length === 0) {
      console.log('No recent news found');
      await supabase.from('ingest_logs').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        rows_inserted: 0,
        source_used: 'Aggregation',
      }).eq('id', logId);
      return new Response(
        JSON.stringify({ success: true, aggregated: 0, note: 'No recent news' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aggregates: { [key: string]: any } = {};

    for (const item of news) {
      const dateKey = new Date(item.published_at).toISOString().split('T')[0];
      const key = `${item.ticker}-${dateKey}`;

      if (!aggregates[key]) {
        aggregates[key] = {
          ticker: item.ticker,
          date: dateKey,
          total_articles: 0,
          positive_articles: 0,
          negative_articles: 0,
          neutral_articles: 0,
          sentiment_scores: [],
          sources: new Set(),
          keywords: new Set(),
        };
      }

      aggregates[key].total_articles++;
      aggregates[key].sentiment_scores.push(item.sentiment_score);
      
      if (item.sentiment_score > 0.3) aggregates[key].positive_articles++;
      else if (item.sentiment_score < -0.3) aggregates[key].negative_articles++;
      else aggregates[key].neutral_articles++;

      if (item.source) aggregates[key].sources.add(item.source);
      
      const words = item.headline.toLowerCase().split(' ');
      words.forEach((w: string) => {
        if (w.length > 5) aggregates[key].keywords.add(w);
      });
    }

    const insertData = Object.values(aggregates).map(agg => {
      const avgSentiment = agg.sentiment_scores.reduce((a: number, b: number) => a + b, 0) / agg.sentiment_scores.length;
      
      let sentimentLabel = 'neutral';
      if (avgSentiment > 0.6) sentimentLabel = 'very_positive';
      else if (avgSentiment > 0.2) sentimentLabel = 'positive';
      else if (avgSentiment < -0.6) sentimentLabel = 'very_negative';
      else if (avgSentiment < -0.2) sentimentLabel = 'negative';

      return {
        ticker: agg.ticker,
        date: agg.date,
        total_articles: agg.total_articles,
        positive_articles: agg.positive_articles,
        negative_articles: agg.negative_articles,
        neutral_articles: agg.neutral_articles,
        sentiment_score: avgSentiment,
        sentiment_label: sentimentLabel,
        trending_keywords: Array.from(agg.keywords).slice(0, 10),
        buzz_score: Math.min(agg.total_articles / 5, 1.0),
        buzz_change_pct: 0,
        metadata: {
          sources: Array.from(agg.sources),
        },
      };
    });

    const { error } = await supabase
      .from('news_sentiment_aggregate')
      .upsert(insertData, {
        onConflict: 'ticker,date',
      });

    if (error) throw error;

    console.log(`✅ Aggregated ${insertData.length} sentiment records`);

    await supabase.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      rows_inserted: insertData.length,
      source_used: 'Aggregation',
    }).eq('id', logId);

    return new Response(
      JSON.stringify({
        success: true,
        aggregated: insertData.length,
        news_items_processed: news.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    await supabase.from('ingest_logs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      error_message: error instanceof Error ? error.message : 'Unknown error',
    }).eq('id', logId);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
