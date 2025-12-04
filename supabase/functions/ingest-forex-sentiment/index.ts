import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { IngestLogger } from "../_shared/log-ingest.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { callPerplexity } from "../_shared/perplexity-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process in batches of 10 pairs per API call
const BATCH_SIZE = 10;

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
    console.log('😊 Starting forex sentiment ingestion via Perplexity (batched)...');

    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!perplexityKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
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

    // Process in batches
    for (let i = 0; i < forexPairs.length; i += BATCH_SIZE) {
      const batch = forexPairs.slice(i, i + BATCH_SIZE);
      const tickers = batch.map(p => p.ticker).join(', ');
      
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}: ${tickers}`);
      
      try {
        const prompt = `Provide current retail forex sentiment data for these pairs: ${tickers}

For EACH pair, provide (based on broker positioning from IG, Oanda, Myfxbook):
- Ticker
- Retail Long %: (0-100)
- Retail Short %: (0-100)
- News Sentiment: (-1 to 1)
- News Count: (24h)
- Social Mentions: (estimated)

Format as JSON array:
[{"ticker":"EUR/USD","long":65,"short":35,"news_sentiment":0.3,"news_count":45,"social":1200}, ...]`;

        const content = await callPerplexity(
          [{ role: 'user', content: prompt }],
          { apiKey: perplexityKey, model: 'sonar', temperature: 0.2, maxTokens: 2000 }
        );

        // Parse JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const sentimentArray = JSON.parse(jsonMatch[0]);
          
          for (const item of sentimentArray) {
            const pair = batch.find(p => 
              p.ticker.includes(item.ticker) || 
              item.ticker.includes(p.ticker) ||
              p.ticker.replace('/', '') === item.ticker.replace('/', '')
            );
            
            if (!pair) continue;

            const retailLongPct = item.long ?? item.retail_long ?? 50;
            const retailShortPct = item.short ?? item.retail_short ?? 50;
            
            let retailSentiment = 'neutral';
            if (retailLongPct > 60) retailSentiment = 'bullish';
            if (retailShortPct > 60) retailSentiment = 'bearish';

            const sentimentData = {
              ticker: pair.ticker,
              asset_id: pair.id,
              retail_long_pct: retailLongPct,
              retail_short_pct: retailShortPct,
              retail_sentiment: retailSentiment,
              news_sentiment_score: item.news_sentiment ?? 0,
              news_count: item.news_count ?? 0,
              social_mentions: item.social ?? item.social_mentions ?? 0,
              social_sentiment_score: (item.news_sentiment ?? 0) * 0.8,
              source: 'Perplexity AI',
            };
            
            const { error } = await supabaseClient
              .from('forex_sentiment')
              .insert(sentimentData);

            if (error) {
              console.error(`Error inserting ${pair.ticker}:`, error.message);
              errorCount++;
            } else {
              successCount++;

              // Create signal for extreme sentiment
              if (retailLongPct > 75 || retailShortPct > 75) {
                await supabaseClient.from('signals').insert({
                  signal_type: 'sentiment_extreme',
                  asset_id: pair.id,
                  direction: retailLongPct > 75 ? 'down' : 'up',
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
          }
        }
        
        // Small delay between batches
        if (i + BATCH_SIZE < forexPairs.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (batchError) {
        console.error(`Batch error:`, batchError);
        errorCount += batch.length;
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
    
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-forex-sentiment',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: errorCount,
      sourceUsed: 'Perplexity AI',
      metadata: { pairs_processed: forexPairs.length, batches: Math.ceil(forexPairs.length / BATCH_SIZE) }
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: forexPairs.length,
        successful: successCount,
        errors: errorCount,
        message: `Ingested sentiment for ${successCount} forex pairs`
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
