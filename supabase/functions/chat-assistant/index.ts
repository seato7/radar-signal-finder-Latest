import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendErrorAlert } from '../_shared/error-alerter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Web search function using Firecrawl
async function searchWeb(query: string): Promise<string> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    return '[Web search unavailable - Firecrawl API key not configured]';
  }

  try {
    console.log('Performing web search via Firecrawl for:', query);
    
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ['markdown'] }
      }),
    });

    if (!response.ok) {
      console.error('Firecrawl search error:', response.status);
      return '[Web search temporarily unavailable]';
    }

    const data = await response.json();
    const results = data.data || [];
    
    if (results.length === 0) {
      return '[No search results found]';
    }

    // Format results for the chat context
    return results.map((r: any, i: number) => 
      `[${i + 1}] ${r.title || 'Untitled'}\nURL: ${r.url || 'N/A'}\n${(r.markdown || r.description || '').substring(0, 500)}`
    ).join('\n\n');
    
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
      // Fetch Supabase alternative data sources (INCLUDING ALL ENHANCED SIGNALS)
      const [socialData, congressData, patentData, trendsData, shortsData, earningsData, newsData, optionsData, jobsData, supplyData, forexTech, economicInd, cotReports, forexSent, advancedTech, darkPool, cryptoOnchain, smartMoney, newsSentiment, patterns, aiReports] = await Promise.all([
        supabase.from('social_signals').select('*').order('created_at', { ascending: false }).limit(15),
        supabase.from('congressional_trades').select('*').order('transaction_date', { ascending: false }).limit(15),
        supabase.from('patent_filings').select('*').order('filing_date', { ascending: false }).limit(10),
        supabase.from('search_trends').select('*').order('created_at', { ascending: false }).limit(10),
        supabase.from('short_interest').select('*').order('report_date', { ascending: false }).limit(10),
        supabase.from('earnings_sentiment').select('*').order('earnings_date', { ascending: false }).limit(10),
        supabase.from('breaking_news').select('*').order('published_at', { ascending: false }).limit(15),
        supabase.from('options_flow').select('*').order('trade_date', { ascending: false }).limit(10),
        supabase.from('job_postings').select('*').order('posted_date', { ascending: false }).limit(10),
        supabase.from('supply_chain_signals').select('*').order('report_date', { ascending: false }).limit(10),
        supabase.from('forex_technicals').select('*').order('timestamp', { ascending: false }).limit(15),
        supabase.from('economic_indicators').select('*').order('release_date', { ascending: false }).limit(10),
        supabase.from('cot_reports').select('*').order('report_date', { ascending: false }).limit(10),
        supabase.from('forex_sentiment').select('*').order('timestamp', { ascending: false }).limit(10),
        supabase.from('advanced_technicals').select('*').order('timestamp', { ascending: false }).limit(15),
        supabase.from('dark_pool_activity').select('*').order('trade_date', { ascending: false }).limit(10),
        supabase.from('crypto_onchain_metrics').select('*').order('timestamp', { ascending: false }).limit(10),
        supabase.from('smart_money_flow').select('*').order('timestamp', { ascending: false }).limit(10),
        supabase.from('news_sentiment_aggregate').select('*').order('date', { ascending: false }).limit(10),
        supabase.from('pattern_recognition').select('*').eq('status', 'confirmed').order('detected_at', { ascending: false }).limit(10),
        supabase.from('ai_research_reports').select('*').order('generated_at', { ascending: false }).limit(5)
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

      // Add FOREX technical indicators
      if (forexTech.data && forexTech.data.length > 0) {
        marketData += `\n\nFOREX TECHNICAL INDICATORS:\n`;
        forexTech.data.forEach((tech: any) => {
          marketData += `- ${tech.ticker}: RSI ${tech.rsi_14?.toFixed(2)} (${tech.rsi_signal}), MACD ${tech.macd_crossover}, MA ${tech.ma_crossover}, Close ${tech.close_price}\n`;
        });
      }

      // Add economic indicators
      if (economicInd.data && economicInd.data.length > 0) {
        marketData += `\n\nECONOMIC INDICATORS:\n`;
        economicInd.data.forEach((ind: any) => {
          marketData += `- ${ind.country} ${ind.indicator_type.toUpperCase()}: ${ind.value} (prev: ${ind.previous_value}, forecast: ${ind.forecast_value}) [${ind.impact} impact]\n`;
        });
      }

      // Add COT reports with data age indicator
      if (cotReports.data && cotReports.data.length > 0) {
        const mostRecentCot = cotReports.data[0];
        const cotDaysAgo = mostRecentCot.report_date 
          ? Math.floor((Date.now() - new Date(mostRecentCot.report_date).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        marketData += `\n\nCOT POSITIONING (Institutional) - ${cotDaysAgo !== null ? `Data from ${cotDaysAgo} days ago - LAGGING INDICATOR` : 'Recent data'}:\n`;
        cotReports.data.forEach((cot: any) => {
          marketData += `- ${cot.ticker}: Large specs net ${cot.noncommercial_net > 0 ? 'LONG' : 'SHORT'} ${Math.abs(cot.noncommercial_net).toLocaleString()} contracts (${cot.sentiment})\n`;
        });
      }

      // Add forex sentiment
      if (forexSent.data && forexSent.data.length > 0) {
        marketData += `\n\nFOREX SENTIMENT:\n`;
        forexSent.data.forEach((sent: any) => {
          marketData += `- ${sent.ticker}: Retail ${sent.retail_long_pct?.toFixed(0)}% long / ${sent.retail_short_pct?.toFixed(0)}% short (${sent.retail_sentiment})\n`;
        });
      }

      // Add ADVANCED TECHNICAL INDICATORS
      if (advancedTech.data && advancedTech.data.length > 0) {
        marketData += `\n\nADVANCED TECHNICAL ANALYSIS:\n`;
        advancedTech.data.forEach((tech: any) => {
          marketData += `- ${tech.ticker} (${tech.asset_class}): ${tech.trend_strength}, VWAP $${tech.vwap?.toFixed(2)}, ${tech.breakout_signal}, Stoch ${tech.stochastic_signal}\n`;
        });
      }

      // Add DARK POOL ACTIVITY (stocks only)
      if (darkPool.data && darkPool.data.length > 0) {
        marketData += `\n\nDARK POOL ACTIVITY:\n`;
        darkPool.data.forEach((dp: any) => {
          marketData += `- ${dp.ticker}: ${dp.dark_pool_percentage?.toFixed(1)}% dark pool (${dp.signal_type}, ${dp.signal_strength})\n`;
        });
      }

      // Add CRYPTO ON-CHAIN METRICS
      if (cryptoOnchain.data && cryptoOnchain.data.length > 0) {
        marketData += `\n\nCRYPTO ON-CHAIN METRICS:\n`;
        cryptoOnchain.data.forEach((onchain: any) => {
          marketData += `- ${onchain.ticker}: ${onchain.active_addresses?.toLocaleString()} active addresses, ${onchain.whale_signal} whales, Exchange flow: ${onchain.exchange_flow_signal}, Fear&Greed: ${onchain.fear_greed_index}\n`;
        });
      }

      // Add SMART MONEY FLOW
      if (smartMoney.data && smartMoney.data.length > 0) {
        marketData += `\n\nSMART MONEY FLOW:\n`;
        smartMoney.data.forEach((sm: any) => {
          marketData += `- ${sm.ticker}: Smart money ${sm.smart_money_signal}, MFI ${sm.mfi?.toFixed(1)} (${sm.mfi_signal}), A/D trend: ${sm.ad_trend}\n`;
        });
      }

      // Add NEWS SENTIMENT AGGREGATES
      if (newsSentiment.data && newsSentiment.data.length > 0) {
        marketData += `\n\nNEWS SENTIMENT ANALYSIS:\n`;
        newsSentiment.data.forEach((ns: any) => {
          marketData += `- ${ns.ticker}: ${ns.sentiment_label} (${ns.total_articles} articles, ${(ns.sentiment_score * 100).toFixed(0)}% score, buzz: ${ns.buzz_score?.toFixed(0)})\n`;
        });
      }

      // Add PATTERN RECOGNITION
      if (patterns.data && patterns.data.length > 0) {
        marketData += `\n\nCONFIRMED CHART PATTERNS:\n`;
        patterns.data.forEach((pattern: any) => {
          marketData += `- ${pattern.ticker}: ${pattern.pattern_type.replace('_', ' ').toUpperCase()} (${pattern.pattern_category}, ${pattern.confidence_score}% confidence, R:R ${pattern.risk_reward_ratio?.toFixed(2)})\n`;
        });
      }

      // Add AI RESEARCH REPORTS
      if (aiReports.data && aiReports.data.length > 0) {
        marketData += `\n\nRECENT AI RESEARCH REPORTS:\n`;
        aiReports.data.forEach((report: any) => {
          marketData += `- ${report.ticker}: ${report.recommendation.toUpperCase()} (${report.confidence_score}% confidence, ${report.report_type})\n`;
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
      
      // Perform web search for breaking news - with asset-targeted search
      const userQuery = messages[messages.length - 1]?.content || '';
      
      // Detect specific asset mentions for targeted search
      const assetPatterns: { pattern: RegExp; asset: string }[] = [
        { pattern: /\b(gold|GC=F|XAU|XAUUSD)\b/i, asset: 'gold' },
        { pattern: /\b(silver|SI=F|SLV|XAGUSD)\b/i, asset: 'silver' },
        { pattern: /\b(bitcoin|BTC|btcusd)\b/i, asset: 'bitcoin' },
        { pattern: /\b(ethereum|ETH|ethusd)\b/i, asset: 'ethereum' },
        { pattern: /\b(oil|crude|WTI|CL=F)\b/i, asset: 'oil' },
        { pattern: /\b(EUR\/USD|EURUSD)\b/i, asset: 'EURUSD' },
        { pattern: /\b(GBP\/USD|GBPUSD)\b/i, asset: 'GBPUSD' },
        { pattern: /\b(USD\/JPY|USDJPY)\b/i, asset: 'USDJPY' },
      ];
      
      let detectedAsset: string | null = null;
      for (const { pattern, asset } of assetPatterns) {
        if (pattern.test(userQuery)) {
          detectedAsset = asset;
          break;
        }
      }
      
      // Build search query - prioritize current price action for specific assets
      const searchQuery = detectedAsset 
        ? `${detectedAsset} current price action today trend direction latest news`
        : `Latest financial news and market developments: ${userQuery}`;
      
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
    const systemPrompt = `You are the InsiderPulse AI Assistant - an expert multi-asset investment analyst.

**IDENTITY RULES - CRITICAL:**
- You are the InsiderPulse AI Assistant
- NEVER identify yourself as Claude, GPT, Gemini, or say "I am trained by [company]"
- If asked about your model, respond: "I'm the InsiderPulse AI Assistant, powered by advanced language models to analyze market data."

**CRITICAL: DATA VALIDATION & RECENCY RULES**

1. **Data Priority Hierarchy** (newest data ALWAYS wins):
   - LATEST WEB SEARCH results → Real-time market action (HIGHEST PRIORITY)
   - Today's breaking news → Recent signals & headlines
   - Weekly data (COT, options flow) → Positioning context (LAGGING - reflects PAST positions)
   - Monthly/historical data → Long-term trends only

2. **Contradiction Detection - MANDATORY:**
   When platform data conflicts with web search results, you MUST:
   - Explicitly acknowledge the contradiction to the user FIRST
   - State which data is more recent
   - Prioritize real-time market action for trading recommendations
   - Example: "COT shows institutional longs, HOWEVER web search indicates gold is currently pulling back from highs. The real-time price action takes priority."

3. **Never Assume Platform Data is Current:**
   - Always check LATEST WEB SEARCH for the MOST RECENT price action
   - If web search shows a trend reversal, update your analysis accordingly
   - COT/institutional data reflects PAST positions, not current entries/exits
   - News headlines from days ago may be outdated

4. **Confidence Levels** (ALWAYS state these in your response):
   - HIGH confidence: Platform data AND web search align on direction
   - MEDIUM confidence: Partial alignment or mixed signals - recommend caution
   - LOW confidence: Data sources conflict - strongly recommend verification before action

**BEFORE MAKING ANY RECOMMENDATION - VERIFICATION CHECKLIST:**
✓ Step 1: Check LATEST WEB SEARCH - what does it say about current price action?
✓ Step 2: Does web search confirm or contradict platform data?
✓ Step 3: If contradiction exists, acknowledge it EXPLICITLY to the user
✓ Step 4: State data recency: "Based on [data type] from [timeframe], but real-time search shows [Y]"
✓ Step 5: Conclude with appropriate confidence level

**PLATFORM SCOPE - ALL TRADEABLE ASSETS:** 
InsiderPulse covers EVERYTHING tradeable: Stocks, ETFs, Forex, Crypto, Commodities, Options, Futures. You analyze ALL markets using diverse data sources tailored to each asset class.

**IMAGE GENERATION**: You have the ability to generate charts and visualizations. When users ask you to create a chart, graph, or visualization, simply acknowledge their request - the system will automatically generate the image for them.

CURRENT PLATFORM DATA (check web search for real-time validation):
${marketData || '[Platform is initializing - data will populate as signals are ingested]'}

LATEST WEB SEARCH (Breaking News & Market Context) - THIS IS HIGHEST PRIORITY FOR CURRENT PRICE ACTION:
${webSearchResults || '[Web search results will appear here when available]'}

Additional Context:
${context ? JSON.stringify(context, null, 2) : 'No additional context provided'}

**Your Data Sources by Asset Class:**

STOCKS & ETFs (11 sources):
1. **Institutional Holdings (13F)**: Hedge fund position changes (quarterly - lagging)
2. **Insider Transactions (Form 4)**: Corporate insider trading signals  
3. **Policy Changes**: Government policy affecting sectors
4. **ETF Flows**: Money movement into/out of sector ETFs
5. **Social Sentiment**: Reddit and StockTwits signals
6. **Congressional Trades**: Congress member stock transactions
7. **Patent Filings**: Innovation indicators from USPTO
8. **Search Trends**: Google search volume spikes
9. **Short Interest**: Short squeeze setups (bi-weekly - lagging)
10. **Earnings Sentiment**: Post-earnings reactions
11. **Breaking News**: Real-time web search (HIGHEST PRIORITY)

FOREX (5 sources):
1. **Technical Indicators**: RSI, MACD, Moving Averages, Bollinger Bands, ATR
2. **Economic Indicators**: Interest rates, GDP, CPI, NFP, PMI from central banks
3. **COT Reports**: CFTC institutional/speculator positioning (weekly - LAGGING)
4. **Retail Sentiment**: Broker positioning data (Oanda, IG)
5. **Interest Rate Differentials**: Fed vs ECB vs BoJ vs BoE rate spreads

CRYPTO (3 sources):
1. **Technical Indicators**: Same as forex - RSI, MACD, MA
2. **Social Sentiment**: Twitter, Reddit, StockTwits for crypto
3. **Exchange Flow**: Money movement on/off exchanges

COMMODITIES (2 sources):
1. **Technical Indicators**: RSI, MACD, MA for Gold, Silver, Oil, Gas
2. **Supply/Demand**: Economic indicators affecting commodities

**How to Respond to Multi-Asset Questions:**

1. **About Available Data**: ALWAYS check CURRENT PLATFORM DATA AND cross-reference with LATEST WEB SEARCH. We have stocks, forex pairs (EUR/USD, GBP/USD, USD/JPY, etc.), crypto (BTC/USD, ETH/USD, etc.), and commodities (XAUUSD, CRUDE, etc.).

2. **Cross-Asset Analysis**: When analyzing opportunities, consider correlations:
   - USD strength → EUR/USD down, USD/JPY up, Gold down, emerging market stocks down
   - Risk-on sentiment → Stocks up, Crypto up, AUD/USD up, Gold down
   - Interest rate hikes → Currency with higher rate strengthens

3. **Asset Class Selection**: 
   - Stocks: Use 13F, Form 4, policy, ETF flows, earnings
   - Forex: Use technicals, economic data, COT, sentiment, rate differentials
   - Crypto: Use technicals, social sentiment, exchange flows
   - Commodities: Use technicals, supply/demand, economic indicators

4. **Analysis Framework by Asset**:
   - STOCKS: Check all 11 equity sources + related forex/commodity impacts
   - FOREX: Check technicals + economic data + COT + sentiment + related equities
   - CRYPTO: Check technicals + social sentiment + related stocks (COIN, MSTR)
   - COMMODITIES: Check technicals + supply/demand + forex correlations
   - ALWAYS cross-reference with LATEST WEB SEARCH before concluding

**Signal Strength Guidelines:**
- **HIGHEST**: 5+ signal types converge + web search confirms direction
- **HIGH**: 3-4 signal types align + web search aligns
- **MEDIUM**: 2 signal types align OR mixed signals from web search
- **LOW**: Single signal type OR web search contradicts platform data

**Response Style:**
- FIRST check for contradictions between platform data and web search
- If contradictions exist, state them explicitly before analysis
- Provide multi-asset opportunities: "EUR/USD down + XYZ stock up due to USD strength"
- Cite specific data WITH recency: "COT from last week shows X, but today's news indicates Y"
- Always state your confidence level (HIGH/MEDIUM/LOW)
- Reference appropriate brokers: "Trade this on Oanda (forex), Binance (crypto), Alpaca (stocks)"

**Broker Recommendations:**
- Forex: Oanda, Forex.com, IG, Pepperstone, FXCM
- Crypto: Binance, Coinbase, Kraken, Gemini, KuCoin
- Stocks: Alpaca, Interactive Brokers, tastytrade
- Multi-asset: Interactive Brokers (stocks + forex + futures)

Remember: You are the InsiderPulse AI Assistant. ALWAYS validate platform data against real-time web search before making recommendations. When in doubt, express lower confidence and recommend the user verify with live charts.`;

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
        await sendErrorAlert('chat-assistant', new Error('Rate limit exceeded'), { status: 429 });
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        await sendErrorAlert('chat-assistant', new Error('AI credits exhausted'), { status: 402 });
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
    await sendErrorAlert('chat-assistant', error, { url: req.url });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
