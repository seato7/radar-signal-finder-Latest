// redeployed 2026-03-17
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice } = await req.json();
    
    if (!text) {
      throw new Error('Text is required');
    }
    if (text.length > 5000) {
      return new Response(JSON.stringify({ error: 'Text too long. Maximum 5000 characters.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ELEVEN_LABS_API_KEY = Deno.env.get('ELEVEN_LABS_API_KEY');
    if (!ELEVEN_LABS_API_KEY) {
      // Don't leak internal config details in response body
      console.error('ELEVEN_LABS_API_KEY is not configured');
      return new Response(JSON.stringify({ error: 'Text-to-speech service is not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Default to professional voice (Brian)
    const voiceId = voice || 'nPczCjzI2devNBz1zQrb';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': ELEVEN_LABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('ElevenLabs API error:', response.status, errorBody);
      // Surface the actual error code to caller without leaking secrets
      throw new Error(`Speech generation failed (ElevenLabs HTTP ${response.status})`);
    }

    // Convert audio to base64
    // FIX: Use chunked btoa to avoid stack overflow for large audio buffers
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryStr = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binaryStr += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binaryStr);

    return new Response(
      JSON.stringify({ audioContent: base64Audio }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in text-to-speech:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
