import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for Perplexity API responses
const PerplexityResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().max(10000),
    }),
  })).min(1),
});

// Sanitize and validate sentiment score
const validateSentiment = (score: number): number => {
  if (isNaN(score) || !isFinite(score)) return 0;
  return Math.max(-1, Math.min(1, score));
};

// Sanitize ticker symbol
const sanitizeTicker = (ticker: string): string => {
  return ticker.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 10);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting breaking news ingestion...');
    
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');

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
            model: 'sonar',
            messages: [
              {
                role: 'system',
                content: 'You are a financial data provider. Return only the requested data without explanations.'
              },
              {
                role: 'user',
                content: `List 3 recent news headlines for ${ticker} stock from the last 24 hours. For each, provide: HEADLINE: [headline text], SUMMARY: [one sentence], SOURCE: [source name], SENTIMENT: [number from -1 to 1]. Separate each news item with "---".`
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

        const rawData = await response.json();
        
        // Validate API response structure
        let validatedData;
        try {
          validatedData = PerplexityResponseSchema.parse(rawData);
        } catch (validationError) {
          console.error(`Perplexity API response validation failed for ${ticker}:`, validationError);
          continue;
        }
        
        const content = validatedData.choices[0].message.content;
        
        // Split by separator and parse each news item (limit to 10 blocks)
        const newsBlocks = content.split('---').filter((block: string) => block.trim()).slice(0, 10);
        
        for (const block of newsBlocks) {
          const headlineMatch = block.match(/HEADLINE:\s*(.+?)(?=SUMMARY:|$)/s);
          const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=SOURCE:|$)/s);
          const sourceMatch = block.match(/SOURCE:\s*(.+?)(?=SENTIMENT:|$)/s);
          const sentimentMatch = block.match(/SENTIMENT:\s*(-?\d+\.?\d*)/);
          
          if (headlineMatch) {
            newsItems.push({
              ticker: sanitizeTicker(ticker),
              headline: headlineMatch[1].trim().substring(0, 500),
              summary: summaryMatch ? summaryMatch[1].trim().substring(0, 1000) : 'No summary available',
              source: sourceMatch ? sourceMatch[1].trim().substring(0, 200) : 'Perplexity',
              url: null,
              published_at: new Date().toISOString(),
              sentiment_score: sentimentMatch ? validateSentiment(parseFloat(sentimentMatch[1])) : 0,
              relevance_score: 0.8,
              metadata: {
                raw_content: block.substring(0, 2000) // Limit metadata size
              },
              created_at: new Date().toISOString(),
            });
          }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.error(`Error processing ${ticker}:`, err);
      }
    }

    // Fall back to sample data if no news was fetched
    if (newsItems.length === 0) {
      console.log('No news fetched from API, generating sample data');
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
