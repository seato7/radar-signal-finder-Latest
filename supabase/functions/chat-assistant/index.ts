import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    
    // Initialize Supabase client to fetch real data
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch real-time market data from backend API
    const backendUrl = Deno.env.get('BACKEND_URL') || 'https://opportunity-radar-api-production.up.railway.app';
    
    let marketData = '';
    try {
      // Fetch recent themes and signals
      const radarResponse = await fetch(`${backendUrl}/api/radar?days=7`);
      if (radarResponse.ok) {
        const radarData = await radarResponse.json();
        marketData += `\n\nRECENT THEMES (Last 7 Days):\n`;
        radarData.themes?.slice(0, 10).forEach((theme: any) => {
          marketData += `- ${theme.name}: ${theme.signal_count} signals, Score: ${theme.combined_score?.toFixed(1) || 'N/A'}\n`;
        });
        
        marketData += `\n\nTOP SIGNALS:\n`;
        radarData.top_signals?.slice(0, 15).forEach((signal: any) => {
          marketData += `- ${signal.ticker} (${signal.signal_type}): ${signal.summary || signal.headline || 'N/A'}\n`;
        });
      }
      
      // Fetch top assets
      const assetsResponse = await fetch(`${backendUrl}/api/assets?limit=20`);
      if (assetsResponse.ok) {
        const assetsData = await assetsResponse.json();
        marketData += `\n\nTOP ASSETS:\n`;
        assetsData.assets?.slice(0, 20).forEach((asset: any) => {
          marketData += `- ${asset.ticker} (${asset.name}): Score ${asset.combined_score?.toFixed(1) || 'N/A'}\n`;
        });
      }
    } catch (error) {
      console.error('Error fetching market data:', error);
      marketData = '\n\n[Note: Real-time data temporarily unavailable]';
    }
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build system prompt with real market data
    const systemPrompt = `You are an expert investment analyst assistant for Opportunity Radar, a platform that tracks investment signals across policy changes, institutional holdings (13F filings), insider transactions (Form 4), ETF flows, and market momentum.

REAL-TIME MARKET DATA:
${marketData}

Additional Context:
${context ? JSON.stringify(context, null, 2) : 'No additional context provided'}

Your role:
- Answer questions using the REAL-TIME DATA provided above
- Identify specific opportunities from the themes and signals listed
- Explain complex financial data in clear, actionable terms
- Provide investment insights based on the multi-signal data
- Be concise but thorough (2-4 sentences for most responses)
- ALWAYS cite specific tickers, themes, and data points from the real-time data
- If asked about "biggest gainers" or "top opportunities", reference the actual assets and themes above

Remember: You have access to real market data. Use it to provide specific, actionable insights.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
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
      throw new Error(`AI gateway error: ${response.status}`);
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('Error in chat-assistant:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
