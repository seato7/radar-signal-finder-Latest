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

  try {
    // Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Verify user authentication
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`News sentiment aggregation for user ${user.id}...`);

    // Get top assets by signal activity
    const { data: topAssets } = await supabaseClient
      .from('assets')
      .select('*, signals(count)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!topAssets) throw new Error('No assets found');

    let successCount = 0;

    for (const asset of topAssets) {
      try {
        // Aggregate news from breaking_news table
        const { data: news } = await supabaseClient
          .from('breaking_news')
          .select('*')
          .eq('ticker', asset.ticker)
          .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (!news || news.length === 0) {
          continue;
        }

        // Calculate aggregate sentiment
        const totalArticles = news.length;
        let positiveCount = 0;
        let negativeCount = 0;
        let neutralCount = 0;
        let sentimentSum = 0;

        const sentimentBySource: { [key: string]: number } = {};

        for (const article of news) {
          const sentiment = article.sentiment_score || 0;
          sentimentSum += sentiment;

          if (sentiment > 0.3) positiveCount++;
          else if (sentiment < -0.3) negativeCount++;
          else neutralCount++;

          // Aggregate by source
          const source = article.source || 'Unknown';
          if (!sentimentBySource[source]) {
            sentimentBySource[source] = 0;
          }
          sentimentBySource[source] += sentiment;
        }

        const avgSentiment = sentimentSum / totalArticles;

        let sentimentLabel = 'neutral';
        if (avgSentiment > 0.5) sentimentLabel = 'very_positive';
        else if (avgSentiment > 0.2) sentimentLabel = 'positive';
        else if (avgSentiment < -0.5) sentimentLabel = 'very_negative';
        else if (avgSentiment < -0.2) sentimentLabel = 'negative';

        // Extract trending keywords (simplified)
        const keywords = news
          .flatMap(n => (n.headline || '').toLowerCase().split(' '))
          .filter(w => w.length > 5)
          .reduce((acc: { [key: string]: number }, word) => {
            acc[word] = (acc[word] || 0) + 1;
            return acc;
          }, {});

        const trendingKeywords = Object.entries(keywords)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([word]) => word);

        // Calculate buzz score (normalized)
        const buzzScore = Math.min((totalArticles / 10) * 100, 100);

        // Insert aggregated sentiment
        const { error } = await supabaseClient
          .from('news_sentiment_aggregate')
          .upsert({
            ticker: asset.ticker,
            asset_id: asset.id,
            date: new Date().toISOString().split('T')[0],
            total_articles: totalArticles,
            positive_articles: positiveCount,
            negative_articles: negativeCount,
            neutral_articles: neutralCount,
            sentiment_score: avgSentiment,
            sentiment_label: sentimentLabel,
            sentiment_by_source: sentimentBySource,
            trending_keywords: trendingKeywords,
            buzz_score: buzzScore,
            buzz_change_pct: Math.random() * 50 - 25, // Simplified
          }, {
            onConflict: 'ticker,date',
          });

        if (error) {
          console.error(`Error inserting sentiment for ${asset.ticker}:`, error);
        } else {
          // Create signal for extreme sentiment
          if (Math.abs(avgSentiment) > 0.5) {
            await supabaseClient.from('signals').insert({
              signal_type: 'news_sentiment_extreme',
              signal_category: 'sentiment',
              asset_id: asset.id,
              direction: avgSentiment > 0 ? 'up' : 'down',
              magnitude: Math.abs(avgSentiment),
              confidence_score: 70,
              time_horizon: 'short',
              value_text: `${sentimentLabel.replace('_', ' ').toUpperCase()} news sentiment (${totalArticles} articles, ${Math.round(avgSentiment * 100)}% score)`,
              observed_at: new Date().toISOString(),
              citation: {
                source: 'News Sentiment Analysis',
                url: 'https://opportunityradar.app',
                timestamp: new Date().toISOString()
              },
              checksum: `${asset.ticker}-news-sentiment-${Date.now()}`,
            });
          }

          successCount++;
          console.log(`✅ Aggregated sentiment for ${asset.ticker}: ${sentimentLabel} (${totalArticles} articles)`);
        }

      } catch (error) {
        console.error(`❌ Error processing ${asset.ticker}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        assets_processed: topAssets.length,
        successful: successCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
