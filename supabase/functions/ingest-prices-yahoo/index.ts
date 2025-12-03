/**
 * DEPRECATED: Yahoo Finance Price Ingestion
 * 
 * This function has been replaced by the Railway backend using Twelve Data API.
 * DO NOT USE - kept only for reference.
 * 
 * Migration date: 2024-12-03
 * Reason: Yahoo Finance rate limiting (429 errors), unreliable data
 * Replacement: Railway backend with Twelve Data Grow plan ($79/mo)
 * 
 * New architecture:
 * - Price ingestion runs on Railway backend (Python)
 * - Uses Twelve Data API (55 credits/min, $79/mo Grow plan)
 * - Crypto/Forex: every 10 minutes
 * - Stocks/Commodities: every 30 minutes
 * 
 * New endpoints:
 * - POST /api/prices/scheduler/start - Start automated ingestion
 * - GET /api/prices/debug/price-ingestion-status - Health check
 * - POST /api/prices/scheduler/trigger - Manual trigger
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Return deprecation notice
  return new Response(
    JSON.stringify({
      error: 'DEPRECATED',
      message: 'This function has been deprecated and replaced by Twelve Data integration on Railway backend.',
      migration_date: '2024-12-03',
      reason: 'Yahoo Finance rate limiting (429 errors), unreliable data for commodities',
      new_provider: 'Twelve Data',
      new_endpoints: {
        start_scheduler: 'POST /api/prices/scheduler/start',
        stop_scheduler: 'POST /api/prices/scheduler/stop',
        status: 'GET /api/prices/debug/price-ingestion-status',
        manual_trigger: 'POST /api/prices/scheduler/trigger'
      },
      refresh_intervals: {
        crypto: '10 minutes',
        forex: '10 minutes',
        stocks: '30 minutes',
        commodities: '30 minutes'
      },
      documentation: 'See DEPLOYMENT.md for the new price ingestion architecture'
    }),
    {
      status: 410, // Gone
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    }
  );
});
