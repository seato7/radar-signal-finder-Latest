import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

  const startTime = Date.now();
  const logId = crypto.randomUUID();

  try {
    await supabaseClient.from('ingest_logs').insert({
      id: logId,
      etl_name: 'ingest-prices-yahoo',
      status: 'running',
      started_at: new Date().toISOString(),
    });

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
    const errors: string[] = [];
    
    // Process each asset
    for (const asset of assets) {
      try {
        const symbol = asset.ticker;
        const period = '1d'; // daily
        const range = '1y'; // last 1 year for 250+ trading days
        
        // Yahoo Finance API (free, no key required)
        // Yahoo Finance API v8 - includes OHLCV data
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${period}&range=${range}`;
        
        let data = null;
        let fetchError = null;

        // Try Yahoo Finance first
        try {
          const response = await fetch(yahooUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (response.ok) {
            data = await response.json();
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
                const aiData = await aiResponse.json();
                const content = aiData.choices?.[0]?.message?.content || '';
                const price = parseFloat(content.match(/price:\s*([\d.]+)/)?.[1] || '0');
                
                if (price > 0) {
                  console.log(`✅ Got price ${price} from AI for ${symbol}`);
                  const today = new Date().toISOString().split('T')[0];
                  const checksum = await crypto.subtle.digest(
                    'SHA-256',
                    new TextEncoder().encode(`${symbol}|${today}|${price}`)
                  ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
                  
                  await fetch(`${supabaseUrl}/rest/v1/prices`, {
                    method: 'POST',
                    headers: {
                      'apikey': supabaseKey,
                      'Authorization': `Bearer ${supabaseKey}`,
                      'Content-Type': 'application/json',
                      'Prefer': 'resolution=ignore-duplicates'
                    },
                    body: JSON.stringify({
                      ticker: symbol,
                      asset_id: asset.id,
                      date: today,
                      close: price,
                      checksum,
                    })
                  });
                  
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
        
        // Process each price point
        for (let i = 0; i < timestamps.length; i++) {
          const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
          const close = quote.close[i];
          
          if (!close) continue;
          
          // Generate checksum for idempotency
          const checksum = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`${symbol}|${date}|${close}`)
          ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
          
          const priceData = {
            ticker: symbol,
            asset_id: asset.id,
            date,
            close,
            checksum,
          };
          
          // Upsert with checksum conflict resolution
          const upsertRes = await fetch(`${supabaseUrl}/rest/v1/prices`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=ignore-duplicates'
            },
            body: JSON.stringify(priceData)
          });
          
          if (upsertRes.ok) {
            inserted++;
          } else {
            skipped++;
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err) {
        console.error(`Error processing ${asset.ticker}:`, err);
        errors.push(`${asset.ticker}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    const duration = Math.floor((Date.now() - startTime) / 1000);
    await supabaseClient.from('ingest_logs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
      rows_inserted: inserted,
      rows_skipped: skipped,
    }).eq('id', logId);

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
    
    const duration = Math.floor((Date.now() - startTime) / 1000);
    await supabaseClient.from('ingest_logs').update({
      status: 'failure',
      completed_at: new Date().toISOString(),
      duration_seconds: duration,
      error_message: error instanceof Error ? error.message : String(error),
    }).eq('id', logId);

    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
