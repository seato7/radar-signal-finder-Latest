import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PerplexityResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().max(10000),
    }),
  })).min(1),
});

const validateSentiment = (score: number): number => {
  if (isNaN(score) || !isFinite(score)) return 0;
  return Math.max(-1, Math.min(1, score));
};

const sanitizeTicker = (ticker: string): string => {
  return ticker.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 10);
};

// PHASE 1: Batch processing for performance optimization
async function fetchNewsForTicker(ticker: string, perplexityKey: string) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${perplexityKey}`,
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

  // PHASE 5: Perplexity rate limit handling
  if (response.status === 429) {
    console.log(`⚠️ Rate limit hit for ${ticker}, will retry`);
    throw new Error('RATE_LIMIT');
  }

  if (!response.ok) {
    console.log(`Failed to fetch news for ${ticker}: ${response.status}`);
    return null;
  }

  const rawData = await response.json();
  const validatedData = PerplexityResponseSchema.parse(rawData);
  return { ticker, content: validatedData.choices[0].message.content };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // PHASE 2: Log to ingest_logs
  const logId = crypto.randomUUID();
  await supabase.from('ingest_logs').insert({
    id: logId,
    etl_name: 'ingest-breaking-news',
    status: 'running',
    started_at: new Date().toISOString(),
    source_used: 'unknown',
  });

  try {
    console.log('Starting breaking news ingestion...');
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
    const newsItems = [];
    let sourceUsed = 'Simulated';

    // No API key - use sample data
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

      await supabase.from('breaking_news').insert(newsItems);
      await supabase.from('ingest_logs').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        rows_inserted: newsItems.length,
        source_used: sourceUsed,
      }).eq('id', logId);

      return new Response(
        JSON.stringify({ success: true, count: newsItems.length, note: 'Sample data used', source: sourceUsed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PHASE 1: Parallel batch processing (3 tickers at a time) - HUGE performance improvement
    sourceUsed = 'Perplexity';
    const batchSize = 3;
    let retryCount = 0;
    const maxRetries = 3;

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      console.log(`Processing batch: ${batch.join(', ')}`);
      
      try {
        const results = await Promise.allSettled(
          batch.map(ticker => fetchNewsForTicker(ticker, perplexityKey))
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            const { ticker, content } = result.value;
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
                  metadata: { raw_content: block.substring(0, 2000), source_used: sourceUsed },
                  created_at: new Date().toISOString(),
                });
              }
            }
          } else if (result.status === 'rejected' && result.reason?.message === 'RATE_LIMIT') {
            // PHASE 5: Retry on rate limit with exponential backoff
            if (retryCount < maxRetries) {
              const backoffMs = 1000 * Math.pow(2, retryCount);
              console.log(`Rate limit hit, retrying batch in ${backoffMs}ms (attempt ${retryCount + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              retryCount++;
              i -= batchSize; // Retry this batch
              break;
            } else {
              console.error('Max retries reached for rate limit');
            }
          }
        }

        // Small delay between batches (500ms instead of 2000ms per ticker = 4x faster!)
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Error processing batch ${batch.join(', ')}:`, err);
      }
    }

    // Fallback to sample data if no news was fetched
    if (newsItems.length === 0) {
      console.log('No news fetched from API, generating sample data');
      sourceUsed = 'Simulated';
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
            metadata: { sample: true, source_used: sourceUsed },
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    if (newsItems.length > 0) {
      const { error } = await supabase.from('breaking_news').insert(newsItems);
      if (error) throw error;
      console.log(`Inserted ${newsItems.length} breaking news items from ${sourceUsed}`);
    }

    // PHASE 2: Update ingest log with source tracking
    await supabase.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      rows_inserted: newsItems.length,
      source_used: sourceUsed,
      fallback_count: sourceUsed === 'Simulated' ? 1 : 0,
    }).eq('id', logId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: newsItems.length,
        source: sourceUsed,
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ingest-breaking-news:', error);
    
    await supabase.from('ingest_logs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      error_message: error instanceof Error ? error.message : 'Unknown error',
    }).eq('id', logId);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
