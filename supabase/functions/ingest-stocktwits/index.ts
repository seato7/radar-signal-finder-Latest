// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v8 - StockTwits API v2 primary + Firecrawl fallback

interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  entities?: {
    sentiment?: {
      basic: 'Bullish' | 'Bearish' | null;
    };
  };
  user?: {
    username: string;
  };
}

interface StockTwitsAPIResponse {
  response: { status: number };
  symbol?: { symbol: string };
  messages?: StockTwitsMessage[];
}

interface FirecrawlResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// Fetch messages from StockTwits public API v2 (no auth required)
async function fetchStockTwitsAPI(ticker: string): Promise<{
  success: boolean;
  messages: StockTwitsMessage[];
  error?: string;
}> {
  try {
    console.log(`StockTwits API: Fetching messages for ${ticker}...`);
    
    const response = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`,
      {
        headers: {
          'User-Agent': 'SignalFlow/1.0',
          'Accept': 'application/json',
        },
      }
    );
    
    if (response.status === 429) {
      console.log(`StockTwits API: Rate limited for ${ticker}`);
      return { success: false, messages: [], error: 'rate_limited' };
    }
    
    if (response.status === 404) {
      console.log(`StockTwits API: Symbol ${ticker} not found`);
      return { success: false, messages: [], error: 'not_found' };
    }
    
    if (!response.ok) {
      console.log(`StockTwits API: Error ${response.status} for ${ticker}`);
      return { success: false, messages: [], error: `http_${response.status}` };
    }
    
    const data: StockTwitsAPIResponse = await response.json();
    
    if (data.response?.status !== 200 || !data.messages) {
      return { success: false, messages: [], error: 'invalid_response' };
    }
    
    console.log(`StockTwits API: Fetched ${data.messages.length} messages for ${ticker}`);
    return { success: true, messages: data.messages };
    
  } catch (error) {
    console.error(`StockTwits API error for ${ticker}:`, error);
    return { success: false, messages: [], error: error instanceof Error ? error.message : 'unknown' };
  }
}

// Analyze sentiment from StockTwits API messages (uses native tags)
function analyzeAPIMessageSentiment(messages: StockTwitsMessage[]): {
  bullish: number;
  bearish: number;
  neutral: number;
  total: number;
  sampleMessages: string[];
} {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  const sampleMessages: string[] = [];
  
  for (const msg of messages) {
    // Use StockTwits native sentiment tags (most accurate)
    const sentiment = msg.entities?.sentiment?.basic;
    
    if (sentiment === 'Bullish') {
      bullish++;
    } else if (sentiment === 'Bearish') {
      bearish++;
    } else {
      // No explicit tag - analyze text for fallback
      const body = msg.body.toLowerCase();
      const bullishKeywords = ['bullish', 'buy', 'long', 'calls', 'moon', '🚀', '📈', 'green'];
      const bearishKeywords = ['bearish', 'sell', 'short', 'puts', 'crash', '📉', 'red'];
      
      const hasBullish = bullishKeywords.some(k => body.includes(k));
      const hasBearish = bearishKeywords.some(k => body.includes(k));
      
      if (hasBullish && !hasBearish) bullish++;
      else if (hasBearish && !hasBullish) bearish++;
      else neutral++;
    }
    
    // Collect sample messages (first 5)
    if (sampleMessages.length < 5 && msg.body.length > 10) {
      sampleMessages.push(msg.body.substring(0, 200));
    }
  }
  
  return { bullish, bearish, neutral, total: messages.length, sampleMessages };
}

// Extract sentiment from Firecrawl scraped content (fallback)
function extractSentimentFromContent(markdown: string): { 
  bullish: number; 
  bearish: number; 
  neutral: number; 
  total: number;
  sampleMessages: string[];
} {
  const bullishPatterns = ['bullish', '🐂', '📈', 'buy', 'long', 'calls', 'moon', 'rocket', '🚀', 'green', 'bull', 'rip', 'send'];
  const bearishPatterns = ['bearish', '🐻', '📉', 'sell', 'short', 'puts', 'crash', 'dump', 'red', 'bear', 'fade', 'tank'];
  
  let bullish = 0;
  let bearish = 0;
  
  for (const pattern of bullishPatterns) {
    const regex = new RegExp(pattern, 'gi');
    const matches = markdown.match(regex);
    if (matches) bullish += matches.length;
  }
  
  for (const pattern of bearishPatterns) {
    const regex = new RegExp(pattern, 'gi');
    const matches = markdown.match(regex);
    if (matches) bearish += matches.length;
  }
  
  const cleanText = markdown.replace(/,(\d)/g, '$1');
  const messageCountMatch = cleanText.match(/(\d+)\s*messages?/i);
  const total = messageCountMatch ? parseInt(messageCountMatch[1]) : Math.max(bullish + bearish, 5);
  
  // Extract sample content
  const sampleMessages: string[] = [];
  const sentences = markdown.split(/[.!?]+/).filter(s => s.length > 20 && s.length < 200);
  for (let i = 0; i < Math.min(3, sentences.length); i++) {
    sampleMessages.push(sentences[i].trim());
  }
  
  return {
    bullish,
    bearish,
    neutral: Math.max(0, total - bullish - bearish),
    total: Math.max(total, bullish + bearish),
    sampleMessages,
  };
}

async function scrapeStockTwitsViaFirecrawl(ticker: string, firecrawlKey: string): Promise<{ success: boolean; data?: FirecrawlResult }> {
  try {
    console.log(`Firecrawl: Scraping StockTwits page for ${ticker}...`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://stocktwits.com/symbol/${ticker}`,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });
    
    if (!response.ok) {
      return { success: false };
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data?.markdown) {
      return { success: false };
    }
    
    console.log(`Firecrawl: Scraped StockTwits page for ${ticker}`);
    return { success: true, data: data.data };
    
  } catch (error) {
    console.error(`Firecrawl scrape error for ${ticker}:`, error);
    return { success: false };
  }
}

async function searchStockTwitsViaFirecrawl(ticker: string, firecrawlKey: string): Promise<FirecrawlResult[]> {
  try {
    console.log(`Firecrawl: Searching StockTwits for ${ticker}...`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `$${ticker} site:stocktwits.com`,
        limit: 5,
        tbs: 'qdr:d',
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    console.log(`Firecrawl: Found ${data.data?.length || 0} search results for ${ticker}`);
    return data.data || [];
    
  } catch (error) {
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

  // Track sources used
  let apiSuccessCount = 0;
  let firecrawlScrapeCount = 0;
  let firecrawlSearchCount = 0;
  let firecrawlCallCount = 0;
  const FIRECRAWL_BUDGET = 20;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v8] Starting StockTwits ingestion - API PRIMARY + Firecrawl FALLBACK');

    // Load valid tickers from database
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

    // Build list of tickers to process
    const tickersToProcess = new Set<string>();
    
    // Always include popular stocks
    const alwaysInclude = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC',
      'SPY', 'QQQ', 'GME', 'AMC', 'PLTR', 'NIO', 'SOFI', 'RIVN', 'LCID',
      'BA', 'DIS', 'NFLX', 'PYPL', 'SQ', 'COIN', 'HOOD', 'MARA', 'RIOT',
      'IWM', 'XLF', 'XLE', 'XLK', 'ARKK', 'SOXL', 'TQQQ',
      'JPM', 'BAC', 'GS', 'V', 'MA', 'WMT', 'TGT', 'COST',
      'PFE', 'MRNA', 'JNJ', 'UNH', 'LLY', 'ABBV',
      'XOM', 'CVX', 'COP', 'OXY', 'SLB',
      'F', 'GM', 'UBER', 'LYFT', 'ABNB',
    ];
    
    for (const t of alwaysInclude) {
      if (allValidTickers.has(t)) tickersToProcess.add(t);
    }
    
    // Add tickers from user watchlists
    const { data: watchlistItems } = await supabase
      .from('watchlist')
      .select('ticker')
      .limit(100);
    
    if (watchlistItems) {
      for (const item of watchlistItems) {
        if (allValidTickers.has(item.ticker)) tickersToProcess.add(item.ticker);
      }
    }
    
    // Add tickers with recent breaking news (active stocks)
    const { data: recentNews } = await supabase
      .from('breaking_news')
      .select('ticker')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(50);
    
    if (recentNews) {
      for (const news of recentNews) {
        if (allValidTickers.has(news.ticker)) tickersToProcess.add(news.ticker);
      }
    }
    
    // Limit to 100 tickers per run
    const tickerList = Array.from(tickersToProcess).slice(0, 100);
    console.log(`Processing ${tickerList.length} tickers for StockTwits sentiment`);
    
    const signals: any[] = [];
    let skippedCount = 0;
    let rateLimitedCount = 0;
    let failedCount = 0;
    
    // Process tickers
    for (let i = 0; i < tickerList.length; i++) {
      const ticker = tickerList[i];
      
      let sentiment: { bullish: number; bearish: number; neutral: number; total: number; sampleMessages: string[] };
      let dataSource = '';
      
      // === TIER 1: Try StockTwits API v2 (primary) ===
      const apiResult = await fetchStockTwitsAPI(ticker);
      
      if (apiResult.success && apiResult.messages.length > 0) {
        sentiment = analyzeAPIMessageSentiment(apiResult.messages);
        dataSource = 'stocktwits_api';
        apiSuccessCount++;
        console.log(`✅ ${ticker}: ${sentiment.total} messages via StockTwits API`);
      } 
      // === TIER 2: Firecrawl scrape (fallback) ===
      else if (firecrawlKey) {
        if (apiResult.error === 'rate_limited') {
          rateLimitedCount++;
        }

        if (firecrawlCallCount >= FIRECRAWL_BUDGET) {
          console.log(`⚠️ Firecrawl budget limit reached (${FIRECRAWL_BUDGET} calls), skipping remaining tickers`);
          skippedCount++;
          continue;
        }

        firecrawlCallCount++;
        const scrapeResult = await scrapeStockTwitsViaFirecrawl(ticker, firecrawlKey);

        if (scrapeResult.success && scrapeResult.data?.markdown && scrapeResult.data.markdown.length >= 50) {
          sentiment = extractSentimentFromContent(scrapeResult.data.markdown);
          dataSource = 'firecrawl_stocktwits_scrape';
          firecrawlScrapeCount++;
          console.log(`✅ ${ticker}: ${sentiment.total} signals via Firecrawl scrape`);
        }
        // === TIER 3: Firecrawl search (last resort) ===
        else {
          if (firecrawlCallCount >= FIRECRAWL_BUDGET) {
            console.log(`⚠️ Firecrawl budget limit reached (${FIRECRAWL_BUDGET} calls), skipping remaining tickers`);
            skippedCount++;
            continue;
          }

          firecrawlCallCount++;
          const searchResults = await searchStockTwitsViaFirecrawl(ticker, firecrawlKey);

          if (searchResults.length > 0) {
            const content = searchResults.map(r => `${r.title || ''} ${r.description || ''} ${r.markdown || ''}`).join(' ');

            if (content.length >= 50) {
              sentiment = extractSentimentFromContent(content);
              dataSource = 'firecrawl_stocktwits_search';
              firecrawlSearchCount++;
              console.log(`✅ ${ticker}: ${sentiment.total} signals via Firecrawl search`);
            } else {
              console.log(`${ticker}: No StockTwits data found - SKIPPING`);
              skippedCount++;
              continue;
            }
          } else {
            console.log(`${ticker}: No StockTwits data found - SKIPPING`);
            skippedCount++;
            continue;
          }
        }
      } else {
        console.log(`${ticker}: API failed and no Firecrawl key - SKIPPING`);
        skippedCount++;
        continue;
      }
      
      const sentimentScore = sentiment.total > 0 
        ? (sentiment.bullish - sentiment.bearish) / sentiment.total 
        : 0;
      
      // Sanitize sample messages for JSON storage - remove control chars and emojis that break JSON
      const sanitizedSamples = sentiment.sampleMessages.map(msg => 
        msg
          .replace(/[\x00-\x1F\x7F]/g, ' ')
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .substring(0, 150)
      ).filter(msg => msg.length > 0);
      
      signals.push({
        ticker: ticker.substring(0, 10),
        source: 'stocktwits',
        signal_date: new Date().toISOString().split('T')[0],
        mention_count: sentiment.total,
        bullish_count: sentiment.bullish,
        bearish_count: sentiment.bearish,
        sentiment_score: Math.max(-1, Math.min(1, sentimentScore)),
        post_volume: sentiment.total,
        metadata: {
          data_source: dataSource,
          fetched_at: new Date().toISOString(),
          sample_messages: sanitizedSamples,
          version: 'v8_api_primary',
        },
        created_at: new Date().toISOString(),
      });
      
      // Rate limit - different for API vs Firecrawl
      // StockTwits API: ~200 req/hr = 1 per 18s
      // Firecrawl: 1s between requests
      const delay = dataSource === 'stocktwits_api' ? 18000 : 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Progress log every 20 tickers
      if ((i + 1) % 20 === 0) {
        console.log(`Progress: ${i + 1}/${tickerList.length} | API: ${apiSuccessCount} | Scrape: ${firecrawlScrapeCount} | Search: ${firecrawlSearchCount}`);
      }
    }

    console.log(`\n=== STOCKTWITS SENTIMENT SUMMARY (v8) ===`);
    console.log(`Total signals with REAL data: ${signals.length}`);
    console.log(`StockTwits API successes: ${apiSuccessCount}`);
    console.log(`Firecrawl scrape fallbacks: ${firecrawlScrapeCount}`);
    console.log(`Firecrawl search fallbacks: ${firecrawlSearchCount}`);
    console.log(`Rate limited: ${rateLimitedCount}`);
    console.log(`Skipped (no data): ${skippedCount}`);

    if (signals.length === 0 && tickerList.length > 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-stocktwits', {
        sourcesAttempted: ['StockTwits API v2', 'Firecrawl Scrape', 'Firecrawl Search'],
        reason: `All ${skippedCount} tickers returned no StockTwits data`
      });
    }

    // Insert signals in batches
    if (signals.length > 0) {
      const insertBatchSize = 100;
      for (let i = 0; i < signals.length; i += insertBatchSize) {
        const batch = signals.slice(i, i + insertBatchSize);
        const { error } = await supabase
          .from('social_signals')
          .upsert(batch, { onConflict: 'ticker,source,signal_date' });
        if (error) {
          console.error('Upsert error:', error.message);
          failedCount += batch.length;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const primarySource = apiSuccessCount > firecrawlScrapeCount + firecrawlSearchCount 
      ? 'StockTwits API' 
      : 'Firecrawl';
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-stocktwits',
      status: 'success',
      rows_inserted: signals.length - failedCount,
      rows_skipped: skippedCount + failedCount,
      duration_ms: durationMs,
      source_used: `${primarySource} (API: ${apiSuccessCount}, Firecrawl: ${firecrawlScrapeCount + firecrawlSearchCount})`,
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-stocktwits',
      status: 'success',
      duration: durationMs,
      rowsInserted: signals.length,
      rowsSkipped: skippedCount,
      sourceUsed: `${primarySource} (API: ${apiSuccessCount}, Firecrawl: ${firecrawlScrapeCount + firecrawlSearchCount})`,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: signals.length,
        tickers_processed: tickerList.length,
        skipped: skippedCount,
        sources: {
          stocktwits_api: apiSuccessCount,
          firecrawl_scrape: firecrawlScrapeCount,
          firecrawl_search: firecrawlSearchCount,
        },
        rate_limited: rateLimitedCount,
        version: 'v8_api_primary',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-stocktwits:', error);
    if (supabase) {
      await logHeartbeat(supabase, {
        function_name: 'ingest-stocktwits',
        status: 'failure',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'StockTwits API + Firecrawl',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-stocktwits',
      message: `StockTwits ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
