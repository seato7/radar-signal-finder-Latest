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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const themeId = pathParts[pathParts.length - 2]; // Before 'why_now'

    if (!themeId) {
      throw new Error('Theme ID required');
    }

    // Get theme details
    const { data: theme, error: themeError } = await supabaseClient
      .from('themes')
      .select('*')
      .eq('id', themeId)
      .single();

    if (themeError) throw themeError;

    // Get recent signals for this theme
    const { data: signals, error: signalsError } = await supabaseClient
      .from('signals')
      .select('*')
      .eq('theme_id', themeId)
      .order('observed_at', { ascending: false })
      .limit(10);

    if (signalsError) throw signalsError;

    // Generate "why now" explanation based on recent signals
    const signalTypes = signals?.map(s => s.signal_type) || [];
    const uniqueTypes = [...new Set(signalTypes)];
    
    const explanation = {
      theme_name: theme.name,
      summary: `Recent market activity shows increased interest in ${theme.name}`,
      key_drivers: uniqueTypes.slice(0, 5).map(type => ({
        type,
        description: `Recent ${type} signals detected`
      })),
      signal_count: signals?.length || 0,
      timeframe: 'Last 7 days',
      strength: signals?.length > 5 ? 'Strong' : 'Moderate'
    };

    return new Response(JSON.stringify(explanation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Theme explanation error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
