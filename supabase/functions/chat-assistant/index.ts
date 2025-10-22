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
    
    // Fetch real-time market data from backend API
    const backendUrl = Deno.env.get('BACKEND_URL') || 'https://opportunity-radar-api-production.up.railway.app';
    
    let marketData = '';
    let webSearchResults = '';
    
    try {
      // Fetch Supabase alternative data sources
      const [socialData, congressData, patentData, trendsData, shortsData, earningsData, newsData, twitterData, optionsData, jobsData, supplyData] = await Promise.all([
        supabase.from('social_signals').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('congressional_trades').select('*').order('transaction_date', { ascending: false }).limit(20),
        supabase.from('patent_filings').select('*').order('filing_date', { ascending: false }).limit(10),
        supabase.from('search_trends').select('*').order('period_start', { ascending: false }).limit(10),
        supabase.from('short_interest').select('*').order('report_date', { ascending: false }).limit(10),
        supabase.from('earnings_sentiment').select('*').order('earnings_date', { ascending: false }).limit(10),
        supabase.from('breaking_news').select('*').order('published_at', { ascending: false }).limit(15),
        supabase.from('twitter_signals').select('*').order('created_at', { ascending: false }).limit(15),
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

      // Add Twitter signals
      if (twitterData.data && twitterData.data.length > 0) {
        marketData += `\n\nTWITTER SIGNALS:\n`;
        twitterData.data.forEach((signal: any) => {
          marketData += `- ${signal.ticker}: ${signal.tweet_volume} tweets, Sentiment ${(signal.sentiment_score * 100).toFixed(0)}%, ${signal.bullish_count} bullish/${signal.bearish_count} bearish\n`;
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
      
      // Fetch recent themes and signals from backend
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

    // Check if user wants image generation
    const lastMessage = messages[messages.length - 1]?.content || '';
    const wantsImage = generateImage || 
      /\b(generate|create|make|show|visualize|chart|graph|image|picture)\b.*\b(image|chart|graph|visualization|picture)\b/i.test(lastMessage);

    // If image generation is requested, use the image model
    if (wantsImage) {
      console.log('Image generation requested');
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image-preview',
          messages: messages,
          modalities: ['image', 'text']
        }),
      });

      if (!response.ok) {
        throw new Error(`Image generation error: ${response.status}`);
      }

      const data = await response.json();
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build system prompt with real market data AND web search
    const systemPrompt = `You are an expert investment analyst assistant for Opportunity Radar, a platform that tracks investment signals across multiple alternative data sources.

**IMAGE GENERATION CAPABILITY**: You CAN generate images, charts, and visualizations! When users ask to "create a chart", "generate an image", "visualize data", etc., tell them you can do it and they should request it explicitly.

PROPRIETARY MARKET DATA (Your Platform's Multi-Signal Analysis):
${marketData}

LATEST WEB SEARCH RESULTS (Breaking News & Market Developments):
${webSearchResults}

Additional Context:
${context ? JSON.stringify(context, null, 2) : 'No additional context provided'}

Data Sources Available:
1. **Institutional Holdings**: 13F filings showing hedge fund/institutional positions
2. **Insider Transactions**: Form 4 filings of insider buying/selling
3. **Policy Changes**: Government policy signals affecting markets
4. **ETF Flows**: Money flows into/out of ETFs
5. **Social Sentiment**: Reddit and StockTwits sentiment analysis
6. **Congressional Trades**: Real-time tracking of Congress member stock trades
7. **Patent Filings**: Technology innovation indicators from USPTO
8. **Search Trends**: Google search volume changes
9. **Short Interest**: Short squeeze potential indicators
10. **Earnings Sentiment**: Post-earnings reaction analysis
11. **Breaking News**: Real-time web search via Perplexity

Your role:
- COMBINE all available data sources for comprehensive analysis
- Cross-validate: Look for convergence across multiple signals
- Identify high-conviction opportunities where multiple signals align
- Explain complex financial data in clear, actionable terms
- Be concise but thorough (2-4 sentences for most responses)
- ALWAYS cite specific sources: "According to congressional trades..." or "Social sentiment shows..."
- Distinguish between proprietary data types and breaking news

Analysis Framework:
1. Check ALL alternative data sources (social, congressional, patents, trends, shorts, earnings)
2. Validate with institutional signals (13F, Form 4, Policy, ETF flows)
3. Cross-reference with breaking news from web search
4. Look for convergence (multiple signal types + news = strongest opportunities)
5. Provide conviction level based on signal diversity and alignment

Signal Strength Hierarchy:
- **HIGHEST**: 5+ signal types align + breaking news confirmation
- **HIGH**: 3-4 signal types align
- **MEDIUM**: 2 signal types align
- **LOW**: Single signal type only

Remember: You have access to 11 different data sources. The more sources that align on a ticker, the higher your conviction should be.`;

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
