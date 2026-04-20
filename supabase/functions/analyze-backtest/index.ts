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
    const { backtestResults, strategy } = await req.json();

    if (!backtestResults || (Array.isArray(backtestResults) && backtestResults.length === 0)) {
      return new Response(JSON.stringify({ error: 'backtestResults is required and must be non-empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const prompt = `Analyze these backtest results and provide actionable insights:

Strategy: ${strategy}
Results: ${JSON.stringify(backtestResults, null, 2)}

Provide:
1. Key Performance Summary (2-3 sentences)
2. What worked well and why
3. Potential risks or weaknesses identified
4. Specific recommendations for optimization
5. Comparison to typical market benchmarks if applicable

Keep it practical and actionable for traders.`;

    const fullPrompt = `You are a quantitative trading analyst providing clear, data-driven insights on backtest results.\n\n${prompt}`;
    const insights = await callGemini(fullPrompt, 600, 'text');
    if (!insights) throw new Error('Gemini returned no content');

    // Persist to backtest_analyses
    await supabase
      .from('backtest_analyses')
      .insert({
        strategy_name: strategy,
        insights,
        backtest_result_snapshot: backtestResults,
        model: 'gemini-2.0-flash',
      });

    return new Response(
      JSON.stringify({ insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-backtest:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
