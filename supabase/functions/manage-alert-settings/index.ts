// redeployed 2026-05-06
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getPlanLimits } from "../_shared/plan-limits.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MANAGE-ALERT-SETTINGS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  logStep('REQUEST', {
    method: req.method,
    auth_present: !!authHeader,
    auth_is_bearer: !!authHeader?.startsWith('Bearer '),
  });

  try {
    // Service-role client + asymmetric JWT validation via getClaims.
    // The legacy anon-key + auth.getUser pattern broke after Supabase
    // rotated to asymmetric signing keys: getUser hits the auth server
    // and returns null for tokens signed with the new keys, leaving
    // every paid-plan caller looking unauthenticated.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.slice(7);

    const { data: claimsData, error: claimsError } =
      await supabaseAdmin.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      logStep('getClaims failed', { message: claimsError?.message });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { action, theme_id, theme_name, score_threshold, min_positives } = body;

    // Body shape only, no values, to avoid leaking theme names into logs.
    logStep('BODY', {
      action,
      has_theme_id: theme_id !== undefined && theme_id !== null && theme_id !== '',
      has_theme_name: theme_name !== undefined && theme_name !== null && theme_name !== '',
      has_score_threshold: score_threshold !== undefined,
      has_min_positives: min_positives !== undefined,
    });

    if (action === 'subscribe') {
      logStep('BRANCH', { branch: 'subscribe' });
      if (!theme_id || !theme_name) {
        throw new Error('theme_id and theme_name are required');
      }

      // Pre-flight plan-limit check. The DB trigger
      // enforce_alerts_plan_limit is the actual security boundary
      // (see 20260506000001_plan_limit_triggers.sql); this exists so
      // the legitimate caller gets a clean 403 with current/limit
      // fields the frontend can render an upgrade CTA from, instead
      // of bubbling a Postgres check_violation up through the
      // generic 400 catch.
      const { data: roleData } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      const userPlan = roleData?.role ?? 'free';
      const limits = getPlanLimits(userPlan);

      if (limits.alerts !== -1) {
        const { count: currentAlerts, error: countError } = await supabaseAdmin
          .from('alerts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (countError) {
          logStep('LIMIT_CHECK count failed', { message: countError.message });
        }
        const current = currentAlerts ?? 0;
        logStep('LIMIT_CHECK', { plan: userPlan, current, limit: limits.alerts });
        if (current >= limits.alerts) {
          return new Response(JSON.stringify({
            error: 'plan_limit_reached',
            message: `Alert limit reached for your ${userPlan} plan`,
            current,
            limit: limits.alerts,
            plan: userPlan,
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const { data, error } = await supabaseAdmin
        .from('alerts')
        .insert({
          user_id: userId,
          theme_id,
          theme_name,
          score: 0,
          status: 'active',
          positives: [],
          dont_miss: null,
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        message: `Subscribed to ${theme_name}`,
        alert: data,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'thresholds' || score_threshold !== undefined || min_positives !== undefined) {
      logStep('BRANCH', { branch: 'thresholds' });
      return new Response(JSON.stringify({
        success: true,
        message: 'Alert thresholds updated',
        score_threshold,
        min_positives,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logStep('BRANCH', { branch: 'invalid' });
    throw new Error('Invalid action');

  } catch (error) {
    const errorMessage = (error as Error).message;
    logStep('ERROR', { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
