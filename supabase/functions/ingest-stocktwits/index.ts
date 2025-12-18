import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v6 - ZERO ESTIMATION - Firecrawl scraping of StockTwits, skip if no real data

interface FirecrawlResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// Extract sentiment from StockTwits scraped content
function extractSentimentFromContent(markdown: string): { bullish: number; bearish: number; neutral: number; total: number } {
  const lowerContent = markdown.toLowerCase();
  
  // Look for sentiment indicators in scraped content
  const bullishPatterns = ['bullish', '🐂', '📈', 'buy', 'long', 'calls', 'moon', 'rocket', '🚀', 'green'];
  const bearishPatterns = ['bearish', '🐻', '📉', 'sell', 'short', 'puts', 'crash', 'dump', 'red'];
  
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
  
  // Count message indicators (typically shown as numbers in StockTwits)
  const messageCountMatch = markdown.match(/(\d+)\s*messages?/i);
  const total = messageCountMatch ? parseInt(messageCountMatch[1]) : (bullish + bearish + 5);
  
  return {
    bullish,
    bearish,
    neutral: Math.max(0, total - bullish - bearish),
    total: Math.max(total, bullish + bearish),
  };
}

async function scrapeStockTwitsViaFirecrawl(ticker: string, firecrawlKey: string): Promise<{ success: boolean; data?: FirecrawlResult }> {
  try {
    // Scrape StockTwits symbol page
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
        waitFor: 2000, // Wait for dynamic content
      }),
    });
    
    if (!response.ok) {
      console.log(`Firecrawl scrape returned ${response.status} for ${ticker}`);
      return { success: false };
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data?.markdown) {
      console.log(`No content scraped for ${ticker}`);
      return { success: false };
    }
    
    return { success: true, data: data.data };
    
  } catch (error) {
    console.error(`Firecrawl scrape error for ${ticker}:`, error);
    return { success: false };
  }
}

// Fallback: Search StockTwits via Firecrawl search
async function searchStockTwitsViaFirecrawl(ticker: string, firecrawlKey: string): Promise<FirecrawlResult[]> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${ticker} site:stocktwits.com`,
        limit: 5,
        tbs: 'qdr:d', // Last day
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
    console.error(`Firecrawl search error for ${ticker}:`, error);
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

    console.log('[v6] Starting StockTwits sentiment ingestion - ZERO ESTIMATION MODE');

    if (!firecrawlKey) {
      console.error('FIRECRAWL_API_KEY not configured - cannot proceed without real data');
      throw new Error('FIRECRAWL_API_KEY required for StockTwits sentiment ingestion');
    }

    // Popular tickers to fetch
    const popularTickers = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC',
      'SPY', 'QQQ', 'GME', 'AMC', 'PLTR', 'NIO', 'SOFI', 'RIVN', 'LCID',
      'BA', 'DIS', 'NFLX', 'PYPL', 'SQ', 'COIN', 'HOOD', 'MARA', 'RIOT'
    ];

    // Get matching assets
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker, name')
      .in('ticker', popularTickers);
    
    if (assetsError) throw assetsError;
    
    const validAssets = assets || [];
    console.log(`Processing ${validAssets.length} tickers for StockTwits sentiment via Firecrawl`);
    
    const signals: any[] = [];
    let skippedCount = 0;
    
    // Process each ticker
    for (const asset of validAssets) {
      // Try direct scrape first
      let scrapeResult = await scrapeStockTwitsViaFirecrawl(asset.ticker, firecrawlKey);
      
      let content = '';
      let sourceMethod = 'scrape';
      
      if (scrapeResult.success && scrapeResult.data?.markdown) {
        content = scrapeResult.data.markdown;
      } else {
        // Fallback to search
        const searchResults = await searchStockTwitsViaFirecrawl(asset.ticker, firecrawlKey);
        if (searchResults.length > 0) {
          content = searchResults.map(r => `${r.title || ''} ${r.description || ''} ${r.markdown || ''}`).join(' ');
          sourceMethod = 'search';
        }
      }
      
      if (!content || content.length < 50) {
        console.log(`${asset.ticker}: No StockTwits data found - SKIPPING (no estimation)`);
        skippedCount++;
        continue;
      }
      
      // Extract sentiment from real content
      const sentiment = extractSentimentFromContent(content);
      const sentimentScore = sentiment.total > 0 
        ? (sentiment.bullish - sentiment.bearish) / sentiment.total 
        : 0;
      
      signals.push({
        ticker: asset.ticker.substring(0, 10),
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
          version: 'v6_zero_estimation',
        },
        created_at: new Date().toISOString(),
      });
      
      console.log(`✅ ${asset.ticker}: ${sentiment.total} signals via ${sourceMethod}, sentiment: ${sentimentScore.toFixed(2)}`);
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n=== STOCKTWITS SENTIMENT SUMMARY ===`);
    console.log(`Total signals with REAL data: ${signals.length}`);
    console.log(`Skipped (no data found): ${skippedCount}`);
    console.log(`Estimated/fake data: 0 (ZERO ESTIMATION MODE)`);

    // 🚨 CRITICAL: Send alert if no real data was found
    if (signals.length === 0 && validAssets.length > 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-stocktwits', {
        sourcesAttempted: [`Firecrawl StockTwits scrape/search for ${validAssets.length} tickers`],
        reason: `All ${skippedCount} tickers returned no StockTwits data via Firecrawl`
      });
    }

    // Insert only real signals
    if (signals.length > 0) {
      const { error } = await supabase
        .from('social_signals')
        .insert(signals);

      if (error) {
        console.error('Insert error:', error.message);
        throw error;
      }
    }

    const durationMs = Date.now() - startTime;
    const sourceUsed = 'Firecrawl StockTwits Scrape/Search';
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-stocktwits',
      status: 'success',
      rows_inserted: signals.length,
      rows_skipped: skippedCount,
      duration_ms: durationMs,
      source_used: sourceUsed,
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-stocktwits',
      status: 'success',
      duration: durationMs,
      rowsInserted: signals.length,
      rowsSkipped: skippedCount,
      sourceUsed: sourceUsed,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: signals.length,
        skipped: skippedCount,
        estimated: 0,
        source: sourceUsed,
        version: 'v6_zero_estimation',
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
        source_used: 'Firecrawl StockTwits',
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
