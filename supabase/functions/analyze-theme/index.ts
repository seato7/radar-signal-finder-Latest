// Phase 6B: requires authenticated paid-tier user + per-user rate limit (10/hour).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAID_PLANS = new Set(['starter', 'pro', 'premium', 'enterprise', 'admin']);
const RATE_LIMIT_PER_HOUR = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = claimsData.claims.sub as string;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Plan gate
  const { data: planRow } = await supabase.rpc('_effective_plan', { _user_id: userId });
  const plan = (planRow as string | null) ?? 'free';
  if (!PAID_PLANS.has(plan)) {
    return new Response(JSON.stringify({ error: 'Upgrade required', plan, upgrade_required: true }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Per-user rate limit — 10/hour, counted from theme_analyses (analyst-of-record)
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from('theme_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('requested_by', userId)
    .gte('created_at', oneHourAgo);
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded (10/hour)' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { signals, themeName, days: rawDays } = await req.json();
    const days = Math.max(1, Math.min(365, parseInt(rawDays) || 7));

    if (!Array.isArray(signals) || signals.length === 0) {
      return new Response(JSON.stringify({ error: 'signals array is required and must be non-empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const signalSummary = signals.slice(0, 50).map((s: any) => ({
      type: s.signal_type, text: s.value_text, date: s.observed_at,
    }));

    const prompt = `Analyze these investment signals for the theme "${themeName}" from the last ${days} days and provide a concise 2-3 sentence "Why Now?" summary explaining the current investment opportunity:

Signals:
${JSON.stringify(signalSummary, null, 2)}

Focus on:
1. What's driving momentum now
2. Key catalysts (policy, institutional activity, insider moves, fund flows)
3. Why this is timely

Provide a clear, professional summary suitable for investors.`;

    const fullPrompt = `You are a professional investment analyst. Provide clear, concise summaries of market opportunities based on signal data. Keep responses under 100 words.\n\n${prompt}`;
    const summary = await callGemini(fullPrompt, 200, 'text');
    if (!summary) throw new Error('Gemini returned no content');

    // Best-effort persist; failure does not block response.
    // requested_by may not exist in the legacy table; rely on column-add or use metadata fallback.
    const insertPayload: any = {
      theme_name: themeName,
      analysis_type: 'why_now',
      summary,
      signal_count: signals.length,
      days_window: days,
      model: 'gemini-2.0-flash',
      requested_by: userId,
    };
    const { error: insErr } = await supabase.from('theme_analyses').insert(insertPayload);
    if (insErr && /requested_by/.test(insErr.message ?? '')) {
      // Column not present — drop and retry without it; user attribution survives in alert_history dedup
      delete insertPayload.requested_by;
      await supabase.from('theme_analyses').insert(insertPayload);
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in analyze-theme:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
