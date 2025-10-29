import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting StockTwits sentiment ingestion for user ${user.id}...`);

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
        .insert(signals);

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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
