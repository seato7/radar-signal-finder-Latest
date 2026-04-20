import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPPORTED_BROKERS = [
  {
    name: 'alpaca',
    display_name: 'Alpaca Markets',
    description: 'Commission-free US stocks and crypto trading',
    supports_paper: true,
    supports_live: true,
    assets: ['stocks', 'crypto']
  },
  {
    name: 'coinbase',
    display_name: 'Coinbase',
    description: 'Cryptocurrency exchange',
    supports_paper: false,
    supports_live: true,
    assets: ['crypto']
  },
  {
    name: 'binance',
    display_name: 'Binance',
    description: 'Global cryptocurrency exchange',
    supports_paper: false,
    supports_live: true,
    assets: ['crypto']
  },
  {
    name: 'kraken',
    display_name: 'Kraken',
    description: 'Cryptocurrency exchange',
    supports_paper: false,
    supports_live: true,
    assets: ['crypto']
  },
  {
    name: 'ibkr',
    display_name: 'Interactive Brokers',
    description: 'Professional trading platform',
    supports_paper: true,
    supports_live: true,
    assets: ['stocks', 'options', 'futures', 'forex']
  }
];

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

    const url = new URL(req.url);
    
    if (url.pathname.endsWith('/supported')) {
      return new Response(JSON.stringify({ brokers: SUPPORTED_BROKERS }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'GET') {
      // List user's broker connections (would query from storage)
      return new Response(JSON.stringify({ brokers: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      // Add broker connection logic
      return new Response(JSON.stringify({ success: true, broker: body }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'DELETE') {
      const body = await req.json();
      // Delete broker connection logic
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Method not allowed');
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
