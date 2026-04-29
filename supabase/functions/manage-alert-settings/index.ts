// redeployed 2026-04-29
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.slice(7);

    const { data: claimsData, error: claimsError } =
      await supabaseAdmin.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.warn('manage-alert-settings getClaims failed', { message: claimsError?.message });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { action, theme_id, theme_name, score_threshold, min_positives } = body;

    if (action === 'subscribe') {
      if (!theme_id || !theme_name) {
        throw new Error('theme_id and theme_name are required');
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
      return new Response(JSON.stringify({
        success: true,
        message: 'Alert thresholds updated',
        score_threshold,
        min_positives,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('Alert settings error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
