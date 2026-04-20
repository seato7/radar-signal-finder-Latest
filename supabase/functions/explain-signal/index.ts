import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { signal } = await req.json();

    if (!signal || !signal.signal_type) {
      return new Response(JSON.stringify({ error: 'signal object with signal_type is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const signalTypeExplanations: Record<string, string> = {
      'policy_approval': 'government approvals or regulatory changes',
      'policy_keyword': 'policy mentions in official documents',
      'bigmoney_hold_new': 'institutional investors taking new positions',
      'bigmoney_hold_increase': 'institutional investors increasing positions',
      'insider_buy': 'company insiders purchasing shares',
      'flow_pressure': 'unusual trading volume or fund flows',
      'flow_pressure_etf': 'ETF inflows/outflows indicating sector rotation'
    };

    const signalContext = signalTypeExplanations[signal.signal_type] || 'market signal';

    const prompt = `Explain this investment signal in 2-3 clear sentences for an investor:

Signal Type: ${signal.signal_type}
Details: ${signal.value_text}
Date: ${signal.observed_at}

Context: This is a ${signalContext}.

Provide:
1. What this signal means
2. Why it matters for investors
3. Typical market implications

Keep it actionable and educational.`;

    const fullPrompt = `You are a financial educator explaining investment signals clearly and concisely.\n\n${prompt}`;
    const explanation = await callGemini(fullPrompt, 300, 'text');
    if (!explanation) throw new Error('Gemini returned no content');

    // Persist explanation back to signals table if signal.id was provided
    if (signal.id) {
      await supabase
        .from('signals')
        .update({ ai_explanation: explanation })
        .eq('id', signal.id);
    }

    return new Response(
      JSON.stringify({ explanation }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in explain-signal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
