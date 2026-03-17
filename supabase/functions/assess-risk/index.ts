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
    const { theme, signals, marketConditions } = await req.json();

    // Input validation
    if (!theme || typeof theme !== 'object' || !theme.name) {
      return new Response(JSON.stringify({ error: 'theme object with name is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!Array.isArray(signals)) {
      return new Response(JSON.stringify({ error: 'signals must be an array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Analyze signal diversity
    const signalTypes = [...new Set(signals.map((s: any) => s.signal_type))];
    const hasMultipleSignalTypes = signalTypes.length >= 3;
    const hasInstitutionalSupport = signals.some((s: any) => 
      s.signal_type.includes('bigmoney')
    );
    const hasInsiderBuying = signals.some((s: any) => 
      s.signal_type === 'insider_buy'
    );

    const prompt = `Assess the investment risk and conviction level for this opportunity:

Theme: ${theme.name}
Number of Signals: ${signals.length}
Signal Types: ${signalTypes.join(', ')}
Has Institutional Support: ${hasInstitutionalSupport}
Has Insider Buying: ${hasInsiderBuying}
Signal Diversity: ${hasMultipleSignalTypes ? 'High' : 'Low'}
${marketConditions ? `Market Conditions: ${marketConditions}` : ''}

Provide a risk assessment with:
1. Conviction Level (High/Medium/Low) with one-line reasoning
2. Key Risk Factors (2-3 bullet points)
3. Signal Quality Analysis (Are signals complementary or contradictory?)
4. Recommended Position Sizing guidance
5. Catalysts to watch

Format as a structured analysis that's easy to scan.`;

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
            content: 'You are a risk analyst providing clear, actionable risk assessments for investment opportunities.'
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
    const assessment = data.choices[0].message.content;

    // Persist to ai_research_reports (theme-scoped; ticker field uses theme name as surrogate key)
    await supabase
      .from('ai_research_reports')
      .upsert({
        ticker: theme?.name || 'THEME',
        asset_class: 'theme',
        report_type: 'risk_assessment',
        executive_summary: assessment.substring(0, 500),
        risk_assessment: assessment,
        generated_by: 'gemini-2.5-flash',
        metadata: {
          signalCount: signals.length,
          signalDiversity: signalTypes.length,
          hasInstitutionalSupport,
          hasInsiderBuying,
          theme_name: theme?.name || null,
        },
      }, { onConflict: 'ticker,report_type' });

    return new Response(
      JSON.stringify({
        assessment,
        metadata: {
          signalCount: signals.length,
          signalDiversity: signalTypes.length,
          hasInstitutionalSupport,
          hasInsiderBuying
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in assess-risk:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
