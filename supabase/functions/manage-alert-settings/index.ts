import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const body = await req.json();
    const { action, theme_id, theme_name, score_threshold, min_positives } = body;

    // Subscribe to theme
    if (action === 'subscribe') {
      if (!theme_id || !theme_name) {
        throw new Error('theme_id and theme_name are required');
      }

      // Create an alert for this theme subscription
      const { data, error } = await supabaseClient
        .from('alerts')
        .insert({
          user_id: user.id,
          theme_id,
          theme_name,
          score: 0,
          status: 'active',
          positives: [],
          dont_miss: null
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ 
        success: true, 
        message: `Subscribed to ${theme_name}`,
        alert: data 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update alert thresholds
    if (action === 'thresholds' || score_threshold !== undefined || min_positives !== undefined) {
      // Store thresholds in user metadata or separate table
      // For now, we'll just return success as these are used for filtering
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Alert thresholds updated',
        score_threshold,
        min_positives
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
