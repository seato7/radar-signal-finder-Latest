// redeployed 2026-03-17
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
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      throw new Error('Admin access required');
    }

    const url = new URL(req.url);

    // Get metrics
    if (url.pathname.endsWith('/metrics')) {
      const [alertsCount, assetsCount, themesCount, usersCount, signalsCount] = await Promise.allSettled([
        supabaseClient.from('alerts').select('*', { count: 'exact', head: true }),
        supabaseClient.from('assets').select('*', { count: 'exact', head: true }),
        supabaseClient.from('themes').select('*', { count: 'exact', head: true }),
        supabaseClient.from('user_roles').select('*', { count: 'exact', head: true }),
        supabaseClient.from('signals').select('*', { count: 'exact', head: true })
      ]);

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const { count: recentAlerts } = await supabaseClient
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo.toISOString());
      
      const { count: recentSignals } = await supabaseClient
        .from('signals')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneDayAgo.toISOString());

      return new Response(JSON.stringify({
        total_alerts: alertsCount.status === 'fulfilled' ? (alertsCount.value?.count || 0) : 0,
        total_assets: assetsCount.status === 'fulfilled' ? (assetsCount.value?.count || 0) : 0,
        total_themes: themesCount.status === 'fulfilled' ? (themesCount.value?.count || 0) : 0,
        total_users: usersCount.status === 'fulfilled' ? (usersCount.value?.count || 0) : 0,
        total_signals: signalsCount.status === 'fulfilled' ? (signalsCount.value?.count || 0) : 0,
        recent_alerts_24h: recentAlerts || 0,
        recent_signals_24h: recentSignals || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all users
    if (url.pathname.endsWith('/users')) {
      const { data: users } = await supabaseClient
        .from('user_roles')
        .select('user_id, role, granted_at')
        .order('granted_at', { ascending: false })
        .limit(100);

      return new Response(JSON.stringify({ users: users || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Make user admin
    if (req.method === 'POST' && url.pathname.endsWith('/make-admin')) {
      const { email, role: newRole = 'admin' } = await req.json();

      // Validate role BEFORE doing anything expensive
      const allowedRoles = ['admin', 'pro', 'lite', 'free'];
      if (!allowedRoles.includes(newRole)) {
        throw new Error(`Invalid role: ${newRole}. Must be one of: ${allowedRoles.join(', ')}`);
      }

      // Pagination loop to find user across all pages
      let userToPromote: any = null;
      let page = 1;
      while (!userToPromote) {
        const { data: pageData } = await supabaseClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (!pageData?.users?.length) break;
        userToPromote = pageData.users.find((u: any) => u.email === email);
        if (pageData.users.length < 1000) break; // Last page
        page++;
      }

      if (!userToPromote) throw new Error('User not found');

      await supabaseClient
        .from('user_roles')
        .upsert({ 
          user_id: userToPromote.id, 
          role: newRole,
          granted_by: user.id 
        });

      // Audit log
      await supabaseClient.from('function_status').insert({ function_name: 'admin-actions:make-admin', status: 'success', rows_inserted: 1, metadata: { action: 'make-admin', target_email: email, new_role: newRole, performed_by: user.id } }).catch(() => {});

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upgrade user to premium/pro
    if (req.method === 'POST' && url.pathname.endsWith('/upgrade-user')) {
      const { email, plan = 'pro' } = await req.json();

      // Validate plan BEFORE creating service role operations
      const allowedPlans = ['pro', 'lite', 'admin', 'free'];
      if (!allowedPlans.includes(plan)) {
        throw new Error(`Invalid plan: ${plan}. Must be one of: ${allowedPlans.join(', ')}`);
      }

      // Pagination loop to find user across all pages
      let userToUpgrade: any = null;
      let page = 1;
      while (!userToUpgrade) {
        const { data: pageData } = await supabaseClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (!pageData?.users?.length) break;
        userToUpgrade = pageData.users.find((u: any) => u.email === email);
        if (pageData.users.length < 1000) break; // Last page
        page++;
      }

      if (!userToUpgrade) throw new Error('User not found');

      await supabaseClient
        .from('user_roles')
        .upsert({ 
          user_id: userToUpgrade.id, 
          role: plan,
          granted_by: user.id 
        });

      // Audit log
      await supabaseClient.from('function_status').insert({ function_name: 'admin-actions:upgrade-user', status: 'success', rows_inserted: 1, metadata: { action: 'upgrade-user', target_email: email, new_plan: plan, performed_by: user.id } }).catch(() => {});

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Not found');
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
