import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v7 - Dynamic ticker loading from database + batch processing

interface FirecrawlResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// Extract sentiment from StockTwits scraped content
function extractSentimentFromContent(markdown: string): { bullish: number; bearish: number; neutral: number; total: number } {
  const lowerContent = markdown.toLowerCase();
  
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
  
  const messageCountMatch = markdown.match(/(\d+)\s*messages?/i);
  const total = messageCountMatch ? parseInt(messageCountMatch[1]) : Math.max(bullish + bearish, 5);
  
  return {
    bullish,
    bearish,
    neutral: Math.max(0, total - bullish - bearish),
    total: Math.max(total, bullish + bearish),
  };
}

async function scrapeStockTwitsViaFirecrawl(ticker: string, firecrawlKey: string): Promise<{ success: boolean; data?: FirecrawlResult }> {
  try {
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
    
    return { success: true, data: data.data };
    
  } catch (error) {
    console.error(`Firecrawl scrape error for ${ticker}:`, error);
    return { success: false };
  }
}

async function searchStockTwitsViaFirecrawl(ticker: string, firecrawlKey: string): Promise<FirecrawlResult[]> {
  try {
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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v7] Starting StockTwits sentiment ingestion with DYNAMIC TICKER LOADING');

    if (!firecrawlKey) {
      throw new Error('FIRECRAWL_API_KEY required for StockTwits sentiment ingestion');
    }

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
    
    // Process tickers in batches
    for (let i = 0; i < tickerList.length; i++) {
      const ticker = tickerList[i];
      
      // Try direct scrape first
      let scrapeResult = await scrapeStockTwitsViaFirecrawl(ticker, firecrawlKey);
      
      let content = '';
      let sourceMethod = 'scrape';
      
      if (scrapeResult.success && scrapeResult.data?.markdown) {
        content = scrapeResult.data.markdown;
      } else {
        // Fallback to search
        const searchResults = await searchStockTwitsViaFirecrawl(ticker, firecrawlKey);
        if (searchResults.length > 0) {
          content = searchResults.map(r => `${r.title || ''} ${r.description || ''} ${r.markdown || ''}`).join(' ');
          sourceMethod = 'search';
        }
      }
      
      if (!content || content.length < 50) {
        console.log(`${ticker}: No StockTwits data found - SKIPPING`);
        skippedCount++;
        continue;
      }
      
      const sentiment = extractSentimentFromContent(content);
      const sentimentScore = sentiment.total > 0 
        ? (sentiment.bullish - sentiment.bearish) / sentiment.total 
        : 0;
      
      signals.push({
        ticker: ticker.substring(0, 10),
        source: 'stocktwits',
        mention_count: sentiment.total,
        bullish_count: sentiment.bullish,
        bearish_count: sentiment.bearish,
        sentiment_score: Math.max(-1, Math.min(1, sentimentScore)),
        post_volume: sentiment.total,
        metadata: {
          data_source: `firecrawl_stocktwits_${sourceMethod}`,
          fetched_at: new Date().toISOString(),
          content_length: content.length,
          version: 'v7_dynamic_tickers',
        },
        created_at: new Date().toISOString(),
      });
      
      console.log(`✅ ${ticker}: ${sentiment.total} signals via ${sourceMethod}, sentiment: ${sentimentScore.toFixed(2)}`);
      
      // Rate limit - 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Progress log every 20 tickers
      if ((i + 1) % 20 === 0) {
        console.log(`Progress: ${i + 1}/${tickerList.length} tickers processed`);
      }
    }

    console.log(`\n=== STOCKTWITS SENTIMENT SUMMARY ===`);
    console.log(`Total signals with REAL data: ${signals.length}`);
    console.log(`Skipped (no data found): ${skippedCount}`);

    if (signals.length === 0 && tickerList.length > 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-stocktwits', {
        sourcesAttempted: [`Firecrawl StockTwits for ${tickerList.length} tickers`],
        reason: `All ${skippedCount} tickers returned no StockTwits data`
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
      function_name: 'ingest-stocktwits',
      status: 'success',
      rows_inserted: signals.length,
      rows_skipped: skippedCount,
      duration_ms: durationMs,
      source_used: 'Firecrawl StockTwits Dynamic',
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-stocktwits',
      status: 'success',
      duration: durationMs,
      rowsInserted: signals.length,
      rowsSkipped: skippedCount,
      sourceUsed: 'Firecrawl StockTwits Dynamic',
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: signals.length,
        tickers_processed: tickerList.length,
        skipped: skippedCount,
        source: 'Firecrawl StockTwits Dynamic',
        version: 'v7_dynamic_tickers',
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
        source_used: 'Firecrawl StockTwits Dynamic',
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
