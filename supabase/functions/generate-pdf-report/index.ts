// redeployed 2026-03-17
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
    const { reportData, reportType } = await req.json();

    if (!reportData || typeof reportData !== 'object') {
      return new Response(JSON.stringify({ error: 'reportData object is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const validReportTypes = ['portfolio', 'theme', 'asset', 'backtest', 'comprehensive'];
    if (reportType && !validReportTypes.includes(reportType)) {
      return new Response(JSON.stringify({ error: `reportType must be one of: ${validReportTypes.join(', ')}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

    const fullPrompt = `You are creating professional investment reports in markdown format.\n\n${prompt}`;
    const reportMarkdown = await callGemini(fullPrompt, 2000, 'text');
    if (!reportMarkdown) throw new Error('Gemini returned no content');

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
