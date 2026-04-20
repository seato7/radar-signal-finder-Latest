import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
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
  console.log(`[DELETE-ACCOUNT] ${step}${detailsStr}`);
};

const VALID_REASONS = ['too_expensive', 'not_useful', 'switching', 'privacy', 'other'];

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getClientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip');
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

    if (!user.email) {
      return new Response(JSON.stringify({ error: 'Account has no email; cannot re-authenticate for deletion' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Body ──
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }

    const password = typeof body.password === 'string' ? body.password : '';
    const reason = typeof body.reason === 'string' ? body.reason : '';
    let feedback = typeof body.feedback === 'string' ? body.feedback : '';
    const dataExported = body.data_exported === true;

    if (!password) {
      return new Response(JSON.stringify({ error: 'Password required to confirm deletion' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!reason || !VALID_REASONS.includes(reason)) {
      return new Response(JSON.stringify({ error: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (feedback.length > 2000) feedback = feedback.slice(0, 2000);

    logStep('Deletion requested', { user_id: user.id, reason, data_exported: dataExported });

    // ── Re-auth via signInWithPassword on a fresh anon client ──
    // This blocks a stolen token from being enough to delete — password must match.
    const reauthClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
    const { error: pwdError } = await reauthClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (pwdError) {
      logStep('Re-auth failed', { user_id: user.id });
      return new Response(JSON.stringify({ error: 'Incorrect password' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const errors: string[] = [];

    // ── 1. Pre-deletion snapshot for audit log ──
    let planAtDeletion = 'free';
    try {
      const { data } = await supabaseAdmin
        .from('user_roles').select('role').eq('user_id', user.id).limit(1).maybeSingle();
      if (data?.role) planAtDeletion = data.role;
    } catch (e) {
      errors.push(`snapshot_role: ${(e as Error).message}`);
    }

    const emailHash = await sha256Hex(user.email.toLowerCase());
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get('user-agent');

    // ── 2. Cancel Stripe subscription (non-fatal) ──
    let stripeCancelled = false;
    try {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20' as any });
        const customers = await stripe.customers.list({ email: user.email, limit: 1 });
        const customerId = customers.data[0]?.id;
        if (customerId) {
          const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 10 });
          for (const sub of subs.data) {
            await stripe.subscriptions.cancel(sub.id);
            logStep('Stripe subscription cancelled', { subscription_id: sub.id });
          }
          stripeCancelled = subs.data.length > 0;
        } else {
          logStep('No Stripe customer for this email — skipping subscription cancel');
        }
      } else {
        logStep('STRIPE_SECRET_KEY not set — skipping subscription cancel');
      }
    } catch (e) {
      errors.push(`stripe_cancel: ${(e as Error).message}`);
      logStep('Stripe cancel error (non-fatal)', { error: (e as Error).message });
    }

    // ── 3. Insert audit log — MUST succeed before any deletion proceeds ──
    let deletionId: string | null = null;
    try {
      const { data: logRow, error: logError } = await supabaseAdmin
        .from('account_deletion_log')
        .insert({
          user_id: user.id,
          email_hash: emailHash,
          deletion_reason: reason,
          deletion_feedback: feedback || null,
          plan_at_deletion: planAtDeletion,
          stripe_subscription_cancelled: stripeCancelled,
          data_exported: dataExported,
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .select('id')
        .single();
      if (logError) throw new Error(logError.message);
      deletionId = logRow?.id ?? null;
    } catch (e) {
      logStep('AUDIT LOG FAILED — aborting deletion', { error: (e as Error).message });
      return new Response(
        JSON.stringify({ error: 'Could not record deletion audit log — deletion aborted for legal safety', detail: (e as Error).message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    logStep('Audit log inserted', { user_id: user.id, deletion_id: deletionId });

    // ── 4. Delete PII-bearing rows (each in its own try/catch) ──
    const piiTables = ['watchlist', 'alerts', 'user_preferences', 'profiles', 'broker_keys', 'user_roles'];
    for (const table of piiTables) {
      try {
        const { error } = await supabaseAdmin.from(table).delete().eq('user_id', user.id);
        if (error) errors.push(`${table}: ${error.message}`);
      } catch (e) {
        errors.push(`${table}: ${(e as Error).message}`);
      }
    }

    // ── 5. (Skipped per spec) trade_signals retained as-is for ACL/ATO ──

    // ── 6. Delete auth.users LAST ──
    let authUserDeleted = false;
    try {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteError) throw new Error(deleteError.message);
      authUserDeleted = true;
    } catch (e) {
      errors.push(`auth_user_delete: ${(e as Error).message}`);
      logStep('auth.users delete failed — audit log retained', { error: (e as Error).message });
    }

    const deletedAt = new Date().toISOString();
    const duration = Date.now() - startTime;

    logStep('Deletion complete', {
      user_id: user.id,
      stripe_cancelled: stripeCancelled,
      auth_user_deleted: authUserDeleted,
      errors: errors.length,
    });

    try {
      await logHeartbeat(supabaseAdmin, {
        function_name: 'delete-account',
        status: authUserDeleted ? 'success' : 'failure',
        duration_ms: duration,
        source_used: 'account_deletion',
        error_message: authUserDeleted ? null : 'auth.users row not deleted',
        metadata: {
          reason,
          stripe_cancelled: stripeCancelled,
          auth_user_deleted: authUserDeleted,
          partial_errors: errors.length,
        },
      });
    } catch (_) { /* non-fatal */ }

    return new Response(
      JSON.stringify({
        success: authUserDeleted,
        deleted_at: deletedAt,
        deletion_id: deletionId,
        stripe_cancelled: stripeCancelled,
        auth_user_deleted: authUserDeleted,
        errors,
      }),
      {
        status: authUserDeleted ? 200 : 207,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    const errorMessage = (error as Error).message;
    logStep('FATAL', { message: errorMessage });
    const duration = Date.now() - startTime;
    try {
      await logHeartbeat(supabaseAdmin, {
        function_name: 'delete-account',
        status: 'failure',
        duration_ms: duration,
        error_message: errorMessage,
      });
    } catch (_) { /* ignore */ }
    try { await sendErrorAlert('delete-account', error, { url: req.url }); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
