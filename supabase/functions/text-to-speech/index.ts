// Phase 6D: any-authenticated user with per-user hourly rate limit.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, verifyAuth, enforceRateLimit } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;
  const rl = await enforceRateLimit(auth.admin, auth.userId, 'text-to-speech', 20, 3600);
  if (rl) return rl;

  try {
    const { text, voice } = await req.json();

    if (!text) throw new Error('Text is required');
    if (text.length > 5000) {
      return new Response(JSON.stringify({ error: 'Text too long. Maximum 5000 characters.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ELEVEN_LABS_API_KEY = Deno.env.get('ELEVEN_LABS_API_KEY');
    if (!ELEVEN_LABS_API_KEY) {
      console.error('ELEVEN_LABS_API_KEY is not configured');
      return new Response(JSON.stringify({ error: 'Text-to-speech service is not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const voiceId = voice || 'nPczCjzI2devNBz1zQrb';

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': ELEVEN_LABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('ElevenLabs API error:', response.status, errorBody);
      throw new Error(`Speech generation failed (ElevenLabs HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryStr = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binaryStr += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binaryStr);

    return new Response(JSON.stringify({ audioContent: base64Audio }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in text-to-speech:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
