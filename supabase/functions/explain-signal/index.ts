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
    const { signal } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a financial educator explaining investment signals clearly and concisely.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service temporarily unavailable' }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const explanation = data.choices[0].message.content;

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
