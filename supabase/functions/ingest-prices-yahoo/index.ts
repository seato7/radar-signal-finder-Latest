import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { YahooResponseSchema, PerplexityResponseSchema, safeValidate } from "../_shared/zod-schemas.ts";
import { redisCache } from "../_shared/redis-cache.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

        // Try Yahoo Finance first
        try {
          const response = await fetch(yahooUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (response.ok) {
            const rawData = await response.json();
            
            // CRITICAL: Validate Yahoo Finance response
            const validation = safeValidate(YahooResponseSchema, rawData, 'Yahoo Finance');
            if (validation.success) {
              data = validation.data;
            } else {
              fetchError = `Invalid Yahoo response: ${validation.error}`;
              console.error(fetchError);
            }
          } else {
            fetchError = `Yahoo Finance returned ${response.status}`;
          }
        } catch (err) {
          fetchError = `Yahoo Finance request failed: ${err}`;
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
                  
                  await fetch(`${supabaseUrl}/rest/v1/prices`, {
                    method: 'POST',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json',
                      'Prefer': 'resolution=ignore-duplicates'
                    },
                    body: JSON.stringify(priceData[0])
                  });
                  
                  // Cache the fallback result
                  await redisCache.set(cacheKey, priceData, sourceUsed);
                  
                  inserted++;
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  continue;
                }
              }
            } catch (aiErr) {
              console.error(`AI fallback failed for ${symbol}:`, aiErr);
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
        
        // Batch insert for performance
        if (priceDataBatch.length > 0) {
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
            skipped += priceDataBatch.length;
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        console.error(`Error processing ${asset.ticker}:`, err);
        errors.push(`${asset.ticker}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    await logger.success({
      source_used: fallbackUsed > 0 ? 'Yahoo Finance + AI Fallback' : 'Yahoo Finance',
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
      note: 'Real data from Yahoo Finance'
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
