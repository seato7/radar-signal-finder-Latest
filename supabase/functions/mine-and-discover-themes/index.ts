// redeployed 2026-03-17
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter } from "../_shared/slack-alerts.ts";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Mining data patterns from Supabase...');

    // Fetch recent patterns from all data sources
    const [congressionalTradesResult, earningsResult, optionsFlowResult, shortInterestResult] = await Promise.allSettled([
      supabase.from('congressional_trades').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('earnings').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('options_flow').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('short_interest').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    const congressionalTrades = congressionalTradesResult.status === 'fulfilled' ? congressionalTradesResult.value : { data: null };
    const earnings = earningsResult.status === 'fulfilled' ? earningsResult.value : { data: null };
    const optionsFlow = optionsFlowResult.status === 'fulfilled' ? optionsFlowResult.value : { data: null };
    const shortInterest = shortInterestResult.status === 'fulfilled' ? shortInterestResult.value : { data: null };

    // Aggregate ticker patterns
    const tickerFrequency: Record<string, { count: number; sources: Set<string>; signals: any[] }> = {};
    
    // Process congressional trades
    if (congressionalTrades.data) {
      for (const trade of congressionalTrades.data) {
        if (!tickerFrequency[trade.ticker]) {
          tickerFrequency[trade.ticker] = { count: 0, sources: new Set(), signals: [] };
        }
        tickerFrequency[trade.ticker].count++;
        tickerFrequency[trade.ticker].sources.add('congressional');
        tickerFrequency[trade.ticker].signals.push({
          type: 'congressional_trade',
          data: `${trade.representative} (${trade.party}) ${trade.transaction_type} on ${trade.transaction_date}`,
          date: trade.transaction_date,
        });
      }
    }

    // Process earnings
    if (earnings.data) {
      for (const earning of earnings.data) {
        if (!tickerFrequency[earning.ticker]) {
          tickerFrequency[earning.ticker] = { count: 0, sources: new Set(), signals: [] };
        }
        tickerFrequency[earning.ticker].count++;
        tickerFrequency[earning.ticker].sources.add('earnings');
        tickerFrequency[earning.ticker].signals.push({
          type: 'earnings',
          data: `${earning.eps_surprise > 0 ? 'Beat' : 'Miss'} earnings by ${earning.eps_surprise}% on ${earning.report_date}`,
          date: earning.report_date,
        });
      }
    }

    // Process options flow
    if (optionsFlow.data) {
      for (const option of optionsFlow.data) {
        if (!tickerFrequency[option.ticker]) {
          tickerFrequency[option.ticker] = { count: 0, sources: new Set(), signals: [] };
        }
        tickerFrequency[option.ticker].count++;
        tickerFrequency[option.ticker].sources.add('options');
        tickerFrequency[option.ticker].signals.push({
          type: 'options_flow',
          data: `${option.option_type} ${option.sentiment} - ${option.volume} contracts at $${option.strike}`,
          date: option.trade_date,
        });
      }
    }

    // Process short interest
    if (shortInterest.data) {
      for (const short of shortInterest.data) {
        if (!tickerFrequency[short.ticker]) {
          tickerFrequency[short.ticker] = { count: 0, sources: new Set(), signals: [] };
        }
        tickerFrequency[short.ticker].count++;
        tickerFrequency[short.ticker].sources.add('short_interest');
        tickerFrequency[short.ticker].signals.push({
          type: 'short_interest',
          data: `Short interest ${short.short_interest_ratio}% as of ${short.settlement_date}`,
          date: short.settlement_date,
        });
      }
    }

    // Identify high-signal tickers (appearing across multiple sources)
    const hotTickers = Object.entries(tickerFrequency)
      .filter(([_, data]) => data.sources.size >= 2 && data.count >= 5) // AND: require both multi-source AND minimum count
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([ticker, data]) => ({
        ticker,
        signal_count: data.count,
        sources: Array.from(data.sources),
        signals: data.signals,
      }));

    console.log(`Found ${hotTickers.length} high-signal tickers`);

    if (hotTickers.length === 0) {
      return new Response(
        JSON.stringify({ discovered: [], message: 'No significant patterns detected' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch existing themes from Supabase
    const { data: existingThemes } = await supabase
      .from('themes')
      .select('name')
      .order('created_at', { ascending: false });
    const existingThemeNames = (existingThemes || []).map((t: any) => t.name);

    // Use AI to discover themes from patterns
    const prompt = `Analyze these high-activity tickers with cross-source signals and identify emerging investment themes:

HOT TICKERS WITH MULTI-SOURCE SIGNALS:
${JSON.stringify(hotTickers, null, 2)}

EXISTING THEMES (DO NOT DUPLICATE):
${existingThemeNames.join(', ')}

Task: Identify 3-5 NEW investment themes by:
1. Clustering tickers that share common characteristics (sector, trend, catalyst)
2. Identifying regulatory/policy drivers from congressional activity
3. Finding institutional positioning patterns from options flow
4. Detecting market momentum from earnings beats and short squeezes

For each NEW theme discovered, provide EXACTLY this format:
THEME: [Theme Name - 2-4 words]
DESCRIPTION: [One sentence explaining the opportunity]
WHY_NOW: [One sentence on timing/catalyst]
KEYWORDS: [comma-separated, 5-10 keywords for signal matching]
TICKERS: [comma-separated tickers that fit this theme]
CONFIDENCE: [High/Medium/Low]
---

Requirements:
- Each theme must have at least 3 supporting tickers from the hot list
- Keywords should be specific enough to match relevant signals
- Focus on actionable, timely opportunities
- No generic themes like "Technology" or "Growth Stocks"`;

    console.log('Calling AI for theme discovery...');
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
            content: 'You are an expert market analyst specializing in identifying emerging investment themes from multi-source signal data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiSuggestions = data.choices[0].message.content;
    console.log('AI Suggestions:', aiSuggestions);

    // Parse AI response into structured themes
    const discoveredThemes = [];
    const themeBlocks = aiSuggestions.split('---').filter((b: string) => b.trim());
    
    for (const block of themeBlocks) {
      const themeMatch = block.match(/THEME:\s*(.+)/i);
      const descMatch = block.match(/DESCRIPTION:\s*(.+)/i);
      const whyNowMatch = block.match(/WHY_NOW:\s*(.+)/i);
      const keywordsMatch = block.match(/KEYWORDS:\s*(.+)/i);
      const tickersMatch = block.match(/TICKERS:\s*(.+)/i);
      const confidenceMatch = block.match(/CONFIDENCE:\s*(High|Medium|Low)/i);
      
      if (themeMatch && keywordsMatch) {
        const keywords = keywordsMatch[1].split(',').map((k: string) => k.trim()).filter(Boolean);
        const tickers = tickersMatch ? tickersMatch[1].split(',').map((t: string) => t.trim()).filter(Boolean) : [];
        
        discoveredThemes.push({
          name: themeMatch[1].trim(),
          description: descMatch ? descMatch[1].trim() : '',
          why_now: whyNowMatch ? whyNowMatch[1].trim() : '',
          keywords,
          tickers,
          confidence: confidenceMatch ? confidenceMatch[1] : 'Medium',
          alpha: 1.0,
        });
      }
    }

    console.log(`Parsed ${discoveredThemes.length} themes from AI response`);

    // Create themes in Supabase
    const createdThemes = [];
    for (const theme of discoveredThemes) {
      try {
        const { data: created, error } = await supabase
          .from('themes')
          .upsert({
            name: theme.name,
            keywords: theme.keywords || [],
            alpha: 1.0,
            metadata: {
              discovered: true,
              tickers: theme.tickers || []
            }
          }, { onConflict: 'name', ignoreDuplicates: true })
          .select()
          .single();
        
        if (!error && created) {
          createdThemes.push(created);
          console.log(`Created theme: ${theme.name}`);
        }
      } catch (error) {
        console.error(`Failed to create theme ${theme.name}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    
    // Log heartbeat
    await logHeartbeat(supabase, {
      function_name: 'mine-and-discover-themes',
      status: 'success',
      duration_ms: duration,
      rows_inserted: createdThemes.length,
    });
    
    // Send Slack success alert
    await slackAlerter.sendLiveAlert({
      etlName: 'mine-and-discover-themes',
      status: 'success',
      latencyMs: duration,
      duration: duration,
      rowsInserted: createdThemes.length,
    });

    return new Response(
      JSON.stringify({ 
        discovered: createdThemes,
        patterns_analyzed: hotTickers.length,
        themes_created: createdThemes.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in mine-and-discover-themes:', error);
    
    // Send Slack failure alert
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'mine-and-discover-themes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
