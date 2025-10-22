import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Web search function using Perplexity
async function searchWeb(query: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
  if (!PERPLEXITY_API_KEY) {
    return '[Web search unavailable - API key not configured]';
  }

  try {
    console.log('Performing web search for:', query);
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a financial news analyst. Provide concise, factual summaries of recent market news and developments. Focus on material events, earnings, policy changes, and market-moving news. Include specific dates and figures when available.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 1000,
        search_recency_filter: 'week',
      }),
    });

    if (!response.ok) {
      console.error('Perplexity API error:', response.status);
      return '[Web search temporarily unavailable]';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '[No results found]';
  } catch (error) {
    console.error('Web search error:', error);
    return '[Web search error]';
  }
}

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
    let webSearchResults = '';
    
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
      
      // Perform web search for breaking news on top tickers
      const userQuery = messages[messages.length - 1]?.content || '';
      const searchQuery = `Latest financial news and market developments: ${userQuery}`;
      webSearchResults = await searchWeb(searchQuery);
      
    } catch (error) {
      console.error('Error fetching market data:', error);
      marketData = '\n\n[Note: Real-time data temporarily unavailable]';
    }
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build system prompt with real market data AND web search
    const systemPrompt = `You are an expert investment analyst assistant for Opportunity Radar, a platform that tracks investment signals across policy changes, institutional holdings (13F filings), insider transactions (Form 4), ETF flows, and market momentum.

PROPRIETARY MARKET DATA (Your Platform's Multi-Signal Analysis):
${marketData}

LATEST WEB SEARCH RESULTS (Breaking News & Market Developments):
${webSearchResults}

Additional Context:
${context ? JSON.stringify(context, null, 2) : 'No additional context provided'}

Your role:
- COMBINE both proprietary signals (from Opportunity Radar) AND breaking news (from web search)
- Cross-validate: If web news mentions a ticker, check if it appears in our signals
- Identify convergence: Breaking news + multiple signals = HIGH CONVICTION opportunity
- Explain complex financial data in clear, actionable terms
- Be concise but thorough (2-4 sentences for most responses)
- ALWAYS cite specific sources: "According to our 13F data..." or "Breaking news shows..."
- Distinguish between our proprietary data vs. public news

Analysis Framework:
1. Check proprietary signals first (13F, Form 4, Policy, ETF flows)
2. Validate with breaking news from web search
3. Look for convergence (multiple signal types + news = strongest opportunities)
4. Provide conviction level based on signal diversity

Remember: You have BOTH proprietary multi-signal data AND real-time web search. This dual-source approach is your competitive advantage.`;

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
