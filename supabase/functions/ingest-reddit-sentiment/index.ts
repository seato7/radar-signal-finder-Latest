import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v10 - REAL DATA ONLY - NO ESTIMATIONS
// Uses Reddit OAuth API or Firecrawl - NO fake data generation

interface RedditPost {
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  subreddit: string;
  permalink: string;
  created_utc: number;
}

// Reddit OAuth token cache
let redditAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getRedditAccessToken(): Promise<string | null> {
  if (redditAccessToken && Date.now() < tokenExpiresAt - 300000) {
    return redditAccessToken;
  }

  const clientId = Deno.env.get('REDDIT_CLIENT_ID');
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');
  const username = Deno.env.get('REDDIT_USERNAME');
  const password = Deno.env.get('REDDIT_PASSWORD');

  if (!clientId || !clientSecret || !username || !password) {
    console.log('Reddit API: Missing credentials');
    return null;
  }

  try {
    const auth = btoa(`${clientId}:${clientSecret}`);
    
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SignalFlow/1.0 by SignalFlowApp',
      },
      body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    if (!response.ok) {
      console.error(`Reddit OAuth failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.access_token) {
      redditAccessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in * 1000);
      console.log('Reddit API: Authenticated successfully');
      return redditAccessToken;
    }

    return null;
  } catch (error) {
    console.error('Reddit OAuth error:', error);
    return null;
  }
}

async function fetchSubredditPosts(
  subreddit: string, 
  accessToken: string, 
  sort: 'hot' | 'new' = 'hot',
  limit: number = 50
): Promise<RedditPost[]> {
  try {
    const response = await fetch(
      `https://oauth.reddit.com/r/${subreddit}/${sort}?limit=${limit}&raw_json=1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'SignalFlow/1.0 by SignalFlowApp',
        },
      }
    );

    if (!response.ok) {
      console.log(`Reddit API: Failed to fetch r/${subreddit}/${sort}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const posts: RedditPost[] = [];

    for (const child of data.data?.children || []) {
      const post = child.data;
      posts.push({
        title: post.title || '',
        selftext: post.selftext || '',
        score: post.score || 0,
        num_comments: post.num_comments || 0,
        upvote_ratio: post.upvote_ratio || 0.5,
        subreddit: post.subreddit || subreddit,
        permalink: post.permalink || '',
        created_utc: post.created_utc || 0,
      });
    }

    console.log(`Reddit API: Fetched ${posts.length} posts from r/${subreddit}/${sort}`);
    return posts;
  } catch (error) {
    console.error(`Reddit API error for r/${subreddit}:`, error);
    return [];
  }
}

function analyzeSentiment(text: string, score: number = 1, comments: number = 0): number {
  const lowerText = text.toLowerCase();
  
  const bullishWords = ['buy', 'calls', 'moon', 'rocket', 'bullish', 'long', 'undervalued', 'breakout', 
    'rally', 'growth', 'gain', 'up', 'green', 'pump', 'yolo', 'hold', 'diamond hands', 'squeeze'];
  const bearishWords = ['sell', 'puts', 'short', 'bearish', 'crash', 'dump', 'overvalued', 'drop', 
    'fall', 'down', 'red', 'loss', 'bag', 'dead', 'rug', 'scam', 'avoid', 'bear'];
  
  let bullishScore = 0;
  let bearishScore = 0;
  
  for (const word of bullishWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) bullishScore += matches.length;
  }
  for (const word of bearishWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) bearishScore += matches.length;
  }
  
  const total = bullishScore + bearishScore;
  if (total === 0) return 0;
  
  let sentiment = (bullishScore - bearishScore) / total;
  const engagementWeight = Math.min(1 + Math.log10(Math.max(score, 1) + comments + 1) / 5, 1.5);
  sentiment *= engagementWeight;
  
  return Math.max(-1, Math.min(1, sentiment));
}

function extractTickersFromContent(content: string, validTickers: Set<string>): string[] {
  const found = new Set<string>();
  
  const excludeWords = new Set(['AI', 'CEO', 'CFO', 'IPO', 'ETF', 'DD', 'EPS', 'PE', 'ATH', 'ATL', 
    'EOD', 'PM', 'AM', 'USD', 'EU', 'UK', 'US', 'GDP', 'IMO', 'IMHO', 'TBH', 'FYI', 'PSA', 'OP',
    'ARE', 'THE', 'FOR', 'AND', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT']);
  
  const dollarPattern = /\$([A-Z]{1,5})\b/g;
  let match;
  while ((match = dollarPattern.exec(content)) !== null) {
    const ticker = match[1].toUpperCase();
    if (validTickers.has(ticker) && !excludeWords.has(ticker)) {
      found.add(ticker);
    }
  }
  
  const standalonePattern = /\b([A-Z]{3,5})\b/g;
  while ((match = standalonePattern.exec(content)) !== null) {
    const ticker = match[1].toUpperCase();
    if (validTickers.has(ticker) && !excludeWords.has(ticker) && found.size < 20) {
      found.add(ticker);
    }
  }
  
  return Array.from(found);
}

// Firecrawl fallback
async function searchRedditViaFirecrawl(query: string, firecrawlKey: string): Promise<any[]> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${query} site:reddit.com/r/wallstreetbets OR site:reddit.com/r/stocks`,
        limit: 15,
        tbs: 'qdr:w',
        scrapeOptions: { formats: ['markdown'] },
      }),
    });
    
    if (!response.ok) {
      console.log(`Firecrawl returned ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error(`Firecrawl error:`, error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();
  let supabase: any;
  let sourceUsed = 'none';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v10] Reddit sentiment ingestion - REAL DATA ONLY, NO ESTIMATIONS');
    
    // Load valid tickers
    const allValidTickers = new Set<string>();
    let offset = 0;
    const batchSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('assets')
        .select('ticker')
        .range(offset, offset + batchSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      for (const asset of data) {
        allValidTickers.add(asset.ticker.toUpperCase());
      }
      
      if (data.length < batchSize) break;
      offset += batchSize;
    }
    console.log(`Loaded ${allValidTickers.size} valid tickers`);
    
    const signals: any[] = [];
    let skippedCount = 0;
    const tickerData: Map<string, { 
      mentions: number; 
      bullish: number; 
      bearish: number; 
      totalSentiment: number;
      totalScore: number;
      totalComments: number;
      samplePosts: { title: string; score: number; subreddit: string }[];
      subreddits: Set<string>;
    }> = new Map();

    // Try Reddit OAuth API first
    const accessToken = await getRedditAccessToken();
    
    if (accessToken) {
      sourceUsed = 'Reddit_API';
      console.log('Using Reddit OAuth API');
      
      const subreddits = ['wallstreetbets', 'stocks', 'investing', 'options'];
      const allPosts: RedditPost[] = [];
      
      for (const subreddit of subreddits) {
        const hotPosts = await fetchSubredditPosts(subreddit, accessToken, 'hot', 50);
        allPosts.push(...hotPosts);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const newPosts = await fetchSubredditPosts(subreddit, accessToken, 'new', 50);
        allPosts.push(...newPosts);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`Reddit API: Total posts fetched: ${allPosts.length}`);
      
      for (const post of allPosts) {
        const content = `${post.title} ${post.selftext}`;
        const tickers = extractTickersFromContent(content, allValidTickers);
        
        if (tickers.length === 0) {
          skippedCount++;
          continue;
        }
        
        const sentiment = analyzeSentiment(content, post.score, post.num_comments);
        
        for (const ticker of tickers) {
          const existing = tickerData.get(ticker) || {
            mentions: 0, bullish: 0, bearish: 0, totalSentiment: 0,
            totalScore: 0, totalComments: 0, samplePosts: [], subreddits: new Set(),
          };
          
          existing.mentions++;
          existing.totalSentiment += sentiment;
          existing.totalScore += post.score;
          existing.totalComments += post.num_comments;
          existing.subreddits.add(post.subreddit);
          
          if (sentiment > 0.1) existing.bullish++;
          else if (sentiment < -0.1) existing.bearish++;
          
          if (existing.samplePosts.length < 3) {
            existing.samplePosts.push({
              title: post.title.substring(0, 100),
              score: post.score,
              subreddit: post.subreddit,
            });
          }
          
          tickerData.set(ticker, existing);
        }
      }
      
    } else if (firecrawlKey) {
      // Firecrawl fallback - still real data, just different source
      sourceUsed = 'Firecrawl_Reddit';
      console.log('Using Firecrawl Reddit fallback');
      
      const priorityTickers = ['GME', 'AMC', 'TSLA', 'NVDA', 'AMD', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN'];
      
      for (const ticker of priorityTickers) {
        const results = await searchRedditViaFirecrawl(`$${ticker} stock`, firecrawlKey);
        
        if (results.length === 0) {
          skippedCount++;
          continue;
        }
        
        let totalSentiment = 0;
        let bullishCount = 0;
        let bearishCount = 0;
        const samplePosts: any[] = [];
        
        for (const result of results) {
          const text = `${result.title || ''} ${result.description || ''} ${result.markdown || ''}`;
          const sentiment = analyzeSentiment(text);
          totalSentiment += sentiment;
          
          if (sentiment > 0.1) bullishCount++;
          else if (sentiment < -0.1) bearishCount++;
          
          if (result.title && samplePosts.length < 3) {
            samplePosts.push({ title: result.title.substring(0, 100), score: 0, subreddit: 'reddit' });
          }
        }
        
        tickerData.set(ticker, {
          mentions: results.length,
          bullish: bullishCount,
          bearish: bearishCount,
          totalSentiment,
          totalScore: 0,
          totalComments: 0,
          samplePosts,
          subreddits: new Set(['wallstreetbets', 'stocks']),
        });
        
        console.log(`✅ ${ticker}: ${results.length} results via Firecrawl`);
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    } else {
      // No API available - return no data, DO NOT generate fake data
      console.log('❌ No Reddit API or Firecrawl available - NOT inserting any fake data');
      
      await logHeartbeat(supabase, {
        function_name: 'ingest-reddit-sentiment',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'none',
        metadata: { version: 'v10_no_estimation', reason: 'no_api_available' }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-reddit-sentiment', {
        sourcesAttempted: ['Reddit OAuth API', 'Firecrawl'],
        reason: 'No Reddit API credentials or Firecrawl API key available'
      });
      
      return new Response(JSON.stringify({
        success: true,
        inserted: 0,
        message: 'No API available - no fake data inserted',
        version: 'v10_no_estimation'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Convert to signals - REAL DATA ONLY
    for (const [ticker, data] of tickerData) {
      const avgSentiment = data.mentions > 0 ? data.totalSentiment / data.mentions : 0;
      
      signals.push({
        ticker: ticker.substring(0, 10),
        source: 'reddit',
        mention_count: data.mentions,
        bullish_count: data.bullish,
        bearish_count: data.bearish,
        sentiment_score: Math.max(-1, Math.min(1, avgSentiment)),
        post_volume: data.mentions,
        metadata: {
          data_source: sourceUsed,
          data_type: 'real',
          fetched_at: new Date().toISOString(),
          sample_posts: data.samplePosts,
          subreddits: Array.from(data.subreddits),
          version: 'v10_no_estimation',
        },
        created_at: new Date().toISOString(),
      });
    }

    console.log(`Total REAL signals: ${signals.length}`);

    if (signals.length === 0) {
      console.log('❌ No ticker mentions found - NOT inserting any fake data');
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-reddit-sentiment', {
        sourcesAttempted: [sourceUsed],
        reason: 'No ticker mentions found in Reddit posts'
      });
    }

    // Insert REAL signals only
    let rowsInserted = 0;
    if (signals.length > 0) {
      const insertBatchSize = 100;
      for (let i = 0; i < signals.length; i += insertBatchSize) {
        const batch = signals.slice(i, i + insertBatchSize);
        const { error } = await supabase.from('social_signals').upsert(batch, { onConflict: 'ticker,source,signal_date', ignoreDuplicates: true });
        if (error) {
          console.error('Insert error:', error.message);
        } else {
          rowsInserted += batch.length;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-reddit-sentiment',
      status: 'success',
      rows_inserted: rowsInserted,
      rows_skipped: skippedCount,
      duration_ms: durationMs,
      source_used: sourceUsed,
      metadata: { version: 'v10_no_estimation' }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-reddit-sentiment',
      status: 'success',
      rowsInserted,
      rowsSkipped: skippedCount,
      sourceUsed: `${sourceUsed} (REAL DATA ONLY)`,
      duration: durationMs,
    });

    console.log(`✅ Inserted ${rowsInserted} REAL Reddit sentiment records - NO ESTIMATIONS`);

    return new Response(JSON.stringify({
      success: true,
      inserted: rowsInserted,
      source: sourceUsed,
      version: 'v10_no_estimation',
      message: `Inserted ${rowsInserted} REAL Reddit sentiment records`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Fatal error:', error);
    
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-reddit-sentiment',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: sourceUsed,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-reddit-sentiment',
      message: `Reddit sentiment ingestion failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    });

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
