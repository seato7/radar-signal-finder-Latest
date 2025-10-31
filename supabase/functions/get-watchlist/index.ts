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

      const currentTickers = existing?.tickers || [];
      if (!currentTickers.includes(ticker)) {
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
