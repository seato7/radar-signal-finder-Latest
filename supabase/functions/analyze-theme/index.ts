// redeployed 2026-03-17
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
    const { signals, themeName, days: rawDays } = await req.json();
    const days = Math.max(1, Math.min(365, parseInt(rawDays) || 7));

    if (!Array.isArray(signals) || signals.length === 0) {
      return new Response(JSON.stringify({ error: 'signals array is required and must be non-empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

    const fullPrompt = `You are a professional investment analyst. Provide clear, concise summaries of market opportunities based on signal data. Keep responses under 100 words.\n\n${prompt}`;
    const summary = await callGemini(fullPrompt, 200, 'text');
    if (!summary) throw new Error('Gemini returned no content');

    // Persist to theme_analyses
    await supabase
      .from('theme_analyses')
      .insert({
        theme_name: themeName,
        analysis_type: 'why_now',
        summary,
        signal_count: signals.length,
        days_window: days,
        model: 'gemini-2.0-flash',
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
