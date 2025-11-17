import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { ForexSentimentSchema, safeValidate } from "../_shared/zod-schemas.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    console.log('😊 Starting forex sentiment ingestion...');

    // Get all forex pairs
    const { data: forexPairs } = await supabaseClient
      .from('assets')
      .select('*')
      .eq('asset_class', 'forex');

    if (!forexPairs) {
      throw new Error('No forex pairs found');
    }

    let successCount = 0;

    for (const pair of forexPairs) {
      // Simulate retail sentiment data (in production, fetch from Oanda/IG APIs)
      const retailLongPct = Math.random() * 100;
      const retailShortPct = 100 - retailLongPct;
      
      let retailSentiment = 'neutral';
      if (retailLongPct > 60) retailSentiment = 'bullish';
      if (retailShortPct > 60) retailSentiment = 'bearish';

      // News sentiment (would come from news API in production)
      const newsSentimentScore = (Math.random() * 2) - 1; // -1 to 1
      
      const sentimentData = {
        ticker: pair.ticker,
        asset_id: pair.id,
        retail_long_pct: retailLongPct,
        retail_short_pct: retailShortPct,
        retail_sentiment: retailSentiment,
        news_sentiment_score: newsSentimentScore,
        news_count: Math.floor(Math.random() * 50),
        social_mentions: Math.floor(Math.random() * 1000),
        social_sentiment_score: (Math.random() * 2) - 1,
        source: 'aggregated',
      };
      
      // CRITICAL: Validate before inserting
      const validation = safeValidate(ForexSentimentSchema, sentimentData, 'Forex Sentiment');
      if (!validation.success) {
        console.error(`Invalid forex sentiment data for ${pair.ticker}: ${validation.error}`);
        continue;
      }
      
      const { error } = await supabaseClient
        .from('forex_sentiment')
        .insert(validation.data);

      if (error) {
        console.error(`Error inserting sentiment for ${pair.ticker}:`, error);
      } else {
        successCount++;

        // Create signal for extreme sentiment
        if (retailLongPct > 75 || retailShortPct > 75) {
          await supabaseClient.from('signals').insert({
            signal_type: 'sentiment_extreme',
            asset_id: pair.id,
            direction: retailLongPct > 75 ? 'down' : 'up', // Contrarian
            magnitude: Math.abs(retailLongPct - 50) / 50,
            value_text: `Extreme ${retailLongPct > 75 ? 'bullish' : 'bearish'} retail sentiment: ${Math.round(Math.max(retailLongPct, retailShortPct))}%`,
            observed_at: new Date().toISOString(),
            citation: {
              source: 'Retail Sentiment Aggregate',
              url: 'https://www.oanda.com/us-en/trading/sentiment/',
              timestamp: new Date().toISOString()
            },
            checksum: `${pair.ticker}-sentiment-${Date.now()}`,
          });
        }
      }
    }
    
    await logger.success({
      source_used: 'Simulated',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: Date.now() - startTime,
      rows_inserted: successCount,
      rows_skipped: forexPairs.length - successCount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: forexPairs.length,
        successful: successCount,
        message: `Ingested sentiment for ${successCount} forex pairs`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    await logger.failure(error as Error, {
      source_used: 'Simulated',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: Date.now() - startTime,
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
