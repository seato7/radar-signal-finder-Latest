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
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  try {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      throw new Error('Admin access required');
    }

    const { action, email } = await req.json();

    if (action === 'metrics') {
      const [botsRes, alertsRes, subscriptionsRes] = await Promise.all([
        supabaseClient.from('bots').select('status, created_at'),
        supabaseClient.from('alerts').select('created_at'),
        supabaseClient.from('user_roles').select('role').neq('role', 'free')
      ]);

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      return new Response(JSON.stringify({
        totals: {
          bots: botsRes.data?.length || 0,
          alerts: alertsRes.data?.length || 0,
          subscriptions: subscriptionsRes.data?.length || 0
        },
        active: {
          running_bots: botsRes.data?.filter(b => b.status === 'running').length || 0
        },
        recent_24h: {
          bots_created: botsRes.data?.filter(b => new Date(b.created_at) > yesterday).length || 0,
          alerts: alertsRes.data?.filter(a => new Date(a.created_at) > yesterday).length || 0
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'user-stats') {
      const { data: users } = await supabaseClient.auth.admin.listUsers();
      const { data: roles } = await supabaseClient.from('user_roles').select('*');

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const roleCount = (role: string) => roles?.filter(r => r.role === role).length || 0;
      const recentSignups = (users?.users ?? []).filter(u => new Date(u.created_at) > sevenDaysAgo).length;

      return new Response(JSON.stringify({
        totals: {
          all_users: users?.users?.length || 0,
          free: roleCount('free'),
          lite: roleCount('lite'),
          pro: roleCount('pro'),
          admin: roleCount('admin'),
          // Fix: use ?? new Date(0) so null last_sign_in_at = epoch, not 1970 from (|| 0)
          active: (users?.users ?? []).filter(u => new Date(u.last_sign_in_at ?? new Date(0)) > sevenDaysAgo).length
        },
        growth: {
          signups_7d: recentSignups
        },
        recent_signups: users?.users
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
          .map(u => {
            const userRole = roles?.find(r => r.user_id === u.id);
            return {
              id: u.id,
              email: u.email,
              role: userRole?.role || 'free',
              created_at: u.created_at
            };
          }) || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'users') {
      const { data: users } = await supabaseClient.auth.admin.listUsers();
      const { data: roles } = await supabaseClient.from('user_roles').select('*');

      const sevenDaysAgoForActive = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return new Response(JSON.stringify({
        users: (users?.users ?? []).map(u => {
          const userRole = roles?.find(r => r.user_id === u.id);
          const lastSignIn = u.last_sign_in_at != null ? new Date(u.last_sign_in_at) : new Date(0);
          return {
            id: u.id,
            email: u.email,
            role: userRole?.role || 'free',
            is_active: lastSignIn > sevenDaysAgoForActive,
            created_at: u.created_at
          };
        })
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'audit') {
      const { data: logs } = await supabaseClient
        .from('bot_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      return new Response(JSON.stringify({
        bot_actions: logs?.map(log => ({
          msg: log.message,
          ts: log.created_at
        })) || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'make-admin' || action === 'upgrade-premium') {
      const { data: targetUser } = await supabaseClient.auth.admin.listUsers();
      const foundUser = targetUser?.users.find(u => u.email === email);
      
      if (!foundUser) throw new Error('User not found');

      const newRole = action === 'make-admin' ? 'admin' : 'pro';
      
      await supabaseClient
        .from('user_roles')
        .update({ role: newRole, granted_by: user.id })
        .eq('user_id', foundUser.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
