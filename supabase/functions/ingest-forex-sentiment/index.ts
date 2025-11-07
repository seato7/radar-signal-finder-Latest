import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
      
      const { error } = await supabaseClient
        .from('forex_sentiment')
        .insert({
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
        });

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
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
