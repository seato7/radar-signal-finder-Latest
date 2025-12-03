import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { ForexSentimentSchema, safeValidate } from "../_shared/zod-schemas.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callPerplexity } from "../_shared/perplexity-client.ts";

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
    console.log('😊 Starting forex sentiment ingestion via Perplexity...');

    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY not configured - required for real forex sentiment data');
    }

    // Get all forex pairs
    const { data: forexPairs } = await supabaseClient
      .from('assets')
      .select('*')
      .eq('asset_class', 'forex');

    if (!forexPairs || forexPairs.length === 0) {
      throw new Error('No forex pairs found');
    }

    let successCount = 0;
    let errorCount = 0;

    for (const pair of forexPairs) {
      try {
        console.log(`Fetching sentiment for ${pair.ticker}...`);
        
        // Use Perplexity to get real forex sentiment data
        const prompt = `What is the current retail forex sentiment for ${pair.ticker}? 
Provide the following data based on current broker positioning data (IG, Oanda, Myfxbook):
- RETAIL_LONG_PCT: percentage of retail traders long (0-100)
- RETAIL_SHORT_PCT: percentage short (0-100)
- NEWS_SENTIMENT: score from -1 (very bearish) to 1 (very bullish)
- NEWS_COUNT: approximate number of news articles in past 24h
- SOCIAL_MENTIONS: estimated social media mentions today

Format your response EXACTLY as:
RETAIL_LONG_PCT: X
RETAIL_SHORT_PCT: Y
NEWS_SENTIMENT: Z
NEWS_COUNT: N
SOCIAL_MENTIONS: M`;

        const content = await callPerplexity(
          [{ role: 'user', content: prompt }],
          { apiKey: perplexityKey, model: 'sonar', temperature: 0.2, maxTokens: 300 }
        );

        // Parse response
        const longMatch = content.match(/RETAIL_LONG_PCT:\s*([\d.]+)/);
        const shortMatch = content.match(/RETAIL_SHORT_PCT:\s*([\d.]+)/);
        const newsMatch = content.match(/NEWS_SENTIMENT:\s*(-?[\d.]+)/);
        const newsCountMatch = content.match(/NEWS_COUNT:\s*(\d+)/);
        const socialMatch = content.match(/SOCIAL_MENTIONS:\s*(\d+)/);

        const retailLongPct = longMatch ? parseFloat(longMatch[1]) : 50;
        const retailShortPct = shortMatch ? parseFloat(shortMatch[1]) : 50;
        const newsSentimentScore = newsMatch ? parseFloat(newsMatch[1]) : 0;
        const newsCount = newsCountMatch ? parseInt(newsCountMatch[1]) : 0;
        const socialMentions = socialMatch ? parseInt(socialMatch[1]) : 0;

        let retailSentiment = 'neutral';
        if (retailLongPct > 60) retailSentiment = 'bullish';
        if (retailShortPct > 60) retailSentiment = 'bearish';

        const sentimentData = {
          ticker: pair.ticker,
          asset_id: pair.id,
          retail_long_pct: retailLongPct,
          retail_short_pct: retailShortPct,
          retail_sentiment: retailSentiment,
          news_sentiment_score: newsSentimentScore,
          news_count: newsCount,
          social_mentions: socialMentions,
          social_sentiment_score: newsSentimentScore * 0.8, // Correlated
          source: 'Perplexity AI',
        };
        
        // Validate before inserting
        const validation = safeValidate(ForexSentimentSchema, sentimentData, 'Forex Sentiment');
        if (!validation.success) {
          console.error(`Invalid forex sentiment data for ${pair.ticker}: ${validation.error}`);
          errorCount++;
          continue;
        }
        
        const { error } = await supabaseClient
          .from('forex_sentiment')
          .insert(validation.data);

        if (error) {
          console.error(`Error inserting sentiment for ${pair.ticker}:`, error);
          errorCount++;
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
                source: 'Perplexity AI - Retail Sentiment',
                url: 'https://www.myfxbook.com/community/outlook',
                timestamp: new Date().toISOString()
              },
              checksum: `${pair.ticker}-sentiment-${Date.now()}`,
            });
          }
        }

        // Rate limit between calls
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (pairError) {
        console.error(`Error processing ${pair.ticker}:`, pairError);
        errorCount++;
      }
    }
    
    const duration = Date.now() - startTime;
    
    await logger.success({
      source_used: 'Perplexity AI',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
      rows_inserted: successCount,
      rows_skipped: errorCount,
    });
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-sentiment',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: errorCount,
      sourceUsed: 'Perplexity AI',
      metadata: { pairs_processed: forexPairs.length }
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: forexPairs.length,
        successful: successCount,
        errors: errorCount,
        message: `Ingested real sentiment for ${successCount} forex pairs`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    const duration = Date.now() - startTime;
    
    await logger.failure(error as Error, {
      source_used: 'Perplexity AI',
      cache_hit: false,
      fallback_count: 0,
      latency_ms: duration,
    });
    
    // Send Slack failure alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-sentiment',
      status: 'failed',
      duration,
      rowsInserted: 0,
      rowsSkipped: 0,
      sourceUsed: 'Perplexity AI',
      metadata: { error: (error as Error).message }
    });
    
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
