import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportData, reportType } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Generate report content with AI
    const prompt = `Create a professional investment report in markdown format:

Report Type: ${reportType}
Data: ${JSON.stringify(reportData, null, 2)}

Structure:
# Investment Analysis Report
## Executive Summary
- Key findings (3-5 bullet points)

## Themes Analysis
For each theme:
- Current Score & Trend
- Signal Summary
- Risk Assessment
- Recommendation

## Market Context
- Overall market conditions
- Sector rotation insights

## Appendix
- Detailed signal breakdown
- Methodology notes

Keep it:
- Professional and data-driven
- Clear formatting with headers
- Actionable recommendations
- Under 1000 words

Use markdown formatting for easy conversion to PDF.`;

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
            content: 'You are creating professional investment reports in markdown format.'
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
    const reportMarkdown = data.choices[0].message.content;

    // Return markdown (client can convert to PDF using libraries like jsPDF or html2pdf)
    return new Response(
      JSON.stringify({ 
        reportMarkdown,
        metadata: {
          generatedAt: new Date().toISOString(),
          reportType
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-pdf-report:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
