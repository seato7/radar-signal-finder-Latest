// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ⛔ DISABLED - This function was injecting hardcoded fake macro data daily
// (NFP=187000, CPI=3.2% - same values every run with series_id=null)
// A real implementation requires a paid economic calendar API (e.g. Trading Economics).
// Until a real data source is wired up, this function returns early without inserting anything.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  console.log('[ingest-economic-calendar] ⛔ DISABLED - no real data source configured. Returning without inserting fake data.');

  await logHeartbeat(supabaseClient, {
    function_name: 'ingest-economic-calendar',
    status: 'success',
    rows_inserted: 0,
    rows_skipped: 0,
    duration_ms: Date.now() - startTime,
    source_used: 'disabled',
    metadata: { reason: 'disabled_fake_data_prevention', note: 'Re-enable once a real economic calendar API is configured' },
  });

  return new Response(
    JSON.stringify({
      success: true,
      disabled: true,
      message: 'ingest-economic-calendar is disabled. It was inserting hardcoded fake data. Re-enable with a real API source.',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
