import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v7 - ZERO ESTIMATION - Firecrawl only, skip if no real data

interface FirecrawlResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
}

// Keyword-based sentiment analysis (no randomness)
function analyzeSentiment(text: string): number {
  const lowerText = text.toLowerCase();
  
  const bullishWords = ['buy', 'calls', 'moon', 'rocket', 'bullish', 'long', 'undervalued', 'breakout', 'rally', 'growth', 'gain', 'up', 'green', 'pump', 'yolo', 'hold', 'diamond hands', 'squeeze', 'gamma', 'tendies'];
  const bearishWords = ['sell', 'puts', 'short', 'bearish', 'crash', 'dump', 'overvalued', 'drop', 'fall', 'down', 'red', 'loss', 'bag', 'rip', 'dead', 'rug', 'scam', 'avoid'];
  
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

async function searchRedditViaFirecrawl(ticker: string, firecrawlKey: string): Promise<FirecrawlResult[]> {
  try {
    // Search Reddit for stock discussions
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${ticker} stock site:reddit.com/r/wallstreetbets OR site:reddit.com/r/stocks OR site:reddit.com/r/investing`,
        limit: 10,
        tbs: 'qdr:w', // Last week
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });
    
    if (!response.ok) {
      console.log(`Firecrawl returned ${response.status} for ${ticker}`);
      return [];
    }
    
    const data = await response.json();
    console.log(`Firecrawl returned ${data.data?.length || 0} results for ${ticker}`);
    return data.data || [];
    
  } catch (error) {
    console.error(`Firecrawl error for ${ticker}:`, error);
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

    console.log('[v7] Starting Reddit sentiment ingestion - ZERO ESTIMATION MODE');
    
    if (!firecrawlKey) {
      console.error('FIRECRAWL_API_KEY not configured - cannot proceed without real data');
      throw new Error('FIRECRAWL_API_KEY required for Reddit sentiment ingestion');
    }
    
    // Popular tickers to track on Reddit (focus on high-activity stocks)
    const popularTickers = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC',
      'SPY', 'QQQ', 'GME', 'AMC', 'PLTR', 'NIO', 'SOFI', 'RIVN', 'LCID',
      'BA', 'DIS', 'NFLX', 'PYPL', 'SQ', 'COIN', 'HOOD', 'MARA', 'RIOT'
    ];
    
    // Get matching assets from database
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, ticker, name')
      .in('ticker', popularTickers);
    
    if (assetsError) throw assetsError;
    
    const validAssets = assets || [];
    console.log(`Processing ${validAssets.length} tickers for Reddit sentiment via Firecrawl`);
    
    const signals: any[] = [];
    let skippedCount = 0;
    
    // Process each ticker via Firecrawl
    for (const asset of validAssets) {
      const results = await searchRedditViaFirecrawl(asset.ticker, firecrawlKey);
      
      if (results.length === 0) {
        console.log(`${asset.ticker}: No Reddit data found - SKIPPING (no estimation)`);
        skippedCount++;
        continue;
      }
      
      // Analyze real results
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
        ticker: asset.ticker.substring(0, 10),
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
          version: 'v7_zero_estimation',
        },
        created_at: new Date().toISOString(),
      });
      
      console.log(`✅ ${asset.ticker}: ${results.length} posts, sentiment: ${avgSentiment.toFixed(2)} (${bullishCount} bullish, ${bearishCount} bearish)`);
      
      // Rate limit - respect Firecrawl limits
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    console.log(`\n=== REDDIT SENTIMENT SUMMARY ===`);
    console.log(`Total signals with REAL data: ${signals.length}`);
    console.log(`Skipped (no data found): ${skippedCount}`);
    console.log(`Estimated/fake data: 0 (ZERO ESTIMATION MODE)`);

    // 🚨 CRITICAL: Send alert if no real data was found
    if (signals.length === 0 && validAssets.length > 0) {
      await sendNoDataFoundAlert(slackAlerter, 'ingest-reddit-sentiment', {
        sourcesAttempted: [`Firecrawl Reddit search for ${validAssets.length} tickers`],
        reason: `All ${skippedCount} tickers returned no Reddit data via Firecrawl`
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
    const sourceUsed = 'Firecrawl Reddit Search';
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-reddit-sentiment',
      status: 'success',
      rows_inserted: signals.length,
      rows_skipped: skippedCount,
      duration_ms: durationMs,
      source_used: sourceUsed,
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-reddit-sentiment',
      status: 'success',
      rowsInserted: signals.length,
      rowsSkipped: skippedCount,
      sourceUsed: sourceUsed,
      duration: durationMs,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: signals.length,
        skipped: skippedCount,
        estimated: 0,
        source: sourceUsed,
        version: 'v7_zero_estimation',
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
        source_used: 'Firecrawl Reddit Search',
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
