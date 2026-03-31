import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { callGemini } from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { theme, score, signals, recentPerformance } = await req.json();
    
    const prompt = `Create a compelling 2-3 sentence alert narrative for this investment opportunity:

Theme: ${theme.name}
Current Score: ${score}
Recent Signals: ${signals.length} new signals
Signal Types: ${signals.map((s: any) => s.signal_type).join(', ')}
${recentPerformance ? `Recent Performance: ${recentPerformance}` : ''}

Write an engaging narrative that:
1. Starts with an emoji relevant to the theme
2. Explains why this is significant NOW
3. Includes specific data points (number of signals, key players)
4. Mentions historical context if relevant
5. Ends with actionable insight

Style: Professional but engaging, like a Bloomberg alert.`;

    const fullPrompt = `You are a financial writer creating compelling investment alerts that drive action.\n\n${prompt}`;
    const narrative = await callGemini(fullPrompt, 300, 'text');
    if (!narrative) throw new Error('Gemini returned no content');

    return new Response(
      JSON.stringify({ narrative }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-alert-narrative:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
