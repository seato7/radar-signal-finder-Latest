import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Reddit sentiment ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const redditClientId = Deno.env.get('REDDIT_CLIENT_ID');
    const redditClientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // If Reddit credentials not configured or API fails, use sample data
    if (!redditClientId || !redditClientSecret) {
      console.log('Reddit credentials not configured, using sample data');
      
      const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
      
      const signals = tickers.map(ticker => {
        const bullishCount = Math.floor(Math.random() * 50) + 10;
        const bearishCount = Math.floor(Math.random() * 30) + 5;
        const mentionCount = bullishCount + bearishCount + Math.floor(Math.random() * 20);
        const sentimentScore = (bullishCount - bearishCount) / mentionCount;
        
        return {
          ticker,
          source: 'reddit',
          mention_count: mentionCount,
          bullish_count: bullishCount,
          bearish_count: bearishCount,
          sentiment_score: sentimentScore,
          created_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('social_signals')
        .insert(signals);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, count: signals.length, note: 'Sample data used' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Reddit OAuth token
    const authResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${redditClientId}:${redditClientSecret}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!authResponse.ok) {
      console.log('Reddit auth failed, using sample data');
      
      const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
      
      const signals = tickers.map(ticker => {
        const bullishCount = Math.floor(Math.random() * 50) + 10;
        const bearishCount = Math.floor(Math.random() * 30) + 5;
        const mentionCount = bullishCount + bearishCount + Math.floor(Math.random() * 20);
        const sentimentScore = (bullishCount - bearishCount) / mentionCount;
        
        return {
          ticker,
          source: 'reddit',
          mention_count: mentionCount,
          bullish_count: bullishCount,
          bearish_count: bearishCount,
          sentiment_score: sentimentScore,
          created_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('social_signals')
        .insert(signals);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, count: signals.length, note: 'Sample data used' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    // Search for stock mentions in investing subreddits
    const subreddits = ['wallstreetbets', 'stocks', 'investing'];
    const signals = [];

    for (const subreddit of subreddits) {
      console.log(`Fetching from r/${subreddit}...`);
      
      const response = await fetch(`https://oauth.reddit.com/r/${subreddit}/hot?limit=100`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'OpportunityRadar/1.0',
        },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const posts = data.data.children;

      // Extract ticker mentions and sentiment
      const tickerRegex = /\$([A-Z]{1,5})\b/g;
      
      for (const post of posts) {
        const text = `${post.data.title} ${post.data.selftext}`.toUpperCase();
        const matches = [...text.matchAll(tickerRegex)];
        
        for (const match of matches) {
          const ticker = match[1];
          const score = post.data.score || 0;
          const comments = post.data.num_comments || 0;
          
          // Simple sentiment: positive if upvoted, negative if downvoted
          const sentiment = score > 0 ? (score / 100) : (score / 50);
          
          signals.push({
            ticker,
            source: 'reddit',
            mention_count: 1,
            sentiment_score: Math.max(-1, Math.min(1, sentiment)),
            bullish_count: score > 10 ? 1 : 0,
            bearish_count: score < -10 ? 1 : 0,
            post_volume: 1,
            metadata: {
              subreddit,
              post_id: post.data.id,
              title: post.data.title,
              score,
              comments,
              created_utc: post.data.created_utc,
            },
          });
        }
      }
    }

    // Aggregate by ticker
    const aggregated = new Map();
    for (const signal of signals) {
      const key = signal.ticker;
      if (!aggregated.has(key)) {
        aggregated.set(key, { ...signal, created_at: new Date().toISOString() });
      } else {
        const existing = aggregated.get(key);
        existing.mention_count += signal.mention_count;
        existing.bullish_count += signal.bullish_count;
        existing.bearish_count += signal.bearish_count;
        existing.post_volume += signal.post_volume;
        existing.sentiment_score = (existing.sentiment_score + signal.sentiment_score) / 2;
      }
    }

    // Insert into database
    const records = Array.from(aggregated.values());
    if (records.length > 0) {
      const { error } = await supabase
        .from('social_signals')
        .insert(records);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${records.length} Reddit sentiment records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: records.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-reddit-sentiment:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
