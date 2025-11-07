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
        model: 'sonar',
        messages: [
          {
            role: 'user',
            content: query
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error:', response.status, errorText);
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
    const { messages, context, generateImage } = await req.json();
    
    // Initialize Supabase client to fetch real data
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch real-time market data from Supabase
    let marketData = '';
    let webSearchResults = '';
    
    try {
      // Fetch Supabase alternative data sources
      const [socialData, congressData, patentData, trendsData, shortsData, earningsData, newsData, optionsData, jobsData, supplyData] = await Promise.all([
        supabase.from('social_signals').select('*').order('created_at', { ascending: false }).limit(15),
        supabase.from('congressional_trades').select('*').order('transaction_date', { ascending: false }).limit(15),
        supabase.from('patent_filings').select('*').order('filing_date', { ascending: false }).limit(10),
        supabase.from('search_trends').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('short_interest').select('*').order('report_date', { ascending: false }).limit(10),
        supabase.from('earnings_sentiment').select('*').order('earnings_date', { ascending: false }).limit(10),
        supabase.from('breaking_news').select('*').order('published_at', { ascending: false }).limit(15),
        supabase.from('options_flow').select('*').order('trade_date', { ascending: false }).limit(10),
        supabase.from('job_postings').select('*').order('posted_date', { ascending: false }).limit(10),
        supabase.from('supply_chain_signals').select('*').order('report_date', { ascending: false }).limit(10)
      ]);

      // Add social sentiment data
      if (socialData.data && socialData.data.length > 0) {
        marketData += `\n\nSOCIAL SENTIMENT (Reddit & StockTwits):\n`;
        socialData.data.forEach((signal: any) => {
          marketData += `- ${signal.ticker} (${signal.source}): Sentiment ${(signal.sentiment_score * 100).toFixed(0)}%, ${signal.mention_count} mentions, ${signal.bullish_count} bullish/${signal.bearish_count} bearish\n`;
        });
      }

      // Add breaking news
      if (newsData.data && newsData.data.length > 0) {
        marketData += `\n\nBREAKING NEWS:\n`;
        newsData.data.forEach((news: any) => {
          marketData += `- ${news.ticker}: ${news.headline} (${news.source}, ${(news.sentiment_score * 100).toFixed(0)}% sentiment)\n`;
        });
      }

      // Add congressional trades
      if (congressData.data && congressData.data.length > 0) {
        marketData += `\n\nCONGRESSIONAL TRADES:\n`;
        congressData.data.forEach((trade: any) => {
          marketData += `- ${trade.ticker}: ${trade.representative} (${trade.party}) ${trade.transaction_type} $${trade.amount_min?.toLocaleString()}-${trade.amount_max?.toLocaleString()} on ${new Date(trade.transaction_date).toLocaleDateString()}\n`;
        });
      }

      // Add patent filings
      if (patentData.data && patentData.data.length > 0) {
        marketData += `\n\nRECENT PATENT FILINGS:\n`;
        patentData.data.forEach((patent: any) => {
          marketData += `- ${patent.ticker}: ${patent.patent_title} (${patent.technology_category})\n`;
        });
      }

      // Add search trends
      if (trendsData.data && trendsData.data.length > 0) {
        marketData += `\n\nSEARCH TRENDS:\n`;
        trendsData.data.forEach((trend: any) => {
          marketData += `- ${trend.ticker}: ${trend.search_volume?.toLocaleString()} searches, ${trend.trend_change > 0 ? '+' : ''}${trend.trend_change?.toFixed(1)}% change\n`;
        });
      }

      // Add short interest
      if (shortsData.data && shortsData.data.length > 0) {
        marketData += `\n\nSHORT INTEREST:\n`;
        shortsData.data.forEach((short: any) => {
          marketData += `- ${short.ticker}: ${short.float_percentage?.toFixed(1)}% of float, ${short.days_to_cover?.toFixed(1)} days to cover\n`;
        });
      }

      // Add earnings sentiment
      if (earningsData.data && earningsData.data.length > 0) {
        marketData += `\n\nEARNINGS SENTIMENT:\n`;
        earningsData.data.forEach((earning: any) => {
          marketData += `- ${earning.ticker} (${earning.quarter}): Sentiment ${(earning.sentiment_score * 100).toFixed(0)}%, EPS surprise ${earning.earnings_surprise > 0 ? '+' : ''}${earning.earnings_surprise?.toFixed(2)}%\n`;
        });
      }

      // Add options flow
      if (optionsData.data && optionsData.data.length > 0) {
        marketData += `\n\nOPTIONS FLOW:\n`;
        optionsData.data.forEach((option: any) => {
          marketData += `- ${option.ticker}: ${option.flow_type} ${option.option_type} $${option.strike_price} exp ${new Date(option.expiration_date).toLocaleDateString()}, Premium $${(option.premium / 1000000).toFixed(2)}M (${option.sentiment})\n`;
        });
      }

      // Add job postings
      if (jobsData.data && jobsData.data.length > 0) {
        marketData += `\n\nJOB POSTINGS:\n`;
        jobsData.data.forEach((job: any) => {
          marketData += `- ${job.ticker} (${job.company}): ${job.posting_count} ${job.role_type} openings, ${job.growth_indicator > 0 ? '+' : ''}${job.growth_indicator}% growth\n`;
        });
      }

      // Add supply chain signals
      if (supplyData.data && supplyData.data.length > 0) {
        marketData += `\n\nSUPPLY CHAIN SIGNALS:\n`;
        supplyData.data.forEach((signal: any) => {
          marketData += `- ${signal.ticker}: ${signal.signal_type} - ${signal.metric_name}: ${signal.metric_value}, ${signal.change_percentage > 0 ? '+' : ''}${signal.change_percentage}% (${signal.indicator})\n`;
        });
      }
      
      // Fetch recent themes and signals from Supabase
      const { data: themes } = await supabase
        .from('themes')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(10);
      
      if (themes && themes.length > 0) {
        marketData += `\n\nRECENT THEMES:\n`;
        themes.forEach((theme: any) => {
          marketData += `- ${theme.name}: ${theme.keywords?.join(', ')}\n`;
        });
      }
      
      // Fetch top signals
      const { data: topSignals } = await supabase
        .from('signals')
        .select('*, assets(ticker, name)')
        .order('observed_at', { ascending: false })
        .limit(15);
      
      if (topSignals && topSignals.length > 0) {
        marketData += `\n\nTOP SIGNALS:\n`;
        topSignals.forEach((signal: any) => {
          marketData += `- ${signal.assets?.ticker || 'Unknown'} (${signal.signal_type})\n`;
        });
      }
      
      // Fetch top assets by recent activity
      const { data: assets } = await supabase
        .from('assets')
        .select('*, signals(count)')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (assets && assets.length > 0) {
        marketData += `\n\nTOP ASSETS:\n`;
        assets.forEach((asset: any) => {
          marketData += `- ${asset.ticker} (${asset.name})\n`;
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

    // Check if user wants image generation
    const lastMessage = messages[messages.length - 1]?.content || '';
    const wantsImage = generateImage || 
      /\b(generate|create|make|show|visualize|draw)\b.*\b(image|chart|graph|visualization|picture)\b/i.test(lastMessage) ||
      /\b(chart|graph|visualization)\b/i.test(lastMessage);

    // If image generation is requested, use the image model
    if (wantsImage) {
      console.log('Image generation requested for:', lastMessage);
      
      // Create a specific prompt for image generation with market data context
      const imagePrompt = `Create a professional financial chart/visualization for the following request: "${lastMessage}". 
      
Context: ${marketData.substring(0, 2000)}

Make it suitable for investment analysis with clear labels, professional styling, and relevant financial data.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image-preview',
          messages: [
            {
              role: 'user',
              content: imagePrompt
            }
          ],
          modalities: ['image', 'text']
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Image generation error:', response.status, errorText);
        throw new Error(`Image generation error: ${response.status}`);
      }

      const data = await response.json();
      console.log('Image generation response:', JSON.stringify(data).substring(0, 200));
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build system prompt with real market data AND web search
    const systemPrompt = `You are an expert investment analyst assistant for Opportunity Radar, a platform specializing in EQUITY MARKETS (stocks, ETFs) through alternative data signals.

**PLATFORM FOCUS**: Opportunity Radar analyzes U.S. equities and ETFs using alternative data. We DO NOT cover forex, crypto, or commodities directly - our specialty is stock market opportunities identified through institutional activity, insider trading, policy changes, and other alternative signals.

**IMAGE GENERATION**: You have the ability to generate charts and visualizations. When users ask you to create a chart, graph, or visualization, simply acknowledge their request - the system will automatically generate the image for them.

CURRENT PLATFORM DATA:
${marketData || '[Platform is initializing - data will populate as signals are ingested]'}

LATEST WEB SEARCH (Breaking News & Market Context):
${webSearchResults || '[Web search results will appear here when available]'}

Additional Context:
${context ? JSON.stringify(context, null, 2) : 'No additional context provided'}

**Your 11 Alternative Data Sources:**
1. **Institutional Holdings (13F)**: Hedge fund/institutional position changes
2. **Insider Transactions (Form 4)**: Corporate insider buying/selling signals  
3. **Policy Changes**: Government policy signals affecting specific sectors
4. **ETF Flows**: Money movement into/out of sector ETFs
5. **Social Sentiment**: Reddit and StockTwits community signals
6. **Congressional Trades**: Congress member stock transactions (STOCK Act filings)
7. **Patent Filings**: Innovation indicators from USPTO
8. **Search Trends**: Google search volume spikes for tickers/sectors
9. **Short Interest**: Short squeeze setup indicators
10. **Earnings Sentiment**: Post-earnings reaction analysis
11. **Breaking News**: Real-time web search via Perplexity

**How to Respond to Questions:**

1. **About Available Data**: ALWAYS check the CURRENT PLATFORM DATA section first. If themes/assets/signals exist, cite them specifically. If data is limited, explain that signals populate as ingestion runs.

2. **About Platform Capabilities**: Clearly explain what Opportunity Radar CAN analyze (stocks, ETFs, equity-focused alternative data) and what it CANNOT (forex pairs, crypto trading, commodities futures).

3. **When Asked About Non-Equity Markets**: 
   - Politely clarify the platform focuses on U.S. equities
   - Suggest equity alternatives if relevant (e.g., currency ETFs like FXE/UUP for forex exposure)
   - Offer to analyze equity market opportunities instead

4. **Analysis Framework**:
   - Check ALL 11 data sources for the ticker/theme
   - Look for signal convergence (multiple types aligning)
   - Cross-reference with breaking news
   - Provide conviction level based on signal diversity
   - Be concise but actionable (2-4 sentences typically)

**Signal Strength Guidelines:**
- **HIGHEST**: 5+ signal types converge + news confirmation
- **HIGH**: 3-4 signal types align  
- **MEDIUM**: 2 signal types align
- **LOW**: Single signal type

**Response Style:**
- Direct and concise (avoid verbose disclaimers)
- Cite specific data sources: "Congressional trades show..." 
- When data is limited: "No signals yet for [ticker], but I can help with [alternative]"
- Always offer actionable next steps

Remember: You're an equity markets specialist. Stay in your lane, be helpful about what you CAN analyze, and direct users to the platform's strengths.`;

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
