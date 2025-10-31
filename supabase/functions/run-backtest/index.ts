import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  try {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // Get user role for plan limits
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const userPlan = roleData?.role || 'free';
    
    // Plan-based backtest duration limits
    const PLAN_LIMITS: Record<string, number> = {
      'free': 30,
      'lite': 90,
      'pro': 365,
      'admin': 1825
    };

    const maxDays = PLAN_LIMITS[userPlan] || 30;

    const { since_days = 30, group_by = 'theme' } = await req.json();

    if (since_days > maxDays) {
      throw new Error(`Your plan allows backtests up to ${maxDays} days. Upgrade for longer periods.`);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - since_days);

    // Query signals for backtest
    const { data: signals, error: signalsError } = await supabaseClient
      .from('signals')
      .select(`
        *,
        themes!inner(name, id),
        assets!inner(ticker, name)
      `)
      .gte('observed_at', cutoffDate.toISOString())
      .order('observed_at', { ascending: false })
      .limit(1000);

    if (signalsError) throw signalsError;

    // Aggregate by theme or signal type
    const summary: Record<string, any> = {};
    
    for (const signal of signals || []) {
      const key = group_by === 'theme' 
        ? signal.themes?.name || 'Unthemed'
        : signal.signal_type;
      
      if (!summary[key]) {
        summary[key] = {
          name: key,
          signal_count: 0,
          positive_signals: 0,
          negative_signals: 0,
          avg_magnitude: 0,
          total_magnitude: 0
        };
      }
      
      summary[key].signal_count++;
      summary[key].total_magnitude += signal.magnitude || 0;
      
      if (signal.direction === 'positive') {
        summary[key].positive_signals++;
      } else if (signal.direction === 'negative') {
        summary[key].negative_signals++;
      }
    }

    // Calculate averages
    Object.values(summary).forEach((item: any) => {
      item.avg_magnitude = item.total_magnitude / item.signal_count;
    });

    return new Response(JSON.stringify({ 
      summary: Object.values(summary),
      period_days: since_days,
      total_signals: signals?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
