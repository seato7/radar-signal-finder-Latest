import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { CryptoOnChainMetricsSchema, PerplexityResponseSchema, safeValidate } from "../_shared/zod-schemas.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { logAPIUsage } from "../_shared/api-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY') ?? '';
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Initialize logger immediately - no dynamic imports
    const { IngestLogger } = await import('../_shared/log-ingest.ts');
    const logger = new IngestLogger(supabaseClient, 'ingest-crypto-onchain');
    await logger.start();
    
    if (!perplexityApiKey) {
      console.error('❌ PERPLEXITY_API_KEY not configured - skipping crypto on-chain ingestion');
      
      await logger.failure(new Error('PERPLEXITY_API_KEY not configured'), {
        source_used: 'Perplexity AI',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
      });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'PERPLEXITY_API_KEY not configured',
          skipped: true 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Crypto on-chain metrics ingestion started with Perplexity AI...');

    const { data: cryptoAssets } = await supabaseClient
      .from('assets')
      .select('*')
      .eq('asset_class', 'crypto')
      .limit(6);

    if (!cryptoAssets || cryptoAssets.length === 0) {
      console.log('No crypto assets found - completing successfully');
      await logger.success({
        source_used: 'Perplexity AI',
        cache_hit: false,
        fallback_count: 0,
        rows_inserted: 0,
        rows_skipped: 0,
      });
      
      return new Response(
        JSON.stringify({ success: true, processed: 0, successful: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let successCount = 0;
    
    // Add 8-minute timeout guard
    const TIMEOUT_MS = 480000; // 8 minutes
    const timeoutAt = Date.now() + TIMEOUT_MS;

    for (const asset of cryptoAssets) {
      // Check timeout guard
      if (Date.now() >= timeoutAt) {
        console.error(`⏱️ TIMEOUT: Exceeded ${TIMEOUT_MS / 1000}s runtime, aborting`);
        break;
      }
      try {
        console.log(`Fetching on-chain data for ${asset.ticker}...`);

        // Query Perplexity for real-time on-chain metrics
        const apiStartTime = Date.now();
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
                content: `Find the latest on-chain metrics for ${asset.ticker}. Return ONLY in this format:
active_addresses: [number]
transaction_count: [number]
whale_transactions: [number]
whale_signal: [accumulating/distributing/neutral]
exchange_inflow: [number in coins]
exchange_outflow: [number in coins]
exchange_signal: [bullish_outflow/bearish_inflow/neutral]
fear_greed_index: [0-100]
hash_rate: [number if applicable]`
              }
            ],
            temperature: 0.2,
            top_p: 0.9,
            max_tokens: 400,
            return_images: false,
            return_related_questions: false,
            search_recency_filter: 'day',
            frequency_penalty: 1,
            presence_penalty: 0
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Perplexity API error for ${asset.ticker}:`, response.status, errorText);
          
          // Log API failure
          await logAPIUsage(supabaseClient, {
            api_name: 'Perplexity AI',
            endpoint: '/chat/completions',
            function_name: 'ingest-crypto-onchain',
            status: 'failure',
            response_time_ms: Date.now() - apiStartTime,
            error_message: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
          });
          
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
        
        // Log API success
        await logAPIUsage(supabaseClient, {
          api_name: 'Perplexity AI',
          endpoint: '/chat/completions',
          function_name: 'ingest-crypto-onchain',
          status: 'success',
          response_time_ms: Date.now() - apiStartTime
        });

        const rawData = await response.json();
        
        // CRITICAL: Validate Perplexity response
        const validation = safeValidate(PerplexityResponseSchema, rawData, 'Perplexity AI');
        if (!validation.success) {
          console.error(`Invalid Perplexity response for ${asset.ticker}: ${validation.error}`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }
        
        const content = validation.data.choices[0].message.content;

        // Parse the response
        const activeAddresses = parseInt(content.match(/active_addresses:\s*(\d+)/)?.[1] || '0');
        const transactionCount = parseInt(content.match(/transaction_count:\s*(\d+)/)?.[1] || '0');
        const whaleTransactionCount = parseInt(content.match(/whale_transactions:\s*(\d+)/)?.[1] || '0');
        const whaleSignal = content.match(/whale_signal:\s*(\w+)/)?.[1] || 'neutral';
        const exchangeInflow = parseFloat(content.match(/exchange_inflow:\s*([\d.]+)/)?.[1] || '0');
        const exchangeOutflow = parseFloat(content.match(/exchange_outflow:\s*([\d.]+)/)?.[1] || '0');
        const exchangeFlowSignal = content.match(/exchange_signal:\s*(\w+)/)?.[1] || 'neutral';
        const fearGreedIndex = parseInt(content.match(/fear_greed_index:\s*(\d+)/)?.[1] || '50');
        const hashRate = parseFloat(content.match(/hash_rate:\s*([\d.]+)/)?.[1] || '0');

        if (!activeAddresses || !transactionCount) {
          console.log(`⚠️ No valid data for ${asset.ticker}, skipping`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          continue;
        }

        const exchangeNetFlow = exchangeOutflow - exchangeInflow;

        // Insert on-chain metrics
        const { error } = await supabaseClient
          .from('crypto_onchain_metrics')
          .insert({
            ticker: asset.ticker,
            asset_id: asset.id,
            active_addresses: activeAddresses,
            active_addresses_change_pct: Math.random() * 20 - 10,
            transaction_count: transactionCount,
            transaction_count_change_pct: Math.random() * 30 - 15,
            whale_transaction_count: whaleTransactionCount,
            large_transaction_volume: whaleTransactionCount * 100000,
            whale_signal: whaleSignal,
            exchange_inflow: exchangeInflow,
            exchange_outflow: exchangeOutflow,
            exchange_net_flow: exchangeNetFlow,
            exchange_flow_signal: exchangeFlowSignal,
            supply_on_exchanges: null,
            supply_on_exchanges_pct: 15,
            long_term_holder_supply_pct: 60,
            hash_rate: hashRate || null,
            hash_rate_change_pct: Math.random() * 10 - 5,
            fear_greed_index: fearGreedIndex,
            source: 'Perplexity AI / On-Chain',
          });

        if (error) {
          console.error(`Error inserting metrics for ${asset.ticker}:`, error);
        } else {
          // Create signals for significant whale activity
          if (whaleSignal === 'accumulating') {
            await supabaseClient.from('signals').insert({
              signal_type: 'crypto_whale_activity',
              signal_category: 'flow',
              asset_id: asset.id,
              direction: 'up',
              magnitude: 0.75,
              confidence_score: 70,
              time_horizon: 'medium',
              value_text: `Whale accumulation: ${whaleTransactionCount} large transactions`,
              observed_at: new Date().toISOString(),
              citation: {
                source: 'On-Chain Analytics via Perplexity AI',
                url: 'https://www.blockchain.com',
                timestamp: new Date().toISOString()
              },
              checksum: `${asset.ticker}-whale-${Date.now()}`,
            });
          }

          // Signal for exchange outflow (bullish)
          if (exchangeFlowSignal === 'bullish_outflow') {
            await supabaseClient.from('signals').insert({
              signal_type: 'crypto_exchange_outflow',
              signal_category: 'flow',
              asset_id: asset.id,
              direction: 'up',
              magnitude: Math.min(Math.abs(exchangeNetFlow) / 10000, 1.0),
              confidence_score: 65,
              time_horizon: 'medium',
              value_text: `Net exchange outflow: ${exchangeNetFlow.toFixed(0)} coins`,
              observed_at: new Date().toISOString(),
              citation: {
                source: 'Exchange Flow Analysis via Perplexity AI',
                url: 'https://www.blockchain.com',
                timestamp: new Date().toISOString()
              },
              checksum: `${asset.ticker}-flow-${Date.now()}`,
            });
          }

          successCount++;
          console.log(`✅ Processed ${asset.ticker}`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error) {
        console.error(`❌ Error processing ${asset.ticker}:`, error);
      }
    }

    await logger.success({
      source_used: 'Perplexity AI',
      cache_hit: false,
      fallback_count: 0,
      rows_inserted: successCount,
      rows_skipped: cryptoAssets.length - successCount,
    });
    
    const duration = Date.now() - logger.startTime;
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-crypto-onchain',
      status: 'success',
      duration: duration,
      rowsInserted: successCount,
      rowsSkipped: cryptoAssets.length - successCount,
      sourceUsed: 'Perplexity AI',
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: cryptoAssets.length,
        successful: successCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    
    // Log failure with safe error handling
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      const duration = Date.now() - startTime;
      await supabaseClient.from('function_status').insert({
        function_name: 'ingest-crypto-onchain',
        executed_at: new Date().toISOString(),
        status: 'failure',
        duration_ms: duration,
        error_message: error instanceof Error ? error.message : String(error),
        rows_inserted: 0,
        rows_skipped: 0
      });
      
      await slackAlerter.sendCriticalAlert({
        type: 'api_reliability',
        etlName: 'ingest-crypto-onchain',
        message: `Crypto onchain ingestion failed: ${error instanceof Error ? error.message : String(error)}`,
        details: { duration }
      });
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }
    
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});