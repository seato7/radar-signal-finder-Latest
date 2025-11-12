import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { YahooResponseSchema, PerplexityResponseSchema, safeValidate } from "../_shared/zod-schemas.ts";
import { redisCache } from "../_shared/redis-cache.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Exponential backoff with jitter
async function retryWithBackoff(
  fn: () => Promise<any>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff with jitter (0-20% random variation)
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = exponentialDelay * 0.2 * Math.random();
      const totalDelay = exponentialDelay + jitter;
      
      console.log(`⏳ Retry ${attempt + 1}/${maxRetries} after ${totalDelay.toFixed(0)}ms`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }
}

// Helper: Log to ingest_failures table
async function logFailure(
  supabase: any,
  etlName: string,
  ticker: string | null,
  errorType: string,
  errorMessage: string,
  statusCode: number | null,
  retryCount: number
) {
  await supabase.from('ingest_failures').insert({
    etl_name: etlName,
    ticker,
    error_type: errorType,
    error_message: errorMessage,
    status_code: statusCode,
    retry_count: retryCount,
    failed_at: new Date().toISOString(),
    metadata: { timestamp: new Date().toISOString() }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { IngestLogger } = await import('../_shared/log-ingest.ts');
  const logger = new IngestLogger(supabaseClient, 'ingest-prices-yahoo');
  await logger.start();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Starting Yahoo Finance price ingestion...');
    
    // Check last 3 runs for consecutive fallback-only pattern
    const { data: recentLogs } = await supabaseClient
      .from('ingest_logs')
      .select('source_used, fallback_count')
      .eq('etl_name', 'ingest-prices-yahoo')
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(3);
    
    if (recentLogs && recentLogs.length >= 3) {
      const allFallbackOnly = recentLogs.every(log => 
        log.source_used?.includes('AI Fallback') && log.fallback_count > 20
      );
      
      if (allFallbackOnly) {
        const errorMsg = '⚠️ Stopped: 3 consecutive runs used 100% AI fallback - primary Yahoo Finance API appears down';
        console.error(errorMsg);
        await logger.failure(new Error(errorMsg));
        
        // Send Slack alert
        const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
        if (slackWebhook) {
          await fetch(slackWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 *CRITICAL: ingest-prices-yahoo HALTED*\n${errorMsg}\n\n*Action Required:* Check Yahoo Finance API status and authentication.`
            })
          });
        }
        
        return new Response(JSON.stringify({ 
          success: false, 
          error: errorMsg,
          recommendation: 'Check Yahoo Finance API credentials and rate limits'
        }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Fetch all assets
    const assetsRes = await fetch(`${supabaseUrl}/rest/v1/assets?select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const assets = await assetsRes.json();
    
    let inserted = 0;
    let skipped = 0;
    let fallbackUsed = 0;
    let cacheHits = 0;
    const errors: string[] = [];
    const startTime = Date.now();
    
    // Process each asset
    for (const asset of assets) {
      try {
        const symbol = asset.ticker;
        
        // Check Redis cache first (5s TTL)
        const cacheKey = `prices:${symbol}`;
        const cached = await redisCache.get(cacheKey);
        
        if (cached.hit && cached.data) {
          console.log(`✅ Cache HIT for ${symbol} (${cached.age_seconds?.toFixed(1)}s old)`);
          cacheHits++;
          inserted += cached.data.length || 0;
          continue;
        }
        
        console.log(`❌ Cache MISS for ${symbol}`);
        
        const period = '1d';
        const range = '1y';
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${period}&range=${range}`;
        
        let data = null;
        let fetchError = null;
        let sourceUsed = 'Yahoo Finance';
        let statusCode: number | null = null;

        // Try Yahoo Finance with retry logic
        try {
          const yahooFetch = async () => {
            const response = await fetch(yahooUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            statusCode = response.status;
            
            // Handle authentication errors
            if (response.status === 401 || response.status === 403) {
              throw new Error(`AUTH_ERROR:${response.status}`);
            }
            
            // Handle rate limits
            if (response.status === 429) {
              throw new Error(`RATE_LIMIT:429`);
            }
            
            if (!response.ok) {
              throw new Error(`Yahoo Finance returned ${response.status}`);
            }
            
            return await response.json();
          };
          
          const rawData = await retryWithBackoff(yahooFetch, 3, 1000);
          
          // CRITICAL: Validate Yahoo Finance response
          const validation = safeValidate(YahooResponseSchema, rawData, 'Yahoo Finance');
          if (validation.success) {
            data = validation.data;
          } else {
            fetchError = `Invalid Yahoo response: ${validation.error}`;
            console.error(fetchError);
            await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, 'validation', fetchError, statusCode, 3);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          fetchError = errorMsg;
          
          // Classify error type
          let errorType = 'network';
          if (errorMsg.includes('AUTH_ERROR')) errorType = 'api_auth';
          else if (errorMsg.includes('RATE_LIMIT')) errorType = 'rate_limit';
          else if (errorMsg.includes('Invalid')) errorType = 'validation';
          
          console.error(`Yahoo Finance error for ${symbol}:`, errorMsg);
          await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, errorType, errorMsg, statusCode, 3);
        }
        
        // If Yahoo failed, try AI fallback
        if (!data?.chart?.result?.[0]) {
          console.log(`${fetchError || 'No data from Yahoo'} for ${symbol}, trying AI fallback...`);
          
          const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
          const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
          
          fallbackUsed++;
          sourceUsed = perplexityApiKey ? 'Perplexity' : 'Lovable AI';
          
          if (perplexityApiKey || lovableApiKey) {
            const aiKey = perplexityApiKey || lovableApiKey;
            const aiUrl = perplexityApiKey 
              ? 'https://api.perplexity.ai/chat/completions'
              : 'https://ai.gateway.lovable.dev/v1/chat/completions';
            const aiModel = perplexityApiKey 
              ? 'sonar'
              : 'google/gemini-2.5-flash';
            
            try {
              const aiResponse = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${aiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: aiModel,
                  messages: [{
                    role: 'user',
                    content: `Get the current price for ${symbol}. Return ONLY: price: [number]`
                  }],
                  temperature: 0.2,
                  max_tokens: 100,
                }),
              });

              if (aiResponse.ok) {
                const rawAiData = await aiResponse.json();
                
                // CRITICAL: Validate AI response
                const aiValidation = safeValidate(PerplexityResponseSchema, rawAiData, 'AI Fallback');
                if (!aiValidation.success) {
                  console.error(`Invalid AI response for ${symbol}: ${aiValidation.error}`);
                  await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, 'validation', aiValidation.error, null, 0);
                  skipped++;
                  continue;
                }
                
                const content = aiValidation.data.choices[0].message.content;
                const price = parseFloat(content.match(/price:\s*([\d.]+)/)?.[1] || '0');
                
                if (price > 0) {
                  console.log(`✅ Got price ${price} from AI for ${symbol}`);
                  const today = new Date().toISOString().split('T')[0];
                  const checksum = await crypto.subtle.digest(
                    'SHA-256',
                    new TextEncoder().encode(`${symbol}|${today}|${price}`)
                  ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
                  
                  const priceData = [{
                    ticker: symbol,
                    asset_id: asset.id,
                    date: today,
                    close: price,
                    checksum,
                    last_updated_at: new Date().toISOString(),
                  }];
                  
                  const insertRes = await fetch(`${supabaseUrl}/rest/v1/prices`, {
                    method: 'POST',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json',
                      'Prefer': 'resolution=ignore-duplicates'
                    },
                    body: JSON.stringify(priceData[0])
                  });
                  
                  if (insertRes.ok) {
                    // Cache the fallback result
                    await redisCache.set(cacheKey, priceData, sourceUsed);
                    inserted++;
                  } else {
                    skipped++;
                  }
                  
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  continue;
                }
              } else {
                const aiError = `AI fallback failed: ${aiResponse.status}`;
                console.error(aiError);
                await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, 'api_auth', aiError, aiResponse.status, 0);
              }
            } catch (aiErr) {
              console.error(`AI fallback failed for ${symbol}:`, aiErr);
              await logFailure(
                supabaseClient, 
                'ingest-prices-yahoo', 
                symbol, 
                'unknown', 
                aiErr instanceof Error ? aiErr.message : String(aiErr),
                null,
                0
              );
            }
          }
          
          skipped++;
          continue;
        }
        
        const result = data.chart.result[0];
        const timestamps = result.timestamp || [];
        const quote = result.indicators.quote[0];
        
        const priceDataBatch = [];
        
        // Process each price point
        for (let i = 0; i < timestamps.length; i++) {
          const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
          const close = quote.close[i];
          
          if (!close || close <= 0) continue;
          
          // Generate checksum for idempotency
          const checksum = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`${symbol}|${date}|${close}`)
          ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
          
          priceDataBatch.push({
            ticker: symbol,
            asset_id: asset.id,
            date,
            close,
            checksum,
            last_updated_at: new Date().toISOString(),
          });
        }
        
        // Batch insert with ON CONFLICT handling
        if (priceDataBatch.length > 0) {
          try {
            const upsertRes = await fetch(`${supabaseUrl}/rest/v1/prices`, {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=ignore-duplicates'
              },
              body: JSON.stringify(priceDataBatch)
            });
            
            if (upsertRes.ok) {
              inserted += priceDataBatch.length;
              
              // Cache the Yahoo Finance result
              await redisCache.set(cacheKey, priceDataBatch, sourceUsed);
            } else {
              const errorText = await upsertRes.text();
              // Check for duplicate key errors
              if (errorText.includes('duplicate key')) {
                console.warn(`Duplicate key for ${symbol}, using ON CONFLICT`);
                await logFailure(supabaseClient, 'ingest-prices-yahoo', symbol, 'duplicate_key', errorText, upsertRes.status, 0);
              }
              skipped += priceDataBatch.length;
            }
          } catch (insertErr) {
            console.error(`Insert error for ${symbol}:`, insertErr);
            await logFailure(
              supabaseClient,
              'ingest-prices-yahoo',
              symbol,
              'unknown',
              insertErr instanceof Error ? insertErr.message : String(insertErr),
              null,
              0
            );
            skipped += priceDataBatch.length;
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        console.error(`Error processing ${asset.ticker}:`, err);
        errors.push(`${asset.ticker}: ${err instanceof Error ? err.message : String(err)}`);
        await logFailure(
          supabaseClient,
          'ingest-prices-yahoo',
          asset.ticker,
          'unknown',
          err instanceof Error ? err.message : String(err),
          null,
          0
        );
      }
    }
    
    const finalSourceUsed = fallbackUsed > 0 ? 'Yahoo Finance + AI Fallback' : 'Yahoo Finance';
    
    await logger.success({
      source_used: finalSourceUsed,
      cache_hit: cacheHits > 0,
      fallback_count: fallbackUsed,
      latency_ms: Date.now() - startTime,
      rows_inserted: inserted,
      rows_skipped: skipped,
    });

    return new Response(JSON.stringify({
      success: true,
      processed: assets.length,
      inserted,
      skipped,
      fallbacks: fallbackUsed,
      errors: errors.length,
      source: finalSourceUsed,
      note: fallbackUsed > 0 ? 'Partial AI fallback used' : 'Real data from Yahoo Finance'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    await logger.failure(error as Error);

    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
