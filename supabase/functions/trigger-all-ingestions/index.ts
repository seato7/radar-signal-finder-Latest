import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ALL 34 data ingestion and signal generation functions
// NOTE: ingest-prices-yahoo REMOVED - price ingestion moved to Railway backend (Twelve Data)
const INGESTION_FUNCTIONS = [
  // Data Ingestion Functions (31)
  'ingest-13f-holdings',
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
  'ingest-google-trends',
  'ingest-job-postings',
  'ingest-news-sentiment',
  'ingest-options-flow',
  'ingest-patents',
  'ingest-pattern-recognition',
  'ingest-policy-feeds',
  'ingest-prices-csv',
  'ingest-reddit-sentiment',
  'ingest-search-trends',
  'ingest-short-interest',
  'ingest-smart-money',
  'ingest-stocktwits',
  'ingest-supply-chain',
  // Signal & Alert Generation (3)
  'compute-theme-scores',
  'compute-signal-scores',
  'generate-alerts'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    console.log(`🚀 Triggering ${INGESTION_FUNCTIONS.length} ingestion functions...`);

    const results: Array<{
      function: string;
      status: 'triggered' | 'error';
      error?: string;
    }> = [];

    // Trigger all functions in parallel (batches of 4 to avoid overwhelming)
    const batchSize = 4;
    for (let i = 0; i < INGESTION_FUNCTIONS.length; i += batchSize) {
      const batch = INGESTION_FUNCTIONS.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (functionName) => {
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
      if (i + batchSize < INGESTION_FUNCTIONS.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const triggered = results.filter(r => r.status === 'triggered').length;
    const errored = results.filter(r => r.status === 'error').length;

    console.log(`✅ Trigger complete: ${triggered} triggered, ${errored} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        total: INGESTION_FUNCTIONS.length,
        triggered,
        errored,
        results,
        message: `Triggered ${triggered}/${INGESTION_FUNCTIONS.length} ingestion functions`,
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
