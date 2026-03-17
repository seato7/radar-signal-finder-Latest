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
    const { unmappedSignals, existingThemes } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const signalSummary = unmappedSignals.slice(0, 20).map((s: any) => ({
      type: s.signal_type,
      text: s.value_text,
      date: s.observed_at
    }));

    const prompt = `Analyze these recent investment signals that don't fit existing themes and identify emerging opportunities:

Unmapped Signals:
${JSON.stringify(signalSummary, null, 2)}

Existing Themes (avoid duplicating):
${existingThemes.map((t: any) => t.name).join(', ')}

Identify 1-3 potential NEW investment themes based on:
1. Clustering of similar signals
2. Emerging regulatory/policy trends
3. Institutional positioning patterns
4. Market momentum in specific sectors

For each potential theme, provide:
- Theme Name (2-4 words)
- Description (1 sentence)
- Why it's timely (1 sentence)
- Suggested keywords for tracking (5-8 keywords)
- Confidence Level (High/Medium/Low)

Only suggest themes with at least 3 supporting signals.`;

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
            content: 'You are a market analyst identifying emerging investment themes from signal patterns.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.choices?.length) throw new Error('AI gateway returned empty choices array');
    const suggestions = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in discover-themes:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
