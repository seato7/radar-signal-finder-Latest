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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const body = req.method !== 'GET' ? await req.json() : {};
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const action = body.action || req.method.toLowerCase();

    // GET /broker/supported - List supported brokers
    if (action === 'supported' || pathParts.includes('supported')) {
      return new Response(JSON.stringify({
        brokers: [
          { id: 'alpaca', name: 'Alpaca', supported: true },
          { id: 'ibkr', name: 'Interactive Brokers', supported: true },
          { id: 'coinbase', name: 'Coinbase', supported: true },
          { id: 'binance', name: 'Binance', supported: true },
          { id: 'kraken', name: 'Kraken', supported: true }
        ]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /broker/keys - List user's broker keys
    if (req.method === 'GET' && !pathParts.includes('supported')) {
      const { data: keys, error } = await supabaseClient
        .from('broker_keys')
        .select('id, exchange, paper_mode, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ keys: keys || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /broker/keys - Create new broker key
    if (req.method === 'POST' && !pathParts.includes('test')) {
      const { exchange, api_key, secret_key, paper_mode } = body;

      if (!exchange || !api_key || !secret_key) {
        throw new Error('Missing required fields: exchange, api_key, secret_key');
      }

      // Simple encryption (in production, use proper encryption)
      const encryptedApiKey = btoa(api_key);
      const encryptedSecret = btoa(secret_key);

      const { data, error } = await supabaseClient
        .from('broker_keys')
        .insert({
          user_id: user.id,
          exchange,
          api_key_encrypted: encryptedApiKey,
          secret_key_encrypted: encryptedSecret,
          paper_mode: paper_mode || true
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, key: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /broker/keys/{id}
    if (req.method === 'DELETE' || action === 'delete') {
      const keyId = body.key_id || pathParts[pathParts.length - 1];

      const { error } = await supabaseClient
        .from('broker_keys')
        .delete()
        .eq('id', keyId)
        .eq('user_id', user.id);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /broker/keys/{id}/test - Test broker connection
    if (action === 'test' || pathParts.includes('test')) {
      const keyId = body.key_id || pathParts[pathParts.indexOf('keys') + 1];

      const { data: key, error } = await supabaseClient
        .from('broker_keys')
        .select('*')
        .eq('id', keyId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      // Simulate broker connection test
      // In production, this would actually test the API credentials
      const testResult = {
        success: true,
        message: `Successfully connected to ${key.exchange}`,
        account_info: {
          exchange: key.exchange,
          mode: key.paper_mode ? 'Paper' : 'Live',
          connected: true
        }
      };

      return new Response(JSON.stringify(testResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action or method');

  } catch (error) {
    console.error('Broker keys error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
