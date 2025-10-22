import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting StockTwits sentiment ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Popular tickers to track
    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
    const signals = [];

    for (const ticker of tickers) {
      console.log(`Fetching StockTwits data for ${ticker}...`);
      
      try {
        const response = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`);
        
        if (!response.ok) {
          console.log(`Failed to fetch ${ticker}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const messages = data.messages || [];

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
          ticker,
          source: 'stocktwits',
          mention_count: messages.length,
          sentiment_score: Math.max(-1, Math.min(1, sentimentScore)),
          bullish_count: bullishCount,
          bearish_count: bearishCount,
          post_volume: messages.length,
          metadata: {
            symbol_id: data.symbol?.id,
            symbol_title: data.symbol?.title,
            watchlist_count: data.symbol?.watchlist_count,
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
        .upsert(signals, { onConflict: 'ticker,source' });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${signals.length} StockTwits records`);
    }

    return new Response(
      JSON.stringify({ success: true, count: signals.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-stocktwits:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
