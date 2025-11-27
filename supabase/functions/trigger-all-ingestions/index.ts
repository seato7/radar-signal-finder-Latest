import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// All ingestion functions to trigger
const INGESTION_FUNCTIONS = [
  'ingest-prices-yahoo',
  'ingest-prices-csv',
  'ingest-news-sentiment',
  'ingest-breaking-news',
  'ingest-form4',
  'ingest-13f-holdings',
  'ingest-congressional-trades',
  'ingest-etf-flows',
  'ingest-policy-feeds',
  'ingest-dark-pool',
  'ingest-finra-darkpool',
  'ingest-options-flow',
  'ingest-crypto-onchain',
  'ingest-pattern-recognition',
  'ingest-advanced-technicals',
  'ingest-forex-technicals',
  'ingest-forex-sentiment',
  'ingest-earnings',
  'ingest-economic-calendar',
  'ingest-fred-economics',
  'ingest-cot-reports',
  'ingest-cot-cftc',
  'ingest-google-trends',
  'ingest-search-trends',
  'ingest-reddit-sentiment',
  'ingest-stocktwits',
  'ingest-job-postings',
  'ingest-patents',
  'ingest-supply-chain',
  'ingest-ai-research',
  'ingest-short-interest',
  'ingest-smart-money'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    console.log(`🚀 Triggering ${INGESTION_FUNCTIONS.length} ingestion functions...`);

    const results: Array<{
      function: string;
      status: 'triggered' | 'error';
      error?: string;
    }> = [];

    // Trigger all functions in parallel (batches of 5 to avoid overwhelming the system)
    const batchSize = 5;
    for (let i = 0; i < INGESTION_FUNCTIONS.length; i += batchSize) {
      const batch = INGESTION_FUNCTIONS.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (functionName) => {
          try {
            console.log(`📤 Triggering: ${functionName}`);
            
            // Invoke the function (fire and forget)
            const { error } = await supabaseClient.functions.invoke(functionName, {
              body: { 
                trigger: 'manual',
                triggered_by: 'trigger-all-ingestions',
                timestamp: new Date().toISOString()
              }
            });

            if (error) {
              console.error(`❌ Error triggering ${functionName}:`, error.message);
              return {
                function: functionName,
                status: 'error' as const,
                error: error.message
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

      // Small delay between batches
      if (i + batchSize < INGESTION_FUNCTIONS.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
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
        note: 'Functions are running asynchronously. Check ingest_logs for results in a few minutes.',
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
