import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// ===================================================================
// THIS FUNCTION IS DISABLED - PRICE INGESTION MOVED TO RAILWAY BACKEND
// ===================================================================
// DO NOT USE - This stub exists only to stop the old deployed version
// from running. Price ingestion now happens via the Python backend
// running on Railway with a serial queue scheduler.
//
// The Railway backend processes 40 symbols/minute using TwelveData,
// staying safely under the 55 credits/minute API limit.
// ===================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('⚠️ ingest-prices-twelvedata is DISABLED - price ingestion moved to Railway backend');
  
  return new Response(
    JSON.stringify({
      success: false,
      disabled: true,
      message: 'This function is disabled. Price ingestion has been moved to the Railway Python backend.',
      migration_date: '2025-12-04'
    }),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
});
