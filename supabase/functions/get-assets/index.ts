import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    );

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const theme = url.searchParams.get('theme');

    if (theme) {
      // Get signals for theme, then unique tickers
      const { data: signals } = await supabaseClient
        .from('signals')
        .select('asset_id')
        .eq('theme_id', theme)
        .limit(limit);

      const assetIds = [...new Set(signals?.map(s => s.asset_id).filter(Boolean))];
      
      if (assetIds.length === 0) {
        return new Response(
          JSON.stringify([]),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: assets, error } = await supabaseClient
        .from('assets')
        .select('*')
        .in('id', assetIds);

      if (error) throw error;

      return new Response(
        JSON.stringify(assets || []),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all assets
    const { data, error } = await supabaseClient
      .from('assets')
      .select('*')
      .limit(limit);

    if (error) throw error;

    return new Response(
      JSON.stringify(data || []),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-assets:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
