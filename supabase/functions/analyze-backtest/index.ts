// redeployed 2026-03-17
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
    const { backtestResults, strategy } = await req.json();

    if (!backtestResults || (Array.isArray(backtestResults) && backtestResults.length === 0)) {
      return new Response(JSON.stringify({ error: 'backtestResults is required and must be non-empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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
            content: 'You are a quantitative trading analyst providing clear, data-driven insights on backtest results.'
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
    const insights = data.choices[0].message.content;

    // Persist to backtest_analyses
    await supabase
      .from('backtest_analyses')
      .insert({
        strategy_name: strategy,
        insights,
        backtest_result_snapshot: backtestResults,
        model: 'gemini-2.5-flash',
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
