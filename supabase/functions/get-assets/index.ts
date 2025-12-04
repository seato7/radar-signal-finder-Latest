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

    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 100;
    const search = body.search;
    const theme = body.theme;

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
          JSON.stringify({ assets: [], total: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: assets, error } = await supabaseClient
        .from('assets')
        .select('*')
        .in('id', assetIds);

      if (error) throw error;

      return new Response(
        JSON.stringify({ assets: assets || [], total: assets?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build query for search
    let query = supabaseClient.from('assets').select('*', { count: 'exact' });
    
    if (search) {
      query = query.or(`ticker.ilike.%${search}%,name.ilike.%${search}%,exchange.ilike.%${search}%`);
    }
    
    const { data, error, count } = await query.limit(limit);

    if (error) throw error;

    return new Response(
      JSON.stringify({ assets: data || [], total: count || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-assets:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', assets: [], total: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
