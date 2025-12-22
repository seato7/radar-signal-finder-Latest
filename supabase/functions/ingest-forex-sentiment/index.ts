import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v3 - REAL DATA ONLY - NO ESTIMATIONS
// Uses Firecrawl to scrape real forex sentiment data from Myfxbook

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

interface ForexSentimentData {
  ticker: string;
  retail_long_pct: number;
  retail_short_pct: number;
  retail_sentiment: string;
  source: string;
}

async function scrapeForexSentiment(firecrawlApiKey: string): Promise<ForexSentimentData[]> {
  const results: ForexSentimentData[] = [];
  
  try {
    // Scrape Myfxbook community outlook (real retail positioning data)
    const response = await fetch(`${FIRECRAWL_API}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.myfxbook.com/community/outlook',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!response.ok) {
      console.log(`Firecrawl scrape failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown || markdown.length < 100) {
      console.log('No content scraped from Myfxbook');
      return [];
    }

    console.log(`Scraped ${markdown.length} chars from Myfxbook`);
    
    // Parse the markdown for currency pair sentiment data
    // Myfxbook shows pairs like "EUR/USD 65% Long / 35% Short"
    const pairPatterns = [
      /EUR\/USD[:\s]*(\d+(?:\.\d+)?)\s*%?\s*(?:long|short)/gi,
      /GBP\/USD[:\s]*(\d+(?:\.\d+)?)\s*%?\s*(?:long|short)/gi,
      /USD\/JPY[:\s]*(\d+(?:\.\d+)?)\s*%?\s*(?:long|short)/gi,
      /AUD\/USD[:\s]*(\d+(?:\.\d+)?)\s*%?\s*(?:long|short)/gi,
      /USD\/CAD[:\s]*(\d+(?:\.\d+)?)\s*%?\s*(?:long|short)/gi,
      /USD\/CHF[:\s]*(\d+(?:\.\d+)?)\s*%?\s*(?:long|short)/gi,
      /NZD\/USD[:\s]*(\d+(?:\.\d+)?)\s*%?\s*(?:long|short)/gi,
    ];
    
    const majorPairs = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD'];
    
    for (const pair of majorPairs) {
      // Look for pattern like "EUR/USD: 65.5% long" or "EUR/USD 35% short"
      const longPattern = new RegExp(`${pair.replace('/', '\\/')}[^\\d]*(\\d+(?:\\.\\d+)?)\\s*%?\\s*long`, 'i');
      const shortPattern = new RegExp(`${pair.replace('/', '\\/')}[^\\d]*(\\d+(?:\\.\\d+)?)\\s*%?\\s*short`, 'i');
      
      const longMatch = markdown.match(longPattern);
      const shortMatch = markdown.match(shortPattern);
      
      if (longMatch || shortMatch) {
        const longPct = longMatch ? parseFloat(longMatch[1]) : (100 - parseFloat(shortMatch?.[1] || '50'));
        const shortPct = shortMatch ? parseFloat(shortMatch[1]) : (100 - longPct);
        
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
    
    return results;
  } catch (error) {
    console.error('Firecrawl scraping error:', error);
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
    console.log('[v3] Starting forex sentiment ingestion - REAL DATA ONLY, NO ESTIMATIONS');

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
        sourcesAttempted: ['Firecrawl/Myfxbook'],
        reason: 'FIRECRAWL_API_KEY not configured'
      });
      
      return new Response(
        JSON.stringify({ success: false, error: 'No API key configured for real data', inserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scrape real sentiment data
    const sentimentData = await scrapeForexSentiment(firecrawlApiKey);
    
    if (sentimentData.length === 0) {
      console.log('❌ No real forex sentiment data found - NOT inserting any fake data');
      
      await logger.success({
        source_used: 'none',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
        metadata: { reason: 'no_real_data_available', version: 'v3_no_estimation' }
      });
      
      await sendNoDataFoundAlert(slackAlerter, 'ingest-forex-sentiment', {
        sourcesAttempted: ['Myfxbook via Firecrawl'],
        reason: 'Could not parse sentiment data from Myfxbook'
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No real forex sentiment data found - no fake data inserted',
          inserted: 0,
          version: 'v3_no_estimation'
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
          version: 'v3_no_estimation',
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
      source_used: 'Myfxbook_Community_Outlook',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
      rows_inserted: successCount,
      rows_skipped: 0,
      metadata: { version: 'v3_no_estimation' }
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-sentiment',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: 0,
      sourceUsed: 'Myfxbook_Community_Outlook (REAL DATA ONLY)',
    });

    console.log(`✅ Inserted ${successCount} REAL forex sentiment records - NO ESTIMATIONS`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: successCount,
        source: 'Myfxbook_Community_Outlook',
        version: 'v3_no_estimation',
        message: `Inserted ${successCount} REAL forex sentiment records`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);

    const duration = Date.now() - startTime;

    await logger.failure(error as Error, {
      source_used: 'Myfxbook_Community_Outlook',
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
