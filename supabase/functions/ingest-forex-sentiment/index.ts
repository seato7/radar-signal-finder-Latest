import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v5 - REAL DATA ONLY - NO ESTIMATIONS
// Uses Firecrawl to scrape DailyFX and Myfxbook for real forex sentiment

const VERSION = 'v5_improved_parsing';
const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

interface ForexSentimentData {
  ticker: string;
  retail_long_pct: number;
  retail_short_pct: number;
  retail_sentiment: string;
  source: string;
}

// Parse DailyFX sentiment page - they show sentiment in specific format
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
        onlyMainContent: false, // Get full page
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
    
    // DailyFX format varies, look for any percentage patterns near pair names
    const majorPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY'];
    
    for (const pair of majorPairs) {
      // Find pair in content and look for percentages nearby (within 200 chars)
      const pairIndex = content.indexOf(pair);
      if (pairIndex === -1) continue;
      
      const surroundingText = content.substring(Math.max(0, pairIndex - 50), Math.min(content.length, pairIndex + 200));
      
      // Look for percentage patterns like "65.5%" or "65%"
      const percentages = surroundingText.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/g);
      
      if (percentages && percentages.length >= 2) {
        const nums = percentages.map((p: string) => parseFloat(p.replace('%', '')));
        
        // Find two numbers that sum to ~100
        for (let i = 0; i < nums.length - 1; i++) {
          for (let j = i + 1; j < nums.length; j++) {
            if (Math.abs(nums[i] + nums[j] - 100) < 5) {
              const longPct = Math.max(nums[i], nums[j]);
              const shortPct = Math.min(nums[i], nums[j]);
              
              let sentiment = 'neutral';
              if (longPct > 60) sentiment = 'bullish';
              if (shortPct > 60) sentiment = 'bearish';
              
              results.push({
                ticker: pair,
                retail_long_pct: Math.round(longPct * 100) / 100,
                retail_short_pct: Math.round(shortPct * 100) / 100,
                retail_sentiment: sentiment,
                source: 'DailyFX_Sentiment',
              });
              
              console.log(`✅ ${pair}: ${longPct}% long, ${shortPct}% short (DailyFX)`);
              break;
            }
          }
          if (results.find(r => r.ticker === pair)) break;
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('[DailyFX] Scraping error:', error);
    return [];
  }
}

// Parse Myfxbook sentiment page with improved regex
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
      // Find pair in content and look for percentages nearby
      const pairVariants = [pair, pair.replace('/', '')]; // Try both EUR/USD and EURUSD
      
      for (const variant of pairVariants) {
        const pairIndex = content.indexOf(variant);
        if (pairIndex === -1) continue;
        
        const surroundingText = content.substring(pairIndex, Math.min(content.length, pairIndex + 300));
        
        // Myfxbook shows "X% | Y%" or "X% / Y%" format
        const percentages = surroundingText.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/g);
        
        if (percentages && percentages.length >= 2) {
          const nums = percentages.slice(0, 4).map((p: string) => parseFloat(p.replace('%', '')));
          
          // Find pair that sums to ~100
          for (let i = 0; i < nums.length - 1; i++) {
            for (let j = i + 1; j < nums.length; j++) {
              if (Math.abs(nums[i] + nums[j] - 100) < 5 && !results.find(r => r.ticker === pair)) {
                const longPct = Math.max(nums[i], nums[j]);
                const shortPct = Math.min(nums[i], nums[j]);
                
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
                
                console.log(`✅ ${pair}: ${longPct}% long, ${shortPct}% short (Myfxbook)`);
                break;
              }
            }
          }
        }
        
        if (results.find(r => r.ticker === pair)) break;
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

    // Try DailyFX first, then Myfxbook
    let sentimentData = await scrapeDailyFXSentiment(firecrawlApiKey);
    let sourceUsed = 'DailyFX_Sentiment';
    
    if (sentimentData.length === 0) {
      console.log('[DailyFX] No data extracted, trying Myfxbook...');
      sentimentData = await scrapeMyfxbookSentiment(firecrawlApiKey);
      sourceUsed = 'Myfxbook_Community_Outlook';
    }
    
    // Merge results if both have data
    if (sentimentData.length > 0 && sentimentData.length < 5) {
      const myfxbookData = await scrapeMyfxbookSentiment(firecrawlApiKey);
      for (const md of myfxbookData) {
        if (!sentimentData.find(s => s.ticker === md.ticker)) {
          sentimentData.push(md);
        }
      }
      if (myfxbookData.length > 0) {
        sourceUsed = 'DailyFX_and_Myfxbook';
      }
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
        reason: 'Could not extract sentiment percentages from either source'
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
    const insertData = sentimentData.map(s => ({
      ticker: s.ticker,
      asset_id: tickerToAssetId.get(s.ticker) || null,
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
      rows_skipped: 0,
      metadata: { version: VERSION }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-sentiment',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: 0,
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
