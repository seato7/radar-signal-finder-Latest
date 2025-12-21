import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v8 - Dynamic ticker loading from database + sector-based discovery

interface FirecrawlResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// Keyword-based sentiment analysis
function analyzeSentiment(text: string): number {
  const lowerText = text.toLowerCase();
  
  const bullishWords = ['buy', 'calls', 'moon', 'rocket', 'bullish', 'long', 'undervalued', 'breakout', 'rally', 'growth', 'gain', 'up', 'green', 'pump', 'yolo', 'hold', 'diamond hands', 'squeeze', 'gamma', 'tendies', 'bull', 'rip', 'send', 'print'];
  const bearishWords = ['sell', 'puts', 'short', 'bearish', 'crash', 'dump', 'overvalued', 'drop', 'fall', 'down', 'red', 'loss', 'bag', 'dead', 'rug', 'scam', 'avoid', 'bear', 'fade', 'tank'];
  
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
  
  return (bullishScore - bearishScore) / total;
}

// Extract tickers mentioned in content
function extractTickersFromContent(content: string, validTickers: Set<string>): string[] {
  const found = new Set<string>();
  const patterns = [
    /\$([A-Z]{1,5})\b/g,
    /\b([A-Z]{2,5})\b/g,
  ];
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = content.matchAll(regex);
    for (const match of matches) {
      const ticker = match[1].toUpperCase();
      if (validTickers.has(ticker) && ticker.length >= 2) {
        found.add(ticker);
      }
    }
  }
  
  return Array.from(found);
}

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v8] Starting Reddit sentiment ingestion with DYNAMIC TICKER LOADING');
    
    if (!firecrawlKey) {
      throw new Error('FIRECRAWL_API_KEY required for Reddit sentiment ingestion');
    }
    
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
    
    // Get top tickers from multiple sources:
    // 1. User watchlists
    // 2. Most traded (from dark pool activity)
    // 3. Recent signal activity
    // 4. Always-popular tickers
    
    const tickersToProcess = new Set<string>();
    
    // Always include popular meme/social stocks
    const alwaysInclude = ['GME', 'AMC', 'TSLA', 'NVDA', 'AMD', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 
                           'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO', 'COIN', 'HOOD', 'MARA', 'RIOT',
                           'SPY', 'QQQ', 'IWM', 'INTC', 'BA', 'DIS', 'NFLX', 'PYPL', 'SQ'];
    for (const t of alwaysInclude) {
      if (allValidTickers.has(t)) tickersToProcess.add(t);
    }
    
    // Get tickers from user watchlists
    const { data: watchlistItems } = await supabase
      .from('watchlist')
      .select('ticker')
      .limit(100);
    
    if (watchlistItems) {
      for (const item of watchlistItems) {
        if (allValidTickers.has(item.ticker)) tickersToProcess.add(item.ticker);
      }
    }
    
    // Get tickers with recent signals
    const { data: recentSignals } = await supabase
      .from('signals')
      .select('ticker')
      .gte('observed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(200);
    
    if (recentSignals) {
      for (const signal of recentSignals) {
        if (allValidTickers.has(signal.ticker)) tickersToProcess.add(signal.ticker);
      }
    }
    
    // Limit to 150 tickers max per run to stay within rate limits
    const tickerList = Array.from(tickersToProcess).slice(0, 150);
    console.log(`Processing ${tickerList.length} tickers for Reddit sentiment`);
    
    const signals: any[] = [];
    let skippedCount = 0;
    const processedTickers = new Set<string>();
    
    // Strategy 1: Search for specific high-priority tickers
    const priorityTickers = tickerList.slice(0, 50);
    console.log(`\n--- Strategy 1: Direct ticker search (${priorityTickers.length} tickers) ---`);
    
    for (const ticker of priorityTickers) {
      const results = await searchRedditViaFirecrawl(`$${ticker} stock`, firecrawlKey);
      
      if (results.length === 0) {
        skippedCount++;
        continue;
      }
      
      let totalSentiment = 0;
      let bullishCount = 0;
      let bearishCount = 0;
      const urls: string[] = [];
      
      for (const result of results) {
        const text = `${result.title || ''} ${result.description || ''} ${result.markdown || ''}`;
        const sentiment = analyzeSentiment(text);
        totalSentiment += sentiment;
        
        if (sentiment > 0.1) bullishCount++;
        else if (sentiment < -0.1) bearishCount++;
        
        if (result.url) urls.push(result.url);
      }
      
      const avgSentiment = totalSentiment / results.length;
      
      signals.push({
        ticker: ticker.substring(0, 10),
        source: 'reddit',
        mention_count: results.length,
        bullish_count: bullishCount,
        bearish_count: bearishCount,
        sentiment_score: Math.max(-1, Math.min(1, avgSentiment)),
        post_volume: results.length,
        metadata: {
          data_source: 'firecrawl_reddit_search',
          fetched_at: new Date().toISOString(),
          sample_urls: urls.slice(0, 3),
          version: 'v8_dynamic_tickers',
          strategy: 'direct_search',
        },
        created_at: new Date().toISOString(),
      });
      
      processedTickers.add(ticker);
      console.log(`✅ ${ticker}: ${results.length} posts, sentiment: ${avgSentiment.toFixed(2)}`);
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    
    // Strategy 2: Sector/theme-based searches to discover more tickers
    console.log(`\n--- Strategy 2: Sector-based discovery ---`);
    const sectorQueries = [
      'AI stocks artificial intelligence',
      'EV electric vehicle stocks',
      'semiconductor chip stocks',
      'meme stocks wallstreetbets',
      'tech stocks FAANG',
      'biotech pharma stocks',
      'energy oil gas stocks',
      'crypto bitcoin stocks',
    ];
    
    for (const query of sectorQueries) {
      const results = await searchRedditViaFirecrawl(query, firecrawlKey);
      
      // Extract tickers mentioned in results
      for (const result of results) {
        const content = `${result.title || ''} ${result.description || ''} ${result.markdown || ''}`;
        const mentionedTickers = extractTickersFromContent(content, allValidTickers);
        
        for (const ticker of mentionedTickers) {
          if (processedTickers.has(ticker)) continue;
          
          const sentiment = analyzeSentiment(content);
          
          // Only add if we have meaningful content
          if (content.length > 50) {
            signals.push({
              ticker: ticker.substring(0, 10),
              source: 'reddit',
              mention_count: 1,
              bullish_count: sentiment > 0.1 ? 1 : 0,
              bearish_count: sentiment < -0.1 ? 1 : 0,
              sentiment_score: Math.max(-1, Math.min(1, sentiment)),
              post_volume: 1,
              metadata: {
                data_source: 'firecrawl_reddit_sector_discovery',
                fetched_at: new Date().toISOString(),
                discovery_query: query,
                version: 'v8_dynamic_tickers',
                strategy: 'sector_discovery',
              },
              created_at: new Date().toISOString(),
            });
            processedTickers.add(ticker);
          }
        }
      }
      
      // Rate limit between sector searches
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    console.log(`\n=== REDDIT SENTIMENT SUMMARY ===`);
    console.log(`Total signals with REAL data: ${signals.length}`);
    console.log(`Unique tickers processed: ${processedTickers.size}`);
    console.log(`Skipped (no data): ${skippedCount}`);

    if (signals.length === 0 && tickerList.length > 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-reddit-sentiment', {
        sourcesAttempted: [`Firecrawl Reddit search for ${tickerList.length} tickers`],
        reason: `All searches returned no Reddit data via Firecrawl`
      });
    }

    // Insert signals in batches
    if (signals.length > 0) {
      const insertBatchSize = 100;
      for (let i = 0; i < signals.length; i += insertBatchSize) {
        const batch = signals.slice(i, i + insertBatchSize);
        const { error } = await supabase.from('social_signals').insert(batch);
        if (error) {
          console.error('Insert error:', error.message);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-reddit-sentiment',
      status: 'success',
      rows_inserted: signals.length,
      rows_skipped: skippedCount,
      duration_ms: durationMs,
      source_used: 'Firecrawl Reddit Dynamic',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-reddit-sentiment',
      status: 'success',
      rowsInserted: signals.length,
      rowsSkipped: skippedCount,
      sourceUsed: 'Firecrawl Reddit Dynamic',
      duration: durationMs,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: signals.length,
        unique_tickers: processedTickers.size,
        skipped: skippedCount,
        source: 'Firecrawl Reddit Dynamic',
        version: 'v8_dynamic_tickers',
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
        source_used: 'Firecrawl Reddit Dynamic',
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
