import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schemas for external API responses
const StockTwitsMessageSchema = z.object({
  id: z.number(),
  body: z.string().max(5000).optional(),
  created_at: z.string().optional(),
  user: z.object({
    username: z.string().max(100).optional(),
  }).optional(),
  entities: z.object({
    sentiment: z.object({
      basic: z.enum(['Bullish', 'Bearish']).optional(),
    }).optional(),
  }).optional(),
});

const StockTwitsResponseSchema = z.object({
  messages: z.array(StockTwitsMessageSchema).max(100).default([]),
  symbol: z.object({
    id: z.number().optional(),
    title: z.string().max(200).optional(),
    watchlist_count: z.number().optional(),
  }).optional(),
});

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

    console.log('Starting StockTwits sentiment ingestion...');

    // Fetch stocks dynamically from database
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('ticker')
      .in('asset_class', ['stock', 'crypto'])
      .limit(30); // Process 30 assets per run for StockTwits sentiment
    
    if (assetsError) throw assetsError;
    const tickers = assets?.map((a: any) => a.ticker) || [];
    const signals = [];

    for (const ticker of tickers) {
      console.log(`Fetching StockTwits data for ${ticker}...`);
      
      try {
        const response = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`);
        
        if (!response.ok) {
          console.log(`Failed to fetch ${ticker}: ${response.status}`);
          continue;
        }

        const rawData = await response.json();
        
        // Validate and sanitize API response
        let validatedData;
        try {
          validatedData = StockTwitsResponseSchema.parse(rawData);
        } catch (validationError) {
          console.error(`Validation failed for ${ticker}:`, validationError);
          continue;
        }

        const messages = validatedData.messages;

        let bullishCount = 0;
        let bearishCount = 0;
        let totalSentiment = 0;

        for (const msg of messages) {
          if (msg.entities?.sentiment) {
            if (msg.entities.sentiment.basic === 'Bullish') {
              bullishCount++;
              totalSentiment += 1;
            } else if (msg.entities.sentiment.basic === 'Bearish') {
              bearishCount++;
              totalSentiment -= 1;
            }
          }
        }

        const sentimentScore = messages.length > 0 ? totalSentiment / messages.length : 0;

        signals.push({
          ticker: ticker.toUpperCase().substring(0, 10), // Sanitize ticker
          source: 'stocktwits',
          mention_count: Math.min(messages.length, 1000), // Cap at reasonable limit
          sentiment_score: Math.max(-1, Math.min(1, sentimentScore)),
          bullish_count: Math.min(bullishCount, 1000),
          bearish_count: Math.min(bearishCount, 1000),
          post_volume: Math.min(messages.length, 1000),
          metadata: {
            symbol_id: validatedData.symbol?.id,
            symbol_title: validatedData.symbol?.title?.substring(0, 200),
            watchlist_count: validatedData.symbol?.watchlist_count,
          },
          created_at: new Date().toISOString(),
        });

        // Rate limiting: wait 1 second between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`Error processing ${ticker}:`, err);
      }
    }

    // Insert into database
    if (signals.length > 0) {
      const { error } = await supabase
        .from('social_signals')
        .insert(signals);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${signals.length} StockTwits records`);
    }

    const durationMs = Date.now() - startTime;
    await logHeartbeat(supabase, {
      function_name: 'ingest-stocktwits',
      status: 'success',
      rows_inserted: signals.length,
      rows_skipped: 0,
      duration_ms: durationMs,
      source_used: 'StockTwits API',
    });

    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-stocktwits',
      status: 'success',
      duration: durationMs,
      rowsInserted: signals.length,
      rowsSkipped: 0,
      sourceUsed: 'StockTwits API',
    });

    return new Response(
      JSON.stringify({ success: true, count: signals.length }),
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
        source_used: 'StockTwits API',
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
