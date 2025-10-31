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

    // Check if user has premium/pro plan
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const userPlan = roleData?.role || 'free';
    
    if (!['pro', 'admin'].includes(userPlan)) {
      throw new Error('Advanced Analytics requires Pro or Admin plan');
    }

    // Get user's alerts for analytics
    const { data: alerts } = await supabaseClient
      .from('alerts')
      .select(`
        *,
        themes!inner(name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1000);

    // Calculate metrics
    const totalAlerts = alerts?.length || 0;
    const activeAlerts = alerts?.filter(a => a.status === 'active').length || 0;
    const dismissedAlerts = alerts?.filter(a => a.status === 'dismissed').length || 0;
    
    // Average score
    const avgScore = alerts?.reduce((sum, a) => sum + (a.score || 0), 0) / (totalAlerts || 1);

    // Theme distribution
    const themeDistribution: Record<string, number> = {};
    alerts?.forEach(alert => {
      const themeName = alert.themes?.name || 'Unknown';
      themeDistribution[themeName] = (themeDistribution[themeName] || 0) + 1;
    });

    // Time series (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentAlerts = alerts?.filter(a => 
      new Date(a.created_at) >= thirtyDaysAgo
    ) || [];

    const dailyAlerts: Record<string, number> = {};
    recentAlerts.forEach(alert => {
      const date = new Date(alert.created_at).toISOString().split('T')[0];
      dailyAlerts[date] = (dailyAlerts[date] || 0) + 1;
    });

    return new Response(JSON.stringify({
      summary: {
        total_alerts: totalAlerts,
        active_alerts: activeAlerts,
        dismissed_alerts: dismissedAlerts,
        avg_score: avgScore.toFixed(2),
      },
      theme_distribution: themeDistribution,
      daily_alerts: dailyAlerts,
      top_themes: Object.entries(themeDistribution)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))
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
