import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { signals, themeName, days: rawDays } = await req.json();
    const days = Math.max(1, Math.min(365, parseInt(rawDays) || 7)); // validate: positive, max 1 year
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Prepare signal data for AI analysis
    const signalSummary = signals.map((s: any) => ({
      type: s.signal_type,
      text: s.value_text,
      date: s.observed_at
    }));

    const prompt = `Analyze these investment signals for the theme "${themeName}" from the last ${days} days and provide a concise 2-3 sentence "Why Now?" summary explaining the current investment opportunity:

Signals:
${JSON.stringify(signalSummary, null, 2)}

Focus on:
1. What's driving momentum now
2. Key catalysts (policy, institutional activity, insider moves, fund flows)
3. Why this is timely

Provide a clear, professional summary suitable for investors.`;

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
            content: 'You are a professional investment analyst. Provide clear, concise summaries of market opportunities based on signal data. Keep responses under 100 words.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.choices?.length) throw new Error('AI gateway returned empty choices array');
    const summary = data.choices[0].message.content;

    // Persist to theme_analyses
    await supabase
      .from('theme_analyses')
      .insert({
        theme_name: themeName,
        analysis_type: 'why_now',
        summary,
        signal_count: signals.length,
        days_window: days,
        model: 'gemini-2.5-flash',
      });

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-theme:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
