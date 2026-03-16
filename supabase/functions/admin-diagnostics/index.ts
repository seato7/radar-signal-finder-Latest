import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const token = req.headers.get('x-admin-token');
  const expected = Deno.env.get('ADMIN_DIAG_TOKEN');
  if (!token || !expected || token !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Recent function_status rows
    const { data: functionStatus, error: fsErr } = await supabase
      .from('function_status')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(20);

    // 2. Cron jobs via pg_cron schema
    let cronJobs = null;
    let cronError = null;
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        sql: "SELECT jobid, schedule, command, nodename, active FROM cron.job ORDER BY jobid",
      });
      cronJobs = data;
      cronError = error?.message || null;
    } catch (e) {
      cronError = e.message;
    }

    // 3. Row counts and most recent created_at for key tables
    const tables = [
      'economic_indicators',
      'signals',
      'asset_score_snapshots',
      'form4_insider_trades',
      'advanced_technicals',
      'search_trends',
    ];

    const tableCounts: Record<string, { count: number; latest: string | null }> = {};
    for (const table of tables) {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      const { data: latest } = await supabase
        .from(table)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);

      tableCounts[table] = {
        count: count ?? 0,
        latest: latest?.[0]?.created_at ?? null,
      };
    }

    // 4. RLS policies (using information_schema isn't available, use pg_policies)
    let rlsPolicies = null;
    let rlsError = null;
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        sql: `SELECT policyname, permissive, roles, cmd, qual, with_check 
              FROM pg_catalog.pg_policies 
              WHERE tablename = 'price_ingestion_log'`,
      });
      rlsPolicies = data;
      rlsError = error?.message || null;
    } catch (e) {
      rlsError = e.message;
    }

    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(),
      function_status: { data: functionStatus, error: fsErr?.message || null },
      cron_jobs: { data: cronJobs, error: cronError },
      table_counts: tableCounts,
      rls_policies: { table: 'price_ingestion_log', data: rlsPolicies, error: rlsError },
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
