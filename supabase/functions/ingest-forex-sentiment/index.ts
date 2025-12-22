import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v4 - REAL DATA ONLY - NO ESTIMATIONS
// Uses multiple sources to get real forex sentiment data

const VERSION = 'v4_real_data';
const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

interface ForexSentimentData {
  ticker: string;
  retail_long_pct: number;
  retail_short_pct: number;
  retail_sentiment: string;
  source: string;
}

// Try to scrape DailyFX sentiment page
async function scrapeDailyFXSentiment(firecrawlApiKey: string): Promise<ForexSentimentData[]> {
  const results: ForexSentimentData[] = [];
  
  try {
    console.log('[DailyFX] Attempting to scrape sentiment data...');
    
    const response = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.dailyfx.com/sentiment',
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        waitFor: 5000,
      }),
    });

    if (!response.ok) {
      console.log(`[DailyFX] Scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.data?.markdown || data.markdown || data.data?.html || data.html || '';
    
    if (!content || content.length < 200) {
      console.log('[DailyFX] No usable content');
      return [];
    }

    console.log(`[DailyFX] Scraped ${content.length} chars`);
    
    // DailyFX shows pairs with percentages like "EUR/USD 65% Long"
    const majorPairs = [
      { display: 'EUR/USD', ticker: 'EUR/USD' },
      { display: 'GBP/USD', ticker: 'GBP/USD' },
      { display: 'USD/JPY', ticker: 'USD/JPY' },
      { display: 'AUD/USD', ticker: 'AUD/USD' },
      { display: 'USD/CAD', ticker: 'USD/CAD' },
      { display: 'USD/CHF', ticker: 'USD/CHF' },
      { display: 'NZD/USD', ticker: 'NZD/USD' },
      { display: 'EUR/GBP', ticker: 'EUR/GBP' },
      { display: 'EUR/JPY', ticker: 'EUR/JPY' },
      { display: 'GBP/JPY', ticker: 'GBP/JPY' },
    ];
    
    for (const { display, ticker } of majorPairs) {
      // Try multiple pattern formats
      const escapedPair = display.replace('/', '\\/');
      
      // Pattern 1: "EUR/USD: 65% Long, 35% Short" or similar
      const pattern1 = new RegExp(`${escapedPair}[^\\d]*(\\d+(?:\\.\\d+)?)\\s*%?\\s*(long|short)[^\\d]*(\\d+(?:\\.\\d+)?)\\s*%?\\s*(long|short)`, 'i');
      
      // Pattern 2: Just "EUR/USD 65% long" 
      const longPattern = new RegExp(`${escapedPair}[^\\d]{0,30}(\\d+(?:\\.\\d+)?)\\s*%?\\s*(?:are\\s+)?long`, 'i');
      const shortPattern = new RegExp(`${escapedPair}[^\\d]{0,30}(\\d+(?:\\.\\d+)?)\\s*%?\\s*(?:are\\s+)?short`, 'i');
      
      // Pattern 3: Check for numbers near pair name
      const nearbyNumbers = new RegExp(`${escapedPair}[^\\d]{0,50}(\\d{1,2}(?:\\.\\d+)?)[^\\d]{0,10}(\\d{1,2}(?:\\.\\d+)?)`, 'i');
      
      let longPct: number | null = null;
      let shortPct: number | null = null;
      
      const longMatch = content.match(longPattern);
      const shortMatch = content.match(shortPattern);
      
      if (longMatch) {
        longPct = parseFloat(longMatch[1]);
        shortPct = shortMatch ? parseFloat(shortMatch[1]) : (100 - longPct);
      } else if (shortMatch) {
        shortPct = parseFloat(shortMatch[1]);
        longPct = 100 - shortPct;
      }
      
      // Validate the percentages are reasonable
      if (longPct !== null && shortPct !== null && 
          longPct >= 0 && longPct <= 100 && 
          shortPct >= 0 && shortPct <= 100 &&
          Math.abs(longPct + shortPct - 100) < 5) { // Allow small rounding errors
        
        let sentiment = 'neutral';
        if (longPct > 60) sentiment = 'bullish';
        if (shortPct > 60) sentiment = 'bearish';
        
        results.push({
          ticker,
          retail_long_pct: Math.round(longPct * 100) / 100,
          retail_short_pct: Math.round(shortPct * 100) / 100,
          retail_sentiment: sentiment,
          source: 'DailyFX_Sentiment',
        });
        
        console.log(`✅ ${ticker}: ${longPct}% long, ${shortPct}% short`);
      }
    }
    
    return results;
  } catch (error) {
    console.error('[DailyFX] Scraping error:', error);
    return [];
  }
}

// Try to scrape Myfxbook sentiment page (fallback)
async function scrapeMyfxbookSentiment(firecrawlApiKey: string): Promise<ForexSentimentData[]> {
  const results: ForexSentimentData[] = [];
  
  try {
    console.log('[Myfxbook] Attempting to scrape sentiment data...');
    
    const response = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.myfxbook.com/community/outlook',
        formats: ['markdown', 'html'],
        onlyMainContent: false, // Get full page for tables
        waitFor: 5000,
      }),
    });

    if (!response.ok) {
      console.log(`[Myfxbook] Scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.data?.markdown || data.markdown || data.data?.html || data.html || '';
    
    if (!content || content.length < 200) {
      console.log('[Myfxbook] No usable content');
      return [];
    }

    console.log(`[Myfxbook] Scraped ${content.length} chars`);
    
    const majorPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD'];
    
    for (const pair of majorPairs) {
      const escapedPair = pair.replace('/', '\\/');
      
      // Myfxbook format: look for percentages near the pair
      // Could be "65% / 35%" or "65 | 35" etc.
      const tableRowPattern = new RegExp(`${escapedPair}[^\\d]{0,100}(\\d{1,2}(?:\\.\\d+)?)\\s*[%|/\\s]+\\s*(\\d{1,2}(?:\\.\\d+)?)`, 'i');
      
      const match = content.match(tableRowPattern);
      if (match) {
        const num1 = parseFloat(match[1]);
        const num2 = parseFloat(match[2]);
        
        // Assume larger number is long if they sum to ~100
        if (Math.abs(num1 + num2 - 100) < 5) {
          const longPct = Math.max(num1, num2);
          const shortPct = Math.min(num1, num2);
          
          let sentiment = 'neutral';
          if (longPct > 60) sentiment = 'bullish';
          if (shortPct > 60) sentiment = 'bearish';
          
          results.push({
            ticker: pair,
            retail_long_pct: Math.round(longPct * 100) / 100,
            retail_short_pct: Math.round(shortPct * 100) / 100,
            retail_sentiment: sentiment,
            source: 'Myfxbook_Community_Outlook',
          });
          
          console.log(`✅ ${pair}: ${longPct}% long, ${shortPct}% short`);
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('[Myfxbook] Scraping error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const logger = new IngestLogger(supabaseClient, 'ingest-forex-sentiment');
  const slackAlerter = new SlackAlerter();
  await logger.start();
  const startTime = Date.now();

  try {
    console.log(`[${VERSION}] Starting forex sentiment ingestion - REAL DATA ONLY, NO ESTIMATIONS`);

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      console.log('❌ FIRECRAWL_API_KEY not configured - cannot fetch real data');
      
      await logger.failure(new Error('FIRECRAWL_API_KEY not configured'), {
        source_used: 'none',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-forex-sentiment', {
        sourcesAttempted: ['DailyFX', 'Myfxbook'],
        reason: 'FIRECRAWL_API_KEY not configured'
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'No API key configured for real data', inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try DailyFX first (more reliable), then Myfxbook as fallback
    let sentimentData = await scrapeDailyFXSentiment(firecrawlApiKey);
    let sourceUsed = 'DailyFX_Sentiment';
    
    if (sentimentData.length === 0) {
      console.log('[DailyFX] No data, trying Myfxbook...');
      sentimentData = await scrapeMyfxbookSentiment(firecrawlApiKey);
      sourceUsed = 'Myfxbook_Community_Outlook';
    }
    
    if (sentimentData.length === 0) {
      console.log('❌ No real forex sentiment data found from any source - NOT inserting any fake data');
      
      await logger.success({
        source_used: 'none',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
        metadata: { reason: 'no_real_data_available', version: VERSION }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-forex-sentiment', {
        sourcesAttempted: ['DailyFX', 'Myfxbook via Firecrawl'],
        reason: 'Could not parse sentiment data from either source'
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No real forex sentiment data found - no fake data inserted',
          inserted: 0,
          version: VERSION
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get asset IDs for the forex pairs
    const tickers = sentimentData.map(s => s.ticker);
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Prepare insert data - REAL DATA ONLY
    const insertData = sentimentData
      .filter(s => tickerToAssetId.has(s.ticker))
      .map(s => ({
        ticker: s.ticker,
        asset_id: tickerToAssetId.get(s.ticker),
        retail_long_pct: s.retail_long_pct,
        retail_short_pct: s.retail_short_pct,
        retail_sentiment: s.retail_sentiment,
        news_sentiment_score: null,
        news_count: null,
        social_mentions: null,
        social_sentiment_score: null,
        source: s.source,
        metadata: { 
          data_type: 'real',
          version: VERSION,
          scraped_at: new Date().toISOString()
        }
      }));

    let successCount = 0;
    if (insertData.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('forex_sentiment')
        .insert(insertData);

      if (insertError) {
        console.error('Insert error:', insertError.message);
      } else {
        successCount = insertData.length;
      }
    }

    const duration = Date.now() - startTime;

    await logger.success({
      source_used: sourceUsed,
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
      rows_inserted: successCount,
      rows_skipped: sentimentData.length - insertData.length,
      metadata: { version: VERSION }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-sentiment',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: sentimentData.length - insertData.length,
      sourceUsed: `${sourceUsed} (REAL DATA ONLY)`,
    });

    console.log(`✅ Inserted ${successCount} REAL forex sentiment records - NO ESTIMATIONS`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: successCount,
        source: sourceUsed,
        version: VERSION,
        message: `Inserted ${successCount} REAL forex sentiment records`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);

    const duration = Date.now() - startTime;

    await logger.failure(error as Error, {
      source_used: 'none',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
    });

    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-forex-sentiment',
      message: `Forex sentiment ingestion failed: ${(error as Error).message}`,
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
