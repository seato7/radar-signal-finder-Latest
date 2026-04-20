// redeployed 2026-03-17
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-GCM encryption utilities
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(plaintext: string, masterKey: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterKey, salt);
  
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine salt + iv + ciphertext and encode as base64
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  
  // FIX: Use chunked btoa to avoid stack overflow for large buffers (spread operator has stack limit)
  let binaryStr = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    binaryStr += String.fromCharCode(...combined.subarray(i, i + chunkSize));
  }
  return btoa(binaryStr);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { broker_key_id, api_key, api_secret, exchange, broker_name } = await req.json();

    if (!api_key || !api_secret) {
      return new Response(
        JSON.stringify({ error: 'API key and secret are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the broker encryption key from secrets
    // FIX: Require BROKER_ENCRYPTION_KEY explicitly - never fall back to service role key
    // (using the service role key as an encryption key is a security risk)
    const encryptionKey = Deno.env.get('BROKER_ENCRYPTION_KEY') ?? '';

    if (!encryptionKey) {
      console.error('BROKER_ENCRYPTION_KEY not set - refusing to encrypt with fallback key');
      return new Response(
        JSON.stringify({ error: 'Server encryption configuration error: BROKER_ENCRYPTION_KEY is not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Encrypt the credentials
    const encryptedApiKey = await encryptData(api_key, encryptionKey);
    const encryptedSecret = await encryptData(api_secret, encryptionKey);

    // Get IP address and user agent for audit log
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Check if we're updating an existing key or creating a new one
    if (broker_key_id) {
      // Get the old encryption version for logging
      const { data: oldKey } = await supabaseClient
        .from('broker_keys')
        .select('encryption_version')
        .eq('id', broker_key_id)
        .eq('user_id', user.id)
        .single();

      if (!oldKey) {
        return new Response(
          JSON.stringify({ error: 'Broker key not found or unauthorized' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update existing key
      const { error: updateError } = await supabaseClient
        .from('broker_keys')
        .update({
          api_key_encrypted: encryptedApiKey,
          secret_key_encrypted: encryptedSecret,
          encryption_version: 'v2',
          updated_at: new Date().toISOString(),
        })
        .eq('id', broker_key_id)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating broker key:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update broker key' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Log the rotation
      const { error: logError } = await supabaseClient
        .from('broker_key_rotation_logs')
        .insert({
          user_id: user.id,
          broker_key_id: broker_key_id,
          old_encryption_version: oldKey.encryption_version,
          new_encryption_version: 'v2',
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata: { exchange, broker_name },
        });

      if (logError) {
        // Security event: rotation audit log failure must be surfaced - don't silently suppress
        console.error('SECURITY WARNING: Failed to write rotation audit log:', logError);
        return new Response(
          JSON.stringify({ error: 'Rotation completed but audit log failed. Contact support.', details: logError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Broker key rotated successfully',
          broker_key_id 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Create new key (already encrypted with v2)
      const { data: newKey, error: insertError } = await supabaseClient
        .from('broker_keys')
        .insert({
          user_id: user.id,
          exchange: exchange,
          broker_name: broker_name,
          api_key_encrypted: encryptedApiKey,
          secret_key_encrypted: encryptedSecret,
          encryption_version: 'v2',
          paper_mode: true, // Default to paper mode for safety
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating broker key:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to create broker key' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Broker key created successfully',
          broker_key_id: newKey.id 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in rotate-broker-key:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
