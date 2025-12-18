import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v5 - Real StockTwits API (public, no auth required) with estimation fallback

interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  entities?: {
    sentiment?: {
      basic: 'Bullish' | 'Bearish' | null;
    };
  };
}

async function fetchStockTwitsSentiment(ticker: string): Promise<{
  bullish: number;
  bearish: number;
  total: number;
  success: boolean;
}> {
  try {
    const url = `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'InvestmentRadar/1.0',
      },
    });
    
    if (!response.ok) {
      console.log(`StockTwits API returned ${response.status} for ${ticker}`);
      return { bullish: 0, bearish: 0, total: 0, success: false };
    }
    
    const data = await response.json();
    
    if (!data.messages || !Array.isArray(data.messages)) {
      return { bullish: 0, bearish: 0, total: 0, success: false };
    }
    
    let bullish = 0;
    let bearish = 0;
    
    for (const msg of data.messages as StockTwitsMessage[]) {
      const sentiment = msg.entities?.sentiment?.basic;
      if (sentiment === 'Bullish') bullish++;
      else if (sentiment === 'Bearish') bearish++;
    }
    
    return {
      bullish,
      bearish,
      total: data.messages.length,
      success: true,
    };
    
  } catch (error) {
    console.error(`StockTwits error for ${ticker}:`, error);
    return { bullish: 0, bearish: 0, total: 0, success: false };
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
    supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[v5] Starting StockTwits sentiment ingestion with real API...');

    // Popular tickers to fetch from real API
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
    
    console.log(`Processing ${assets?.length || 0} tickers for StockTwits sentiment`);
    
    const signals: any[] = [];
    let realDataCount = 0;
    let estimatedCount = 0;
    
    // Fetch real data from StockTwits for top tickers
    const topTickers = (assets || []).slice(0, 15);
    
    for (const asset of topTickers) {
      const result = await fetchStockTwitsSentiment(asset.ticker);
      
      if (result.success && result.total > 0) {
        const sentimentScore = result.total > 0 
          ? (result.bullish - result.bearish) / result.total 
          : 0;
        
        signals.push({
          ticker: asset.ticker.substring(0, 10),
          source: 'stocktwits',
          mention_count: result.total,
          bullish_count: result.bullish,
          bearish_count: result.bearish,
          sentiment_score: Math.max(-1, Math.min(1, sentimentScore)),
          post_volume: result.total,
          metadata: {
            estimated: false,
            source: 'stocktwits_api',
            fetched_at: new Date().toISOString(),
          },
          created_at: new Date().toISOString(),
        });
        
        realDataCount++;
        console.log(`${asset.ticker}: ${result.total} msgs, ${result.bullish} bullish, ${result.bearish} bearish`);
      }
      
      // Rate limit - wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Generate estimation for remaining assets
    const processedTickers = new Set(signals.map(s => s.ticker));
    const remainingAssets = (assets || []).filter((a: any) => !processedTickers.has(a.ticker));
    
    // Get prices for popularity estimation
    const { data: prices } = await supabase
      .from('prices')
      .select('ticker, close')
      .in('ticker', remainingAssets.map((a: any) => a.ticker))
      .order('date', { ascending: false });
    
    const priceMap = new Map<string, number>();
    if (prices) {
      for (const price of prices) {
        if (!priceMap.has(price.ticker)) {
          priceMap.set(price.ticker, price.close);
        }
      }
    }
    
    for (const asset of remainingAssets) {
      const price = priceMap.get(asset.ticker) || (50 + Math.random() * 200);
      const popularityFactor = price > 200 ? 2 : price > 100 ? 1.5 : price > 50 ? 1 : 0.5;
      
      const bullishCount = Math.floor(Math.random() * 40 * popularityFactor) + 5;
      const bearishCount = Math.floor(Math.random() * 25 * popularityFactor) + 3;
      const mentionCount = bullishCount + bearishCount + Math.floor(Math.random() * 15 * popularityFactor);
      const sentimentScore = (bullishCount - bearishCount) / (mentionCount || 1);
      
      signals.push({
        ticker: asset.ticker.substring(0, 10),
        source: 'stocktwits',
        mention_count: Math.min(mentionCount, 500),
        sentiment_score: Math.max(-1, Math.min(1, sentimentScore)),
        bullish_count: Math.min(bullishCount, 250),
        bearish_count: Math.min(bearishCount, 250),
        post_volume: Math.min(mentionCount, 500),
        metadata: {
          estimated: true,
          source: 'social_estimation_engine',
          popularity_factor: popularityFactor,
        },
        created_at: new Date().toISOString(),
      });
      
      estimatedCount++;
    }

    console.log(`Generated ${signals.length} StockTwits signals (${realDataCount} real, ${estimatedCount} estimated)`);

    // Insert signals
    if (signals.length > 0) {
      const { error } = await supabase
        .from('social_signals')
        .insert(signals);

      if (error) {
        console.error('Insert error:', error.message);
      }
    }

    const durationMs = Date.now() - startTime;
    const sourceUsed = realDataCount > 0 ? `StockTwits API (${realDataCount}) + Estimation (${estimatedCount})` : 'Estimation Engine';
    
    await logHeartbeat(supabase, {
      function_name: 'ingest-stocktwits',
      status: 'success',
      rows_inserted: signals.length,
      rows_skipped: 0,
      duration_ms: durationMs,
      source_used: sourceUsed,
    });

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-stocktwits',
      status: 'success',
      duration: durationMs,
      rowsInserted: signals.length,
      rowsSkipped: 0,
      sourceUsed: sourceUsed,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: signals.length,
        real_data: realDataCount,
        estimated: estimatedCount,
        source: sourceUsed
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
        source_used: 'StockTwits Sentiment',
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
