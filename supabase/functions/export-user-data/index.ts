import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { logHeartbeat } from "../_shared/heartbeat.ts";
import { sendErrorAlert } from "../_shared/error-alerter.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ORIGINS = [
  'https://insiderpulse.org',
  'https://www.insiderpulse.org',
  'http://localhost:3000',
  'http://localhost:5173',
];

function safeOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : 'https://insiderpulse.org';
}

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[EXPORT-USER-DATA] ${step}${detailsStr}`);
};

// Safe per-table fetch: returns rows on success, null + captured error on failure,
// so a missing optional table (e.g. alerts) never aborts the whole export.
async function safeSelect(
  supabase: any,
  table: string,
  userId: string,
  columns = '*',
  errors: string[],
): Promise<any[]> {
  try {
    const { data, error } = await supabase.from(table).select(columns).eq('user_id', userId);
    if (error) {
      errors.push(`${table}: ${error.message}`);
      return [];
    }
    return data ?? [];
  } catch (e) {
    errors.push(`${table}: ${(e as Error).message}`);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  void safeOrigin;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // ── Auth ──
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      logStep('ERROR: missing Authorization Bearer token');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      logStep('ERROR: invalid token', { error: authError?.message });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;
    logStep('Exporting data', { user_id: user.id });

    const errors: string[] = [];

    // ── Auth user record (admin API for canonical timestamps) ──
    let authUser: any = { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: (user as any).last_sign_in_at ?? null };
    try {
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(user.id);
      if (adminUser?.user) {
        authUser = {
          id: adminUser.user.id,
          email: adminUser.user.email,
          created_at: adminUser.user.created_at,
          last_sign_in_at: (adminUser.user as any).last_sign_in_at ?? null,
        };
      }
    } catch (e) {
      errors.push(`auth.users: ${(e as Error).message}`);
    }

    // ── profiles (single row) ──
    let profile: any = null;
    try {
      const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) errors.push(`profiles: ${error.message}`);
      else profile = data;
    } catch (e) {
      errors.push(`profiles: ${(e as Error).message}`);
    }

    // ── user_preferences (single row) ──
    let preferences: any = null;
    try {
      const { data, error } = await supabaseAdmin.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle();
      if (error) errors.push(`user_preferences: ${error.message}`);
      else preferences = data;
    } catch (e) {
      errors.push(`user_preferences: ${(e as Error).message}`);
    }

    // ── user_roles (can be multiple) ──
    const roles = await safeSelect(supabaseAdmin, 'user_roles', user.id, '*', errors);

    // ── watchlist (all rows) ──
    const watchlist = await safeSelect(supabaseAdmin, 'watchlist', user.id, '*', errors);

    // ── alerts (may not exist — try/catch) ──
    const alerts = await safeSelect(supabaseAdmin, 'alerts', user.id, '*', errors);

    // ── broker_keys: METADATA ONLY — never export encrypted key material ──
    const broker_connections = await safeSelect(
      supabaseAdmin,
      'broker_keys',
      user.id,
      'id, exchange, paper_mode, created_at',
      errors,
    );

    const exportedAt = new Date().toISOString();
    const payload = {
      export_version: '1.0',
      exported_at: exportedAt,
      user: authUser,
      profile,
      preferences,
      roles,
      watchlist,
      alerts,
      broker_connections,
      ...(errors.length > 0 ? { partial_errors: errors } : {}),
    };

    const duration = Date.now() - startTime;
    logStep('Export complete', { user_id: user.id, duration_ms: duration, errors: errors.length });

    try {
      await logHeartbeat(supabaseAdmin, {
        function_name: 'export-user-data',
        status: 'success',
        duration_ms: duration,
        source_used: 'user_data_export',
        metadata: { user_id: user.id, partial_errors: errors.length },
      });
    } catch (_) { /* non-fatal */ }

    const date = exportedAt.split('T')[0];
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="insiderpulse-data-export-${date}.json"`,
      },
    });

  } catch (error) {
    const errorMessage = (error as Error).message;
    logStep('ERROR', { message: errorMessage });
    const duration = Date.now() - startTime;
    try {
      await logHeartbeat(supabaseAdmin, {
        function_name: 'export-user-data',
        status: 'failure',
        duration_ms: duration,
        error_message: errorMessage,
      });
    } catch (_) { /* ignore */ }
    try { await sendErrorAlert('export-user-data', error, { url: req.url }); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
