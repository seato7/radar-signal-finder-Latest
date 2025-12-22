import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v9 - Reddit OAuth API with Firecrawl fallback

interface RedditPost {
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  subreddit: string;
  permalink: string;
  created_utc: number;
  link_flair_text?: string;
}

interface FirecrawlResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// Reddit OAuth token cache
let redditAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

// Authenticate with Reddit OAuth using password grant
async function getRedditAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 5 min buffer)
  if (redditAccessToken && Date.now() < tokenExpiresAt - 300000) {
    return redditAccessToken;
  }

  const clientId = Deno.env.get('REDDIT_CLIENT_ID');
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET');
  const username = Deno.env.get('REDDIT_USERNAME');
  const password = Deno.env.get('REDDIT_PASSWORD');

  if (!clientId || !clientSecret || !username || !password) {
    console.log('Reddit API: Missing credentials, will use fallback');
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
      console.error(`Reddit API: OAuth failed with status ${response.status}`);
      const errorText = await response.text();
      console.error(`Reddit API: OAuth error: ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    if (data.access_token) {
      redditAccessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in * 1000);
      console.log('Reddit API: Authenticated successfully');
      return redditAccessToken;
    }

    console.error('Reddit API: No access token in response');
    return null;
  } catch (error) {
    console.error('Reddit API: OAuth error:', error);
    return null;
  }
}

// Fetch posts from a subreddit using Reddit API
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
        link_flair_text: post.link_flair_text,
      });
    }

    console.log(`Reddit API: Fetched ${posts.length} posts from r/${subreddit}/${sort}`);
    return posts;
  } catch (error) {
    console.error(`Reddit API: Error fetching r/${subreddit}:`, error);
    return [];
  }
}

// Keyword-based sentiment analysis with weighting
function analyzeSentiment(text: string, score: number = 1, comments: number = 0): number {
  const lowerText = text.toLowerCase();
  
  const bullishWords = ['buy', 'calls', 'moon', 'rocket', 'bullish', 'long', 'undervalued', 'breakout', 
    'rally', 'growth', 'gain', 'up', 'green', 'pump', 'yolo', 'hold', 'diamond hands', 'squeeze', 
    'gamma', 'tendies', 'bull', 'rip', 'send', 'print', 'cheap', 'loading', 'accumulate', 'bottomed'];
  const bearishWords = ['sell', 'puts', 'short', 'bearish', 'crash', 'dump', 'overvalued', 'drop', 
    'fall', 'down', 'red', 'loss', 'bag', 'dead', 'rug', 'scam', 'avoid', 'bear', 'fade', 'tank',
    'exit', 'close', 'topped', 'bubble', 'worthless', 'bankrupt'];
  
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
  
  // Weight by engagement (higher score/comments = more weight)
  const engagementWeight = Math.min(1 + Math.log10(Math.max(score, 1) + comments + 1) / 5, 1.5);
  sentiment *= engagementWeight;
  
  return Math.max(-1, Math.min(1, sentiment));
}

// Extract tickers mentioned in content
function extractTickersFromContent(content: string, validTickers: Set<string>): string[] {
  const found = new Set<string>();
  
  // Common words to exclude that look like tickers
  const excludeWords = new Set(['AI', 'CEO', 'CFO', 'IPO', 'ETF', 'DD', 'EPS', 'PE', 'ATH', 'ATL', 
    'EOD', 'PM', 'AM', 'USD', 'EU', 'UK', 'US', 'GDP', 'IMO', 'IMHO', 'TBH', 'FYI', 'PSA', 'OP',
    'ARE', 'THE', 'FOR', 'AND', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT',
    'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY',
    'DID', 'GET', 'HIM', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE']);
  
  // Pattern 1: $TICKER format (most reliable)
  const dollarPattern = /\$([A-Z]{1,5})\b/g;
  let match;
  while ((match = dollarPattern.exec(content)) !== null) {
    const ticker = match[1].toUpperCase();
    if (validTickers.has(ticker) && !excludeWords.has(ticker)) {
      found.add(ticker);
    }
  }
  
  // Pattern 2: Standalone tickers (only if 3-5 chars to reduce false positives)
  const standalonePattern = /\b([A-Z]{3,5})\b/g;
  while ((match = standalonePattern.exec(content)) !== null) {
    const ticker = match[1].toUpperCase();
    if (validTickers.has(ticker) && !excludeWords.has(ticker) && found.size < 20) {
      found.add(ticker);
    }
  }
  
  return Array.from(found);
}

// Firecrawl fallback search
async function searchRedditViaFirecrawl(query: string, firecrawlKey: string): Promise<FirecrawlResult[]> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${query} site:reddit.com/r/wallstreetbets OR site:reddit.com/r/stocks OR site:reddit.com/r/investing OR site:reddit.com/r/options`,
        limit: 15,
        tbs: 'qdr:w',
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });
    
    if (!response.ok) {
      console.log(`Firecrawl returned ${response.status} for query: ${query}`);
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
    
  } catch (error) {
    console.error(`Firecrawl error for query ${query}:`, error);
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
  let sourceUsed = 'unknown';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v9] Starting Reddit sentiment ingestion with REDDIT OAUTH API');
    
    // Load ALL valid tickers from database for validation
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
    console.log(`Loaded ${allValidTickers.size} valid tickers from database`);
    
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
      sourceUsed = 'Reddit API';
      console.log('\n--- Using Reddit OAuth API (Primary) ---');
      
      const subreddits = ['wallstreetbets', 'stocks', 'investing', 'options'];
      const allPosts: RedditPost[] = [];
      
      // Fetch posts from all subreddits
      for (const subreddit of subreddits) {
        // Fetch hot posts
        const hotPosts = await fetchSubredditPosts(subreddit, accessToken, 'hot', 50);
        allPosts.push(...hotPosts);
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Fetch new posts
        const newPosts = await fetchSubredditPosts(subreddit, accessToken, 'new', 50);
        allPosts.push(...newPosts);
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`Reddit API: Total posts fetched: ${allPosts.length}`);
      
      // Process all posts and extract ticker mentions
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
            mentions: 0,
            bullish: 0,
            bearish: 0,
            totalSentiment: 0,
            totalScore: 0,
            totalComments: 0,
            samplePosts: [],
            subreddits: new Set(),
          };
          
          existing.mentions++;
          existing.totalSentiment += sentiment;
          existing.totalScore += post.score;
          existing.totalComments += post.num_comments;
          existing.subreddits.add(post.subreddit);
          
          if (sentiment > 0.1) existing.bullish++;
          else if (sentiment < -0.1) existing.bearish++;
          
          // Keep top 3 posts by score
          if (existing.samplePosts.length < 3) {
            existing.samplePosts.push({
              title: post.title.substring(0, 100),
              score: post.score,
              subreddit: post.subreddit,
            });
          } else if (post.score > Math.min(...existing.samplePosts.map(p => p.score))) {
            existing.samplePosts.sort((a, b) => b.score - a.score);
            existing.samplePosts[2] = {
              title: post.title.substring(0, 100),
              score: post.score,
              subreddit: post.subreddit,
            };
          }
          
          tickerData.set(ticker, existing);
        }
      }
      
    } else if (firecrawlKey) {
      // Fallback to Firecrawl
      sourceUsed = 'Firecrawl Reddit Fallback';
      console.log('\n--- Using Firecrawl Fallback (Reddit API unavailable) ---');
      
      // Get priority tickers to search
      const priorityTickers = ['GME', 'AMC', 'TSLA', 'NVDA', 'AMD', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 
                               'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO', 'COIN', 'HOOD', 'SPY', 'QQQ', 'INTC'];
      
      for (const ticker of priorityTickers) {
        const results = await searchRedditViaFirecrawl(`$${ticker} stock`, firecrawlKey);
        
        if (results.length === 0) {
          skippedCount++;
          continue;
        }
        
        let totalSentiment = 0;
        let bullishCount = 0;
        let bearishCount = 0;
        const samplePosts: { title: string; score: number; subreddit: string }[] = [];
        
        for (const result of results) {
          const text = `${result.title || ''} ${result.description || ''} ${result.markdown || ''}`;
          const sentiment = analyzeSentiment(text);
          totalSentiment += sentiment;
          
          if (sentiment > 0.1) bullishCount++;
          else if (sentiment < -0.1) bearishCount++;
          
          if (result.title && samplePosts.length < 3) {
            samplePosts.push({
              title: result.title.substring(0, 100),
              score: 0, // Firecrawl doesn't provide scores
              subreddit: 'reddit',
            });
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
          subreddits: new Set(['wallstreetbets', 'stocks', 'investing']),
        });
        
        console.log(`✅ ${ticker}: ${results.length} results via Firecrawl`);
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    } else {
      throw new Error('No Reddit API credentials or Firecrawl API key available');
    }

    // Convert aggregated data to signals
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
          data_source: sourceUsed === 'Reddit API' ? 'reddit_api' : 'firecrawl_fallback',
          fetched_at: new Date().toISOString(),
          sample_posts: data.samplePosts,
          subreddits: Array.from(data.subreddits),
          avg_post_score: data.mentions > 0 ? Math.round(data.totalScore / data.mentions) : 0,
          avg_comments: data.mentions > 0 ? Math.round(data.totalComments / data.mentions) : 0,
          version: 'v9_reddit_oauth',
        },
        created_at: new Date().toISOString(),
      });
    }

    console.log(`\n=== REDDIT SENTIMENT SUMMARY ===`);
    console.log(`Source used: ${sourceUsed}`);
    console.log(`Total signals with REAL data: ${signals.length}`);
    console.log(`Unique tickers: ${tickerData.size}`);
    console.log(`Posts without tickers: ${skippedCount}`);

    if (signals.length === 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-reddit-sentiment', {
        sourcesAttempted: [sourceUsed],
        reason: `No ticker mentions found in Reddit posts`
      });
    }

    // Insert signals in batches
    let rowsInserted = 0;
    if (signals.length > 0) {
      const insertBatchSize = 100;
      for (let i = 0; i < signals.length; i += insertBatchSize) {
        const batch = signals.slice(i, i + insertBatchSize);
        const { error } = await supabase.from('social_signals').insert(batch);
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
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-reddit-sentiment',
      status: 'success',
      rowsInserted,
      rowsSkipped: skippedCount,
      sourceUsed,
      duration: durationMs,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        rowsInserted,
        unique_tickers: tickerData.size,
        skipped: skippedCount,
        source: sourceUsed,
        version: 'v9_reddit_oauth',
        sample_tickers: Array.from(tickerData.keys()).slice(0, 10),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-reddit-sentiment:', error);
    
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
      message: `Reddit sentiment ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
