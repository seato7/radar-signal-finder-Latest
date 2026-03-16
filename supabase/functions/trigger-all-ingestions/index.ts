import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ALL 72 functions - Ingestion, Signal Generation, Scoring, Mapping, and Utilities
const ALL_FUNCTIONS = [
  // === DATA INGESTION (32 functions) ===
  'ingest-advanced-technicals',
  'ingest-ai-research',
  'ingest-breaking-news',
  'ingest-congressional-trades',
  'ingest-cot-cftc',
  'ingest-cot-reports',
  'ingest-crypto-onchain',
  'ingest-dark-pool',
  'ingest-earnings',
  'ingest-economic-calendar',
  'ingest-etf-flows',
  'ingest-finra-darkpool',
  'ingest-forex-sentiment',
  'ingest-forex-technicals',
  'ingest-form4',
  'ingest-fred-economics',
  'ingest-job-postings',
  'ingest-news-rss',
  'ingest-news-sentiment',
  'ingest-options-flow',
  'ingest-patents',
  'ingest-pattern-recognition',
  'ingest-policy-feeds',
  'ingest-prices-csv',
  'ingest-prices-twelvedata',
  'ingest-reddit-sentiment',
  'ingest-search-trends',
  'ingest-sec-13f-edgar',
  'ingest-short-interest',
  'ingest-smart-money',
  'ingest-stocktwits',
  'ingest-supply-chain',
  
  // === SIGNAL GENERATION (27 functions - 12 NEW!) ===
  'generate-signals-from-13f',
  'generate-signals-from-congressional',
  'generate-signals-from-cot',
  'generate-signals-from-darkpool',
  'generate-signals-from-earnings',
  'generate-signals-from-etf-flows',
  'generate-signals-from-form4',
  'generate-signals-from-jobpostings',
  'generate-signals-from-options',
  'generate-signals-from-patents',
  'generate-signals-from-policy',
  'generate-signals-from-search-trends',
  'generate-signals-from-short-interest',
  'generate-signals-from-social',
  'generate-signals-from-supply-chain',
  // NEW signal generators
  'generate-signals-from-technicals',
  'generate-signals-from-patterns',
  'generate-signals-from-smart-money',
  'generate-signals-from-forex-technicals',
  'generate-signals-from-breaking-news',
  'generate-signals-from-economic',
  'generate-signals-from-forex-sentiment',
  'generate-signals-from-crypto-onchain',
  'generate-signals-from-momentum',
  'generate-signals-from-ai-research',
  'generate-signals-from-social-aggregated',
  'generate-signals-from-news-rss',
  
  // === SCORING & MAPPING (5 functions) ===
  'compute-signal-scores',
  'compute-theme-scores',
  'map-signal-to-theme',
  'populate-signal-theme-map',
  'mine-and-discover-themes',
  
  // === ALERTS & REPORTS (3 functions) ===
  'generate-alerts',
  'generate-ai-research',
  'daily-ingestion-digest',
  
  // === UTILITY & MONITORING (5 functions) ===
  'ingestion-health',
  'ingestion-health-enhanced',
  'monitor-ingestion-success-rates',
  'kill-stuck-jobs',
  'bot-scheduler'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // FIX: Use SERVICE_ROLE_KEY - ANON_KEY cannot invoke protected edge functions
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    console.log(`🚀 Triggering ${ALL_FUNCTIONS.length} functions...`);

    const results: Array<{
      function: string;
      status: 'triggered' | 'error';
      error?: string;
    }> = [];

    // Trigger all functions in parallel (batches of 4 to avoid overwhelming)
    const batchSize = 4;
    for (let i = 0; i < ALL_FUNCTIONS.length; i += batchSize) {
      const batch = ALL_FUNCTIONS.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (functionName: string) => {
          try {
            console.log(`📤 Triggering: ${functionName}`);
            
            // Direct HTTP call for reliability
            const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({ 
                trigger: 'manual',
                triggered_by: 'trigger-all-ingestions',
                timestamp: new Date().toISOString()
              })
            });

            if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unknown error');
              console.error(`❌ Error triggering ${functionName}: ${response.status} - ${errorText}`);
              return {
                function: functionName,
                status: 'error' as const,
                error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`
              };
            }

            console.log(`✅ Triggered: ${functionName}`);
            return {
              function: functionName,
              status: 'triggered' as const
            };
          } catch (error) {
            console.error(`❌ Exception triggering ${functionName}:`, error);
            return {
              function: functionName,
              status: 'error' as const,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < ALL_FUNCTIONS.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const triggered = results.filter(r => r.status === 'triggered').length;
    const errored = results.filter(r => r.status === 'error').length;

    console.log(`✅ Trigger complete: ${triggered} triggered, ${errored} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total: ALL_FUNCTIONS.length,
        triggered,
        errored,
        results,
        message: `Triggered ${triggered}/${ALL_FUNCTIONS.length} functions`,
        note: 'Functions are running asynchronously. Check Slack for results.',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('❌ Error triggering ingestions:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
