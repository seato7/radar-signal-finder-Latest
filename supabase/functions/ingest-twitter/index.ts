import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createHmac } from "node:crypto";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_KEY = Deno.env.get("TWITTER_CONSUMER_KEY")?.trim();
const API_SECRET = Deno.env.get("TWITTER_CONSUMER_SECRET")?.trim();
const ACCESS_TOKEN = Deno.env.get("TWITTER_ACCESS_TOKEN")?.trim();
const ACCESS_TOKEN_SECRET = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET")?.trim();

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const signatureBaseString = `${method}&${encodeURIComponent(
    url
  )}&${encodeURIComponent(
    Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join("&")
  )}`;
  const signingKey = `${encodeURIComponent(
    consumerSecret
  )}&${encodeURIComponent(tokenSecret)}`;
  const hmacSha1 = createHmac("sha1", signingKey);
  const signature = hmacSha1.update(signatureBaseString).digest("base64");
  return signature;
}

function generateOAuthHeader(method: string, url: string): string {
  const oauthParams = {
    oauth_consumer_key: API_KEY!,
    oauth_nonce: Math.random().toString(36).substring(2),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN!,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    API_SECRET!,
    ACCESS_TOKEN_SECRET!
  );

  const signedOAuthParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const entries = Object.entries(signedOAuthParams).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    "OAuth " +
    entries
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ")
  );
}

async function searchTweets(query: string) {
  const baseUrl = "https://api.twitter.com/2/tweets/search/recent";
  const params = new URLSearchParams({
    query: query,
    max_results: "100",
    "tweet.fields": "created_at,public_metrics"
  });
  
  const method = "GET";
  const fullUrl = `${baseUrl}?${params.toString()}`;
  
  // Generate OAuth header with base URL only (no query params in signature for GET with query string)
  const oauthHeader = generateOAuthHeader(method, baseUrl);
  
  const response = await fetch(fullUrl, {
    method: method,
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Twitter API error for ${query}:`, response.status, text);
    return null;
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Twitter sentiment ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
    const signals = [];

    for (const ticker of tickers) {
      console.log(`Fetching Twitter data for ${ticker}...`);
      
      try {
        const data = await searchTweets(`$${ticker}`);
        
        if (!data || !data.data) {
          console.log(`No Twitter data for ${ticker}`);
          continue;
        }

        const tweets = data.data;
        let totalSentiment = 0;
        let bullishCount = 0;
        let bearishCount = 0;
        const topTweets = [];

        for (const tweet of tweets) {
          const metrics = tweet.public_metrics || {};
          const engagementScore = (metrics.like_count || 0) + (metrics.retweet_count || 0) * 2;
          
          const text = tweet.text.toLowerCase();
          let sentiment = 0;
          
          if (text.includes('buy') || text.includes('bullish') || text.includes('moon') || text.includes('🚀')) {
            sentiment = 1;
            bullishCount++;
          } else if (text.includes('sell') || text.includes('bearish') || text.includes('short') || text.includes('crash')) {
            sentiment = -1;
            bearishCount++;
          }
          
          totalSentiment += sentiment;
          
          if (topTweets.length < 5) {
            topTweets.push({
              text: tweet.text,
              engagement: engagementScore,
              created_at: tweet.created_at
            });
          }
        }

        const sentimentScore = tweets.length > 0 ? totalSentiment / tweets.length : 0;

        signals.push({
          ticker,
          mention_count: tweets.length,
          sentiment_score: Math.max(-1, Math.min(1, sentimentScore)),
          bullish_count: bullishCount,
          bearish_count: bearishCount,
          tweet_volume: tweets.length,
          top_tweets: topTweets,
          metadata: {
            data_source: 'twitter_api_v2',
          },
          created_at: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`Error processing ${ticker}:`, err);
      }
    }

    if (signals.length > 0) {
      const { error } = await supabase
        .from('twitter_signals')
        .insert(signals);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${signals.length} Twitter signals`);
    }

    return new Response(
      JSON.stringify({ success: true, count: signals.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-twitter:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
