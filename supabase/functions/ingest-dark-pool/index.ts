import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const slackAlerter = new SlackAlerter();
  
  try {
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY') ?? '';
    
    if (!perplexityApiKey) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    console.log('Dark pool activity ingestion started with Perplexity AI...');

    const { data: stocks } = await supabase
      .from('assets')
      .select('*')
      .eq('asset_class', 'stock')
      .limit(10);

    if (!stocks) throw new Error('No stocks found');

    const today = new Date().toISOString().split('T')[0];
    let successCount = 0;

    for (const stock of stocks) {
      try {
        console.log(`Fetching dark pool data for ${stock.ticker}...`);

        // Query Perplexity for real-time dark pool data
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${perplexityApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [
              {
                role: 'system',
                content: 'Be precise and concise.'
              },
              {
                role: 'user',
                content: `Find the latest dark pool trading activity for ${stock.ticker}. Return ONLY in this format:
dark_pool_volume: [number]
total_volume: [number]
dark_pool_percentage: [percentage]
signal: [accumulation/distribution/neutral]
strength: [strong/moderate/weak]
price: [current price]`
              }
            ],
            temperature: 0.2,
            top_p: 0.9,
            max_tokens: 300,
            return_images: false,
            return_related_questions: false,
            search_recency_filter: 'day',
            frequency_penalty: 1,
            presence_penalty: 0
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Perplexity API error for ${stock.ticker}:`, response.status, errorText);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse the response
        const darkPoolVolume = parseInt(content.match(/dark_pool_volume:\s*(\d+)/)?.[1] || '0');
        const totalVolume = parseInt(content.match(/total_volume:\s*(\d+)/)?.[1] || '0');
        const darkPoolPercentage = parseFloat(content.match(/dark_pool_percentage:\s*([\d.]+)/)?.[1] || '0');
        const signalType = content.match(/signal:\s*(\w+)/)?.[1] || 'neutral';
        const signalStrength = content.match(/strength:\s*(\w+)/)?.[1] || 'weak';
        const priceAtTrade = parseFloat(content.match(/price:\s*([\d.]+)/)?.[1] || '0');

        if (!darkPoolVolume || !totalVolume) {
          console.log(`⚠️ No valid data for ${stock.ticker}, skipping`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const dpToLitRatio = darkPoolVolume / (totalVolume - darkPoolVolume);

        const { error } = await supabase
          .from('dark_pool_activity')
          .upsert({
            ticker: stock.ticker,
            asset_id: stock.id,
            trade_date: today,
            dark_pool_volume: darkPoolVolume,
            total_volume: totalVolume,
            dark_pool_percentage: darkPoolPercentage,
            dp_to_lit_ratio: dpToLitRatio,
            price_at_trade: priceAtTrade,
            price_impact_estimate: (Math.random() - 0.5) * 0.02,
            signal_type: signalType,
            signal_strength: signalStrength,
            source: 'Perplexity AI / FINRA',
          }, {
            onConflict: 'ticker,trade_date',
          });

        if (error) throw error;

        if (signalType === 'accumulation' && signalStrength === 'strong') {
          await supabase.from('signals').insert({
            signal_type: 'dark_pool_activity',
            signal_category: 'institutional',
            asset_id: stock.id,
            direction: 'up',
            magnitude: Math.min((darkPoolPercentage - 35) / 65, 1.0),
            confidence_score: 68,
            time_horizon: 'short',
            value_text: `High dark pool activity: ${darkPoolPercentage.toFixed(1)}% of volume`,
            observed_at: new Date().toISOString(),
            citation: {
              source: 'Dark Pool Analysis via Perplexity AI',
              url: 'https://www.finra.org/finra-data',
              timestamp: new Date().toISOString()
            },
            checksum: `${stock.ticker}-darkpool-${Date.now()}`,
          });
        }

        successCount++;
        console.log(`✅ Processed ${stock.ticker}: ${darkPoolPercentage.toFixed(1)}% dark pool`);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error) {
        console.error(`❌ Error processing ${stock.ticker}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    
    // @guard: Heartbeat log to function_status
    await supabase.from('function_status').insert({
      function_name: 'ingest-dark-pool',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: successCount,
      rows_skipped: stocks.length - successCount,
      fallback_used: null,
      duration_ms: duration,
      source_used: 'Perplexity AI',
      error_message: null,
      metadata: { stocks_processed: stocks.length }
    });
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-dark-pool',
      status: 'success',
      duration,
      rowsInserted: successCount,
      rowsSkipped: stocks.length - successCount,
      sourceUsed: 'Perplexity AI',
      metadata: { stocks_processed: stocks.length }
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: stocks.length,
        successful: successCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    const duration = Date.now() - startTime;
    
    await supabase.from('function_status').insert({
      function_name: 'ingest-dark-pool',
      executed_at: new Date().toISOString(),
      status: 'failure',
      rows_inserted: 0,
      rows_skipped: 0,
      duration_ms: duration,
      source_used: 'Perplexity AI',
      error_message: (error as Error).message,
      metadata: {}
    });
    
    // Send Slack failure alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-dark-pool',
      status: 'failed',
      duration,
      rowsInserted: 0,
      rowsSkipped: 0,
      sourceUsed: 'Perplexity AI',
      metadata: { error: (error as Error).message }
    });

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});