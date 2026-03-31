// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v8 - Uses forexclientsentiment.com as primary source (free, no login)
const VERSION = 'v8_forexclientsentiment';

interface ForexSentimentData {
  ticker: string;
  retail_long_pct: number;
  retail_short_pct: number;
  retail_sentiment: string;
  source: string;
}

// Parse forexclientsentiment.com markdown format
// Pattern: **AUD/USD** \\ \\ `41%`\\ \\ Bullish \\ \\ `59%`
// First percentage is long, second is short
function parseForexClientSentiment(markdown: string): ForexSentimentData[] {
  const results: ForexSentimentData[] = [];
  
  // Match pattern: **PAIR** \\ \\ `XX%`\\ \\ SENTIMENT \\ \\ `YY%`
  const pairPattern = /\*\*([A-Z]{3}\/[A-Z]{3})\*\*\s*\\\\\s*\\\\\s*`(\d+)%`\s*\\\\\s*\\\\\s*(Bullish|Bearish|Mixed)\s*\\\\\s*\\\\\s*`(\d+)%`/gi;
  
  let match;
  while ((match = pairPattern.exec(markdown)) !== null) {
    const [, pairWithSlash, firstPctStr, , secondPctStr] = match;
    const ticker = pairWithSlash; // FIX: Keep AUD/USD format to match assets table ticker format
    const firstPct = parseInt(firstPctStr, 10);
    const secondPct = parseInt(secondPctStr, 10);
    
    // Validate percentages add up reasonably
    if (firstPct + secondPct >= 95 && firstPct + secondPct <= 105) {
      // First percentage is long, second is short based on the page layout
      const longPct = firstPct;
      const shortPct = secondPct;
      
      // Determine sentiment based on percentages
      let derivedSentiment = 'neutral';
      if (longPct > 60) derivedSentiment = 'bullish';
      else if (shortPct > 60) derivedSentiment = 'bearish';
      
      // Skip if we already have this ticker
      if (!results.find(r => r.ticker === ticker)) {
        results.push({
          ticker,
          retail_long_pct: longPct,
          retail_short_pct: shortPct,
          retail_sentiment: derivedSentiment,
          source: 'ForexClientSentiment'
        });
        
        console.log(`✅ ${ticker}: ${longPct}% long, ${shortPct}% short`);
      }
    }
  }
  
  return results;
}

// Primary source: forexclientsentiment.com
async function scrapeForexClientSentiment(firecrawlApiKey: string): Promise<ForexSentimentData[]> {
  try {
    console.log('[ForexClientSentiment] Scraping sentiment page...');
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://forexclientsentiment.com/forex-sentiment',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.log(`[ForexClientSentiment] Scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown || markdown.length < 500) {
      console.log('[ForexClientSentiment] Content too short');
      return [];
    }

    console.log(`[ForexClientSentiment] Scraped ${markdown.length} chars`);
    
    const results = parseForexClientSentiment(markdown);
    console.log(`[ForexClientSentiment] Parsed ${results.length} pairs`);
    
    return results;
  } catch (error) {
    console.error('[ForexClientSentiment] Error:', error);
    return [];
  }
}

// Fallback: FXSSI.com
async function scrapeFXSSI(firecrawlApiKey: string): Promise<ForexSentimentData[]> {
  const results: ForexSentimentData[] = [];
  
  try {
    console.log('[FXSSI] Scraping sentiment data as fallback...');
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://fxssi.com/tools/current-ratio',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 5000,
      }),
    });

    if (!response.ok) {
      console.log(`[FXSSI] Scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.data?.markdown || data.markdown || '';
    
    if (!content || content.length < 500) {
      console.log('[FXSSI] Content too short');
      return [];
    }

    console.log(`[FXSSI] Scraped ${content.length} chars`);
    
    // FXSSI has pairs listed with percentages nearby
    const pairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY'] // FIX: Match assets table ticker format with slashes;
    
    for (const pair of pairs) {
      // Look for the pair followed by percentage data
      // FIX: Escape slash in pair name for regex, also try without slash (EURUSD format)
      const pairNoSlash = pair.replace('/', '');
      const pairEscaped = pair.replace('/', '\\/');
      const pairRegex = new RegExp(`(?:${pairEscaped}|${pairNoSlash})[^\\d]{0,50}(\\d{1,2})(?:\\.[0-9]+)?%?[^\\d]{0,20}(\\d{1,2})(?:\\.[0-9]+)?%?`, 'i');
      const match = content.match(pairRegex);
      
      if (match) {
        const pct1 = parseInt(match[1], 10);
        const pct2 = parseInt(match[2], 10);
        
        // Check if they add up to roughly 100
        if (pct1 + pct2 >= 90 && pct1 + pct2 <= 110) {
          // Normalize to 100%
          const total = pct1 + pct2;
          const longPct = Math.round((pct1 / total) * 100);
          const shortPct = 100 - longPct;
          
          let sentiment = 'neutral';
          if (longPct > 60) sentiment = 'bullish';
          else if (shortPct > 60) sentiment = 'bearish';
          
          results.push({
            ticker: pair,
            retail_long_pct: longPct,
            retail_short_pct: shortPct,
            retail_sentiment: sentiment,
            source: 'FXSSI'
          });
          
          console.log(`✅ ${pair}: ${longPct}% long, ${shortPct}% short (FXSSI)`);
        }
      }
    }
    
    console.log(`[FXSSI] Parsed ${results.length} pairs`);
    return results;
  } catch (error) {
    console.error('[FXSSI] Error:', error);
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
    
    // Primary: forexclientsentiment.com
    sentimentData = await scrapeForexClientSentiment(firecrawlApiKey);
    sourceUsed = 'ForexClientSentiment';
    
    // Fallback: FXSSI
    if (sentimentData.length === 0) {
      console.log('[ForexClientSentiment] No data, trying FXSSI fallback...');
      sentimentData = await scrapeFXSSI(firecrawlApiKey);
      sourceUsed = 'FXSSI';
    }
    
    // Merge if primary only got partial data
    if (sentimentData.length > 0 && sentimentData.length < 5) {
      console.log(`[${VERSION}] Only ${sentimentData.length} pairs, trying to supplement from FXSSI...`);
      const fxssiData = await scrapeFXSSI(firecrawlApiKey);
      for (const fd of fxssiData) {
        if (!sentimentData.find(s => s.ticker === fd.ticker)) {
          sentimentData.push(fd);
        }
      }
      if (fxssiData.length > 0) {
        sourceUsed = 'ForexClientSentiment+FXSSI';
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
        sourcesAttempted: ['ForexClientSentiment', 'FXSSI'],
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
      metadata: { version: VERSION, pairs: tickers }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-sentiment',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: 0,
      sourceUsed: `${sourceUsed} (REAL DATA ONLY)`,
    });

    console.log(`✅ Inserted ${successCount} REAL forex sentiment records from ${sourceUsed}`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: successCount,
        source: sourceUsed,
        pairs: tickers,
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
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
