import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlanLimits } from "../_shared/plan-limits.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-WATCHLIST] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'GET') {
      const { data, error } = await supabaseClient
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return new Response(
        JSON.stringify(data || { user_id: user.id, tickers: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const { ticker } = await req.json();
      if (!ticker) throw new Error('Ticker is required');

      // Get current watchlist
      const { data: existing } = await supabaseClient
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const currentTickers: string[] = existing?.tickers || [];
      const alreadyPresent = currentTickers.includes(ticker);
      const projectedCount = alreadyPresent ? currentTickers.length : currentTickers.length + 1;

      // Pre-flight plan-limit check. The DB trigger
      // enforce_watchlist_plan_limit is the actual security boundary
      // (see 20260506000001_plan_limit_triggers.sql); this returns a
      // clean 403 with current/limit fields the frontend can render
      // an upgrade CTA from on the legitimate path. Only enforced
      // when adding a new ticker; re-adding an existing ticker is a
      // no-op and never crosses the cap.
      const { data: roleData } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      const userPlan = (roleData as { role?: string } | null)?.role ?? 'free';
      const limits = getPlanLimits(userPlan);

      if (!alreadyPresent && limits.watchlist_slots !== -1) {
        logStep('LIMIT_CHECK', {
          plan: userPlan,
          current: currentTickers.length,
          projected: projectedCount,
          limit: limits.watchlist_slots,
        });
        if (projectedCount > limits.watchlist_slots) {
          return new Response(JSON.stringify({
            error: 'plan_limit_reached',
            message: `Watchlist limit reached for your ${userPlan} plan`,
            current: currentTickers.length,
            limit: limits.watchlist_slots,
            plan: userPlan,
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (!alreadyPresent) {
        currentTickers.push(ticker);
      }

      const { data, error } = await supabaseClient
        .from('watchlist')
        .upsert({
          user_id: user.id,
          tickers: currentTickers,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'DELETE') {
      const { ticker } = await req.json();
      if (!ticker) throw new Error('Ticker is required');

      const { data: existing } = await supabaseClient
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const currentTickers = existing?.tickers || [];
      const updatedTickers = currentTickers.filter((t: string) => t !== ticker);

      const { data, error } = await supabaseClient
        .from('watchlist')
        .update({
          tickers: updatedTickers,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-watchlist:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
