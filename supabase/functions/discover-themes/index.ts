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

  try {
    const { unmappedSignals, existingThemes } = await req.json();
    
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

    const fullPrompt = `You are a market analyst identifying emerging investment themes from signal patterns.\n\n${prompt}`;
    const suggestions = await callGemini(fullPrompt, 1500, 'text');
    if (!suggestions) throw new Error('Gemini returned no content');

    // Persist suggestions to DB so they can be used by the system
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    await supabase.from('discovered_theme_suggestions').upsert({
      suggestions_text: suggestions,
      generated_at: new Date().toISOString(),
      model: 'gemini-2.0-flash',
    }, { onConflict: 'generated_at', ignoreDuplicates: false }).then(() => {}).catch(() => {
      // Table may not exist — log but don't fail the response
      console.log('[discover-themes] Could not persist to DB — table may not exist yet');
    });

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
