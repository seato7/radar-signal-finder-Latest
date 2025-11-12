import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { redisCache } from "../_shared/redis-cache.ts";

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

// Helper: Log to ingest_failures table
async function logFailure(
  supabase: any,
  ticker: string | null,
  errorType: string,
  errorMessage: string,
  statusCode: number | null
) {
  await supabase.from('ingest_failures').insert({
    etl_name: 'ingest-breaking-news',
    ticker,
    error_type: errorType,
    error_message: errorMessage,
    status_code: statusCode,
    retry_count: 0,
    failed_at: new Date().toISOString()
  });
}

async function fetchNewsForTicker(ticker: string, perplexityKey: string, supabase: any) {
  try {
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

    // Handle authentication errors explicitly
    if (response.status === 401) {
      const errorMsg = 'Perplexity API authentication failed - invalid or expired API key';
      console.error(`❌ AUTH ERROR for ${ticker}: ${errorMsg}`);
      await logFailure(supabase, ticker, 'api_auth', errorMsg, 401);
      throw new Error('AUTH_ERROR');
    }

    if (response.status === 429) {
      console.log(`⚠️ Rate limit hit for ${ticker}, will retry`);
      await logFailure(supabase, ticker, 'rate_limit', 'Perplexity rate limit exceeded', 429);
      throw new Error('RATE_LIMIT');
    }

    if (!response.ok) {
      const errorMsg = `Failed to fetch news for ${ticker}: ${response.status}`;
      console.log(errorMsg);
      await logFailure(supabase, ticker, 'network', errorMsg, response.status);
      return null;
    }

    const rawData = await response.json();
    const validatedData = PerplexityResponseSchema.parse(rawData);
    return { ticker, content: validatedData.choices[0].message.content };
  } catch (err) {
    if (err instanceof Error && !err.message.includes('AUTH_ERROR') && !err.message.includes('RATE_LIMIT')) {
      await logFailure(supabase, ticker, 'unknown', err.message, null);
    }
    throw err;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const logId = crypto.randomUUID();
  await supabase.from('ingest_logs').insert({
    id: logId,
    etl_name: 'ingest-breaking-news',
    status: 'running',
    started_at: new Date().toISOString(),
    source_used: 'Perplexity API',
    cache_hit: false,
    fallback_count: 0,
    latency_ms: 0,
  });

  try {
    console.log('Starting breaking news ingestion...');
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    const tickers = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ'];
    const newsItems = [];
    let sourceUsed = 'Perplexity API';
    let cacheHit = false;
    let fallbackUsed = false;
    let authFailures = 0;
    const fetchStartTime = Date.now();

    // Check if API key is missing or invalid
    if (!perplexityKey) {
      console.log('⚠️ No Perplexity API key, using sample news data');
      sourceUsed = 'Simulated';
      fallbackUsed = true;
      
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
        fallback_count: 1,
      }).eq('id', logId);

      return new Response(
        JSON.stringify({ success: true, count: newsItems.length, note: 'Sample data used (no API key)', source: sourceUsed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check last 10 runs for consecutive fallback pattern
    const { data: recentLogs } = await supabase
      .from('ingest_logs')
      .select('source_used, fallback_count, status')
      .eq('etl_name', 'ingest-breaking-news')
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (recentLogs && recentLogs.length >= 10) {
      const consecutiveFallbacks = recentLogs.slice(0, 10).every(log => 
        log.source_used === 'Simulated' || log.fallback_count > 0
      );
      
      if (consecutiveFallbacks) {
        const errorMsg = '🚨 HALTED: 10 consecutive runs used fallback - Perplexity API authentication failing';
        console.error(errorMsg);
        
        await supabase.from('ingest_logs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_seconds: 0,
          error_message: errorMsg,
        }).eq('id', logId);
        
        // Send Slack alert
        const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
        if (slackWebhook) {
          await fetch(slackWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 *CRITICAL: ingest-breaking-news HALTED*\n${errorMsg}\n\n*Action Required:* Verify PERPLEXITY_API_KEY in secrets. Check API status at https://www.perplexity.ai/settings/api`
            })
          });
        }
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: errorMsg,
          recommendation: 'Verify Perplexity API key and quota'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Process tickers in batches
    sourceUsed = 'Perplexity API';
    const batchSize = 3;
    let retryCount = 0;
    const maxRetries = 3;

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      console.log(`Processing batch: ${batch.join(', ')}`);
      
      try {
        // Check Redis cache first for each ticker in batch
        const cachePromises = batch.map(ticker => redisCache.get(`news:${ticker}`));
        const cacheResults = await Promise.all(cachePromises);
        
        const tickersToFetch: string[] = [];
        for (let j = 0; j < batch.length; j++) {
          const cacheResult = cacheResults[j];
          if (cacheResult.hit && cacheResult.data) {
            console.log(`✅ Cache HIT for news:${batch[j]} (${cacheResult.age_seconds?.toFixed(1)}s old)`);
            cacheHit = true;
            newsItems.push(...cacheResult.data);
          } else {
            console.log(`❌ Cache MISS for news:${batch[j]}`);
            tickersToFetch.push(batch[j]);
          }
        }

        if (tickersToFetch.length === 0) {
          continue; // All cached
        }

        const results = await Promise.allSettled(
          tickersToFetch.map(ticker => fetchNewsForTicker(ticker, perplexityKey, supabase))
        );

        for (const result of results) {
          if (result.status === 'rejected') {
            if (result.reason?.message === 'AUTH_ERROR') {
              authFailures++;
            } else if (result.reason?.message === 'RATE_LIMIT') {
              if (retryCount < maxRetries) {
                const backoffMs = 1000 * Math.pow(2, retryCount);
                console.log(`Rate limit hit, retrying batch in ${backoffMs}ms (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                retryCount++;
                i -= batchSize; // Retry this batch
                break;
              }
            }
          } else if (result.status === 'fulfilled' && result.value) {
            const { ticker, content } = result.value;
            const newsBlocks = content.split('---').filter((block: string) => block.trim()).slice(0, 10);
            const tickerNews = [];
            
            for (const block of newsBlocks) {
              const headlineMatch = block.match(/HEADLINE:\s*(.+?)(?=SUMMARY:|$)/s);
              const summaryMatch = block.match(/SUMMARY:\s*(.+?)(?=SOURCE:|$)/s);
              const sourceMatch = block.match(/SOURCE:\s*(.+?)(?=SENTIMENT:|$)/s);
              const sentimentMatch = block.match(/SENTIMENT:\s*(-?\d+\.?\d*)/);
              
              if (headlineMatch) {
                const newsItem = {
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
                  last_updated_at: new Date().toISOString(),
                };
                tickerNews.push(newsItem);
                newsItems.push(newsItem);
              }
            }

            // Cache the fetched news
            if (tickerNews.length > 0) {
              await redisCache.set(`news:${ticker}`, tickerNews, 'Perplexity API');
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Error processing batch ${batch.join(', ')}:`, err);
      }
    }

    // If all API calls failed due to auth, use fallback
    if (newsItems.length === 0 || authFailures >= tickers.length / 2) {
      if (authFailures > 0) {
        console.error(`⚠️ ${authFailures} authentication failures detected, using sample data`);
        sourceUsed = 'Simulated (Auth Failed)';
      } else {
        console.log('No news fetched from API, generating sample data');
        sourceUsed = 'Simulated';
      }
      
      fallbackUsed = true;
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
            metadata: { sample: true, source_used: sourceUsed, auth_failures: authFailures },
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

    const latency = Date.now() - fetchStartTime;
    await supabase.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      rows_inserted: newsItems.length,
      source_used: sourceUsed,
      fallback_count: fallbackUsed ? 1 : 0,
      cache_hit: cacheHit,
      latency_ms: latency,
      metadata: { auth_failures: authFailures },
    }).eq('id', logId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        count: newsItems.length,
        source: sourceUsed,
        auth_failures: authFailures,
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
