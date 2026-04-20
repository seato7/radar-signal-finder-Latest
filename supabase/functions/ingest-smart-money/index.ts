import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// DISABLED — was generating 100% synthetic data via Math.random() for all metrics.
// No real institutional flow data source is configured.
// BigMoneyConfirm scoring component will use zero-weight until a real source is wired up.
// Real institutional flow signals come from:
//   - ingest-dark-pool    (FINRA dark pool prints)
//   - ingest-sec-13f-edgar (SEC 13F quarterly filings)
//   - ingest-etf-flows    (ETF fund flow data)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      success: false,
      disabled: true,
      reason: "ingest-smart-money disabled. Was generating 100% synthetic data via Math.random() for all metrics. No real data source configured. BigMoneyConfirm component will use zero-weight until a real institutional flow source is wired up.",
      replacement: "Use ingest-dark-pool, ingest-sec-13f-edgar, and ingest-etf-flows for real institutional flow signals.",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
