import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v7 - REAL DATA ONLY - IG Sentiment via DailyFX redirect
// The DailyFX sentiment page now redirects to IG which has the actual data

const VERSION = 'v7_ig_sentiment_parser';

interface ForexSentimentData {
  ticker: string;
  retail_long_pct: number;
  retail_short_pct: number;
  retail_sentiment: string;
  source: string;
}

// Parse IG Client Sentiment data (which DailyFX now redirects to)
// The page shows client sentiment with Long/Short percentages
async function scrapeIGSentiment(firecrawlApiKey: string): Promise<ForexSentimentData[]> {
  const results: ForexSentimentData[] = [];
  
  try {
    console.log('[IG/DailyFX] Scraping sentiment page...');
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.dailyfx.com/sentiment',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 8000,
      }),
    });

    if (!response.ok) {
      console.log(`[IG/DailyFX] Scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    if (!content || content.length < 500) {
      console.log('[IG/DailyFX] Content too short');
      return [];
    }

    console.log(`[IG/DailyFX] Scraped ${content.length} chars`);
    
    // Split content into lines for better parsing
    const lines = content.split('\n');
    
    // Pair mappings for IG format
    const pairMappings: Record<string, string> = {
      'EURUSD': 'EUR/USD',
      'EUR/USD': 'EUR/USD',
      'GBPUSD': 'GBP/USD', 
      'GBP/USD': 'GBP/USD',
      'USDJPY': 'USD/JPY',
      'USD/JPY': 'USD/JPY',
      'AUDUSD': 'AUD/USD',
      'AUD/USD': 'AUD/USD',
      'USDCAD': 'USD/CAD',
      'USD/CAD': 'USD/CAD',
      'USDCHF': 'USD/CHF',
      'USD/CHF': 'USD/CHF',
      'NZDUSD': 'NZD/USD',
      'NZD/USD': 'NZD/USD',
      'EURGBP': 'EUR/GBP',
      'EUR/GBP': 'EUR/GBP',
      'EURJPY': 'EUR/JPY',
      'EUR/JPY': 'EUR/JPY',
      'GBPJPY': 'GBP/JPY',
      'GBP/JPY': 'GBP/JPY',
    };
    
    // Look for lines containing pair names and then find percentage data
    for (const key of Object.keys(pairMappings)) {
      // Skip if we already have this pair
      const standardPair = pairMappings[key];
      if (results.find(r => r.ticker === standardPair)) continue;
      
      // Find index of line containing this pair
      const lineIndex = lines.findIndex((line: string) => 
        line.includes(key) && !line.includes('http') && !line.includes('[')
      );
      
      if (lineIndex === -1) continue;
      
      // Look at surrounding lines for percentage data
      const contextLines = lines.slice(
        Math.max(0, lineIndex - 2), 
        Math.min(lines.length, lineIndex + 5)
      ).join(' ');
      
      // Match patterns like "67%" or "67.5%"
      const percentages = contextLines.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/g);
      
      if (percentages && percentages.length >= 2) {
        const nums = percentages.slice(0, 4).map((p: string) => parseFloat(p.replace('%', '')));
        
        // Find pair that sums to ~100
        for (let i = 0; i < nums.length - 1; i++) {
          for (let j = i + 1; j < nums.length; j++) {
            if (Math.abs(nums[i] + nums[j] - 100) < 3) {
              // First number is typically Long in IG's format
              const longPct = nums[i];
              const shortPct = nums[j];
              
              let sentiment = 'neutral';
              if (longPct > 60) sentiment = 'bullish';
              if (shortPct > 60) sentiment = 'bearish';
              
              results.push({
                ticker: standardPair,
                retail_long_pct: Math.round(longPct * 100) / 100,
                retail_short_pct: Math.round(shortPct * 100) / 100,
                retail_sentiment: sentiment,
                source: 'IG_Client_Sentiment',
              });
              
              console.log(`✅ ${standardPair}: ${longPct}% long, ${shortPct}% short`);
              break;
            }
          }
          if (results.find(r => r.ticker === standardPair)) break;
        }
      }
    }
    
    // Also try pattern matching in full content for table-style data
    // IG sometimes shows data like "| 67% | 33% |"
    if (results.length === 0) {
      console.log('[IG/DailyFX] Trying alternative parsing...');
      
      // Look for "X% of traders are net-long" patterns
      const longPatterns = content.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s*%\s*of\s*(?:traders|clients)\s*are\s*net[- ]?long/gi);
      
      for (const match of longPatterns) {
        const longPct = parseFloat(match[1]);
        const shortPct = 100 - longPct;
        
        // Try to identify which pair this refers to
        const beforeMatch = content.substring(Math.max(0, match.index! - 100), match.index!);
        
        for (const key of Object.keys(pairMappings)) {
          if (beforeMatch.includes(key)) {
            const standardPair = pairMappings[key];
            if (!results.find(r => r.ticker === standardPair)) {
              let sentiment = 'neutral';
              if (longPct > 60) sentiment = 'bullish';
              if (shortPct > 60) sentiment = 'bearish';
              
              results.push({
                ticker: standardPair,
                retail_long_pct: Math.round(longPct * 100) / 100,
                retail_short_pct: Math.round(shortPct * 100) / 100,
                retail_sentiment: sentiment,
                source: 'IG_Client_Sentiment',
              });
              
              console.log(`✅ ${standardPair}: ${longPct}% long, ${shortPct}% short (pattern match)`);
              break;
            }
          }
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('[IG/DailyFX] Error:', error);
    return [];
  }
}

// Try Myfxbook as fallback
async function scrapeMyfxbook(firecrawlApiKey: string): Promise<ForexSentimentData[]> {
  const results: ForexSentimentData[] = [];
  
  try {
    console.log('[Myfxbook] Scraping community outlook...');
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.myfxbook.com/community/outlook',
        formats: ['html'], // HTML might have better structure
        onlyMainContent: false,
        waitFor: 8000,
      }),
    });

    if (!response.ok) {
      console.log(`[Myfxbook] Scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.data?.html || data.html || data.data?.markdown || '';
    
    if (!content || content.length < 500) {
      console.log('[Myfxbook] Content too short');
      return [];
    }

    console.log(`[Myfxbook] Scraped ${content.length} chars`);
    
    // Myfxbook uses class names with percentages
    // Pattern: data-long="65.5" data-short="34.5" 
    // Or: <span class="long">65.5%</span>
    
    const pairMappings: Record<string, string> = {
      'EURUSD': 'EUR/USD',
      'EUR/USD': 'EUR/USD',
      'GBPUSD': 'GBP/USD',
      'GBP/USD': 'GBP/USD',
      'USDJPY': 'USD/JPY',
      'USD/JPY': 'USD/JPY',
      'AUDUSD': 'AUD/USD',
      'NZDUSD': 'NZD/USD',
      'USDCAD': 'USD/CAD',
      'USDCHF': 'USD/CHF',
    };
    
    for (const [key, standardPair] of Object.entries(pairMappings)) {
      if (results.find(r => r.ticker === standardPair)) continue;
      
      const pairIndex = content.indexOf(key);
      if (pairIndex === -1) continue;
      
      // Look in the 500 chars after pair name
      const context = content.substring(pairIndex, Math.min(content.length, pairIndex + 500));
      
      // Look for data attributes or percentage values
      const dataLongMatch = context.match(/data-long="(\d+(?:\.\d+)?)"/);
      const dataShortMatch = context.match(/data-short="(\d+(?:\.\d+)?)"/);
      
      if (dataLongMatch && dataShortMatch) {
        const longPct = parseFloat(dataLongMatch[1]);
        const shortPct = parseFloat(dataShortMatch[1]);
        
        if (Math.abs(longPct + shortPct - 100) < 5) {
          let sentiment = 'neutral';
          if (longPct > 60) sentiment = 'bullish';
          if (shortPct > 60) sentiment = 'bearish';
          
          results.push({
            ticker: standardPair,
            retail_long_pct: Math.round(longPct * 100) / 100,
            retail_short_pct: Math.round(shortPct * 100) / 100,
            retail_sentiment: sentiment,
            source: 'Myfxbook_Community',
          });
          
          console.log(`✅ ${standardPair}: ${longPct}% long, ${shortPct}% short (Myfxbook)`);
          continue;
        }
      }
      
      // Fallback: look for percentage pairs
      const percentages = context.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/g);
      
      if (percentages && percentages.length >= 2) {
        const nums = percentages.slice(0, 4).map((p: string) => parseFloat(p.replace('%', '')));
        
        for (let i = 0; i < nums.length - 1; i++) {
          for (let j = i + 1; j < nums.length; j++) {
            if (Math.abs(nums[i] + nums[j] - 100) < 5) {
              const longPct = Math.max(nums[i], nums[j]);
              const shortPct = Math.min(nums[i], nums[j]);
              
              let sentiment = 'neutral';
              if (longPct > 60) sentiment = 'bullish';
              if (shortPct > 60) sentiment = 'bearish';
              
              results.push({
                ticker: standardPair,
                retail_long_pct: Math.round(longPct * 100) / 100,
                retail_short_pct: Math.round(shortPct * 100) / 100,
                retail_sentiment: sentiment,
                source: 'Myfxbook_Community',
              });
              
              console.log(`✅ ${standardPair}: ${longPct}% long, ${shortPct}% short (Myfxbook)`);
              break;
            }
          }
          if (results.find(r => r.ticker === standardPair)) break;
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('[Myfxbook] Error:', error);
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
    console.log(`[${VERSION}] Starting forex sentiment ingestion - REAL DATA ONLY`);

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      console.log('❌ FIRECRAWL_API_KEY not configured');
      
      await logger.failure(new Error('FIRECRAWL_API_KEY not configured'), {
        source_used: 'none',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'No API key configured', inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sentimentData: ForexSentimentData[] = [];
    let sourceUsed = 'none';
    
    // Try IG/DailyFX first
    sentimentData = await scrapeIGSentiment(firecrawlApiKey);
    sourceUsed = 'IG_Client_Sentiment';
    
    // Try Myfxbook as fallback
    if (sentimentData.length === 0) {
      console.log('[IG] No data, trying Myfxbook...');
      sentimentData = await scrapeMyfxbook(firecrawlApiKey);
      sourceUsed = 'Myfxbook_Community';
    }
    
    // Merge data from both sources if IG only got partial
    if (sentimentData.length > 0 && sentimentData.length < 5) {
      const myfxData = await scrapeMyfxbook(firecrawlApiKey);
      for (const md of myfxData) {
        if (!sentimentData.find(s => s.ticker === md.ticker)) {
          sentimentData.push(md);
        }
      }
      if (myfxData.length > 0) {
        sourceUsed = 'IG_and_Myfxbook';
      }
    }
    
    if (sentimentData.length === 0) {
      console.log('❌ No real forex sentiment data found - NOT inserting fake data');
      
      await logger.success({
        source_used: 'none',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
        metadata: { reason: 'no_real_data_available', version: VERSION }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-forex-sentiment', {
        sourcesAttempted: ['IG/DailyFX', 'Myfxbook'],
        reason: 'Could not extract sentiment data from any source'
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

    // Get asset IDs
    const tickers = sentimentData.map(s => s.ticker);
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('ticker', tickers);

    const tickerToAssetId = new Map(assets?.map(a => [a.ticker, a.id]) || []);

    // Insert REAL data only
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

    console.log(`✅ Inserted ${successCount} REAL forex sentiment records`);

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
