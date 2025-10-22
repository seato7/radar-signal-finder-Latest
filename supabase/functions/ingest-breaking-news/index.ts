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
    console.log('Starting breaking news ingestion...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
    const newsItems = [];

    // If no API key, use sample data
    if (!perplexityKey) {
      console.log('No Perplexity API key, generating sample news data');
      const headlines = [
        'Company announces record quarterly earnings',
        'New product launch exceeds expectations',
        'Stock reaches all-time high on positive sentiment',
        'Analyst upgrades rating citing strong fundamentals',
        'Partnership deal announced with major tech firm'
      ];

      for (const ticker of tickers) {
        for (let i = 0; i < 2; i++) {
          newsItems.push({
            ticker,
            headline: headlines[Math.floor(Math.random() * headlines.length)],
            summary: 'Sample breaking news item for demonstration purposes.',
            source: 'Market Wire',
            url: null,
            published_at: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
            sentiment_score: (Math.random() * 2) - 1,
            relevance_score: 0.8,
            metadata: { sample: true },
            created_at: new Date().toISOString(),
          });
        }
      }

      const { error } = await supabase
        .from('breaking_news')
        .insert(newsItems);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, count: newsItems.length, note: 'Sample data used' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (const ticker of tickers) {
      console.log(`Fetching breaking news for ${ticker}...`);
      
      try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityKey!}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [
              {
                role: 'system',
                content: 'You are a financial news analyzer. Provide concise, factual news headlines with sentiment scores.'
              },
              {
                role: 'user',
                content: `Find the top 3 most recent breaking news items for ${ticker} in the last 24 hours. For each news item, provide: headline, brief summary (1 sentence), source, and sentiment score from -1 (bearish) to 1 (bullish). Format as JSON array.`
              }
            ],
            temperature: 0.2,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          console.log(`Failed to fetch news for ${ticker}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        try {
          const parsedNews = JSON.parse(content);
          const newsArray = Array.isArray(parsedNews) ? parsedNews : [parsedNews];
          
          for (const item of newsArray) {
            newsItems.push({
              ticker,
              headline: item.headline || item.title || 'Breaking News',
              summary: item.summary || item.description || '',
              source: item.source || 'Perplexity',
              url: item.url || null,
              published_at: new Date().toISOString(),
              sentiment_score: item.sentiment_score || item.sentiment || 0,
              relevance_score: item.relevance_score || 0.8,
              metadata: {
                raw_content: item
              },
              created_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error(`Error parsing news for ${ticker}:`, err);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`Error processing ${ticker}:`, err);
      }
    }

    if (newsItems.length > 0) {
      const { error } = await supabase
        .from('breaking_news')
        .insert(newsItems);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log(`Inserted ${newsItems.length} breaking news items`);
    }

    return new Response(
      JSON.stringify({ success: true, count: newsItems.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-breaking-news:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
