import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// SIGNAL TYPE → THEME DIRECT MAPPING
// This allows signals to be mapped even when asset lookup fails
// ============================================================================
const SIGNAL_TYPE_TO_THEME: Record<string, string[]> = {
  // Technical signals → broad market themes
  "technical_stochastic": ["AI & Semiconductors", "Big Tech & Consumer", "Banks & Financials"],
  "technical_rsi": ["AI & Semiconductors", "Big Tech & Consumer", "Banks & Financials"],
  "technical_ma_crossover": ["AI & Semiconductors", "Big Tech & Consumer", "Banks & Financials"],
  
  // Pattern signals
  "chart_pattern": ["AI & Semiconductors", "Big Tech & Consumer", "Banks & Financials"],
  
  // Dark pool → institutional activity themes
  "dark_pool_activity": ["Banks & Financials", "Big Tech & Consumer", "AI & Semiconductors"],
  "darkpool_block": ["Banks & Financials", "Big Tech & Consumer"],
  "darkpool_accumulation": ["Banks & Financials", "Big Tech & Consumer"],
  
  // Smart money → institutional themes
  "smart_money_flow": ["Banks & Financials", "Big Tech & Consumer", "AI & Semiconductors"],
  
  // Sentiment signals
  "sentiment_extreme": ["Big Tech & Consumer", "Fintech & Crypto", "Media & Entertainment"],
  "sentiment_bullish": ["Big Tech & Consumer", "AI & Semiconductors"],
  "sentiment_bearish": ["Big Tech & Consumer", "AI & Semiconductors"],
  
  // Crypto signals → Fintech & Crypto
  "crypto_whale_activity": ["Fintech & Crypto"],
  "crypto_exchange_outflow": ["Fintech & Crypto"],
  "crypto_exchange_inflow": ["Fintech & Crypto"],
  "onchain_whale": ["Fintech & Crypto"],
  "whale_accumulation": ["Fintech & Crypto"],
  "whale_distribution": ["Fintech & Crypto"],
  
  // COT positioning → Commodities
  "cot_positioning": ["Commodities & Mining", "Energy & Oil", "Fintech & Crypto"],
  "cot_bullish": ["Commodities & Mining", "Energy & Oil"],
  "cot_bearish": ["Commodities & Mining", "Energy & Oil"],
  
  // 13F/BigMoney holdings
  "bigmoney_hold_new": ["Banks & Financials", "Big Tech & Consumer"],
  "bigmoney_hold_increase": ["Banks & Financials", "Big Tech & Consumer"],
  "bigmoney_hold_decrease": ["Banks & Financials", "Big Tech & Consumer"],
  "bigmoney_hold": ["Banks & Financials", "Big Tech & Consumer"],
  "filing_13f_new": ["Banks & Financials", "Big Tech & Consumer"],
  "filing_13f_increase": ["Banks & Financials", "Big Tech & Consumer"],
  "filing_13f_decrease": ["Banks & Financials", "Big Tech & Consumer"],
  
  // Congressional/political
  "politician_buy": ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"],
  "politician_sell": ["Defense & Aerospace", "Big Tech & Consumer", "Banks & Financials"],
  "congressional_buy": ["Defense & Aerospace", "Big Tech & Consumer"],
  "congressional_sell": ["Defense & Aerospace", "Big Tech & Consumer"],
  
  // Policy signals
  "policy_approval": ["Banks & Financials", "Clean Energy & EVs", "Biotech & Healthcare"],
  "policy_rejection": ["Banks & Financials", "Clean Energy & EVs"],
  "policy_keyword": ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"],
  
  // Economic indicators → broad market
  "economic_indicator": ["Banks & Financials", "Industrial & Infrastructure"],
  
  // ETF flows
  "flow_pressure_etf": ["Big Tech & Consumer", "Banks & Financials", "AI & Semiconductors"],
  "etf_inflow": ["Big Tech & Consumer", "Banks & Financials"],
  "etf_outflow": ["Big Tech & Consumer", "Banks & Financials"],
  
  // Hiring/Jobs
  "capex_hiring": ["AI & Semiconductors", "Big Tech & Consumer", "Biotech & Healthcare"],
  "hiring_surge": ["AI & Semiconductors", "Big Tech & Consumer"],
  "job_growth": ["AI & Semiconductors", "Big Tech & Consumer"],
  
  // Form4/Insider
  "insider_buy": ["Big Tech & Consumer", "Banks & Financials"],
  "insider_sell": ["Big Tech & Consumer", "Banks & Financials"],
  "form4_buy": ["Big Tech & Consumer", "Banks & Financials"],
  "form4_sell": ["Big Tech & Consumer", "Banks & Financials"],
  
  // News/Social
  "news_mention": ["Big Tech & Consumer", "Media & Entertainment"],
  "breaking_news": ["Big Tech & Consumer", "Media & Entertainment"],
  "social_mention": ["Fintech & Crypto", "Media & Entertainment"],
  "reddit_mention": ["Fintech & Crypto", "Media & Entertainment"],
  
  // Options
  "options_unusual": ["Big Tech & Consumer", "AI & Semiconductors"],
  "unusual_options": ["Big Tech & Consumer", "AI & Semiconductors"],
  "options_sweep": ["Big Tech & Consumer", "AI & Semiconductors"],
  
  // Short interest
  "short_squeeze": ["Big Tech & Consumer", "AI & Semiconductors"],
  "short_interest_high": ["Big Tech & Consumer", "Banks & Financials"],
  
  // Patents
  "patent_filed": ["AI & Semiconductors", "Biotech & Healthcare", "Clean Energy & EVs"],
  "patent_granted": ["AI & Semiconductors", "Biotech & Healthcare"],
};

// Ticker → Theme mapping for known tickers
const TICKER_TO_THEME: Record<string, string> = {
  // AI & Semiconductors
  "NVDA": "AI & Semiconductors", "AMD": "AI & Semiconductors", "INTC": "AI & Semiconductors",
  "AVGO": "AI & Semiconductors", "QCOM": "AI & Semiconductors", "TSM": "AI & Semiconductors",
  "ASML": "AI & Semiconductors", "MU": "AI & Semiconductors", "ARM": "AI & Semiconductors",
  
  // Big Tech
  "AAPL": "Big Tech & Consumer", "MSFT": "Big Tech & Consumer", "GOOGL": "Big Tech & Consumer",
  "GOOG": "Big Tech & Consumer", "META": "Big Tech & Consumer", "AMZN": "Big Tech & Consumer",
  "NFLX": "Big Tech & Consumer", "CRM": "Big Tech & Consumer", "ORCL": "Big Tech & Consumer",
  
  // Banks
  "JPM": "Banks & Financials", "BAC": "Banks & Financials", "WFC": "Banks & Financials",
  "GS": "Banks & Financials", "MS": "Banks & Financials", "C": "Banks & Financials",
  
  // Crypto
  "BTC": "Fintech & Crypto", "ETH": "Fintech & Crypto", "SOL": "Fintech & Crypto",
  "COIN": "Fintech & Crypto", "MSTR": "Fintech & Crypto",
  
  // Energy
  "XOM": "Energy & Oil", "CVX": "Energy & Oil", "COP": "Energy & Oil", "SLB": "Energy & Oil",
  
  // Clean Energy
  "TSLA": "Clean Energy & EVs", "RIVN": "Clean Energy & EVs", "NIO": "Clean Energy & EVs",
  "ENPH": "Clean Energy & EVs", "FSLR": "Clean Energy & EVs",
  
  // Defense
  "LMT": "Defense & Aerospace", "RTX": "Defense & Aerospace", "NOC": "Defense & Aerospace",
  "BA": "Defense & Aerospace", "GD": "Defense & Aerospace",
  
  // Healthcare
  "JNJ": "Biotech & Healthcare", "PFE": "Biotech & Healthcare", "UNH": "Biotech & Healthcare",
  "LLY": "Biotech & Healthcare", "MRK": "Biotech & Healthcare",
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const batch_mode = body.batch_mode ?? body.batch ?? true; // Default to batch mode (use ?? not || to allow false)

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('🔄 Running improved batch signal-to-theme mapping...');
    
    // Get all themes to build name→id lookup
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name, keywords');

    if (themesError) throw themesError;

    const themeNameToId: Record<string, string> = {};
    for (const theme of themes || []) {
      themeNameToId[theme.name] = theme.id;
    }

    // Fetch unmapped signals - don't filter by asset_id since many are orphaned
    const { data: unmappedSignals, error: signalsError } = await supabaseClient
      .from('signals')
      .select('id, asset_id, signal_type, value_text')
      .is('theme_id', null)
      .limit(5000); // Process more per batch

    if (signalsError) throw signalsError;

    if (!unmappedSignals || unmappedSignals.length === 0) {
      console.log('✅ No unmapped signals to process');
      return new Response(
        JSON.stringify({ success: true, mapped: 0, skipped: 0, total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Found ${unmappedSignals.length} unmapped signals to process`);

    // Get asset_id → ticker mapping for signals that have valid assets
    const validAssetIds = unmappedSignals
      .filter(s => s.asset_id)
      .map(s => s.asset_id);

    const { data: assets } = await supabaseClient
      .from('assets')
      .select('id, ticker')
      .in('id', validAssetIds);

    const assetIdToTicker: Record<string, string> = {};
    for (const asset of assets || []) {
      if (asset.ticker) {
        assetIdToTicker[asset.id] = asset.ticker;
      }
    }

    let mappedCount = 0;
    let skippedCount = 0;
    const updates: { id: string; theme_id: string; raw: any }[] = [];

    for (const signal of unmappedSignals) {
      let matchedThemeId: string | null = null;
      let mapperRoute = 'none';
      let mapperScore = 0;

      // Strategy 1: Try ticker-based mapping if we have the asset
      const ticker = signal.asset_id ? assetIdToTicker[signal.asset_id] : null;
      if (ticker && TICKER_TO_THEME[ticker]) {
        const themeName = TICKER_TO_THEME[ticker];
        if (themeNameToId[themeName]) {
          matchedThemeId = themeNameToId[themeName];
          mapperRoute = 'ticker';
          mapperScore = 1.0;
        }
      }

      // Strategy 2: Use signal_type → theme mapping
      if (!matchedThemeId && signal.signal_type) {
        const possibleThemes = SIGNAL_TYPE_TO_THEME[signal.signal_type];
        if (possibleThemes && possibleThemes.length > 0) {
          // Pick first theme that exists
          for (const themeName of possibleThemes) {
            if (themeNameToId[themeName]) {
              matchedThemeId = themeNameToId[themeName];
              mapperRoute = 'signal_type';
              mapperScore = 0.8;
              break;
            }
          }
        }
      }

      // Strategy 3: Keyword matching in value_text
      if (!matchedThemeId && signal.value_text) {
        const textLower = signal.value_text.toLowerCase();
        
        for (const theme of themes || []) {
          const keywords = theme.keywords || [];
          for (const keyword of keywords) {
            if (textLower.includes(keyword.toLowerCase())) {
              matchedThemeId = theme.id;
              mapperRoute = 'keyword';
              mapperScore = 0.6;
              break;
            }
          }
          if (matchedThemeId) break;
        }
      }

      // Strategy 4: Fallback to "Big Tech & Consumer" for unmatched signals
      if (!matchedThemeId) {
        const fallbackTheme = themeNameToId["Big Tech & Consumer"] || 
                             themeNameToId["Banks & Financials"] ||
                             (themes && themes[0]?.id);
        if (fallbackTheme) {
          matchedThemeId = fallbackTheme;
          mapperRoute = 'fallback';
          mapperScore = 0.3;
        }
      }

      if (matchedThemeId) {
        updates.push({
          id: signal.id,
          theme_id: matchedThemeId,
          raw: { mapper: mapperRoute, mapper_score: mapperScore }
        });
        mappedCount++;
      } else {
        skippedCount++;
      }
    }

    // Batch update signals
    if (updates.length > 0) {
      console.log(`📝 Updating ${updates.length} signals...`);
      
      // Update in batches of 500
      const batchSize = 500;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        
        for (const update of batch) {
          await supabaseClient
            .from('signals')
            .update({ theme_id: update.theme_id, raw: update.raw })
            .eq('id', update.id);
        }
        
        console.log(`  ✓ Updated batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Batch mapping complete: ${mappedCount} mapped, ${skippedCount} skipped in ${duration}ms`);

    // Log to function_status for monitoring
    await supabaseClient.from('function_status').insert({
      function_name: 'map-signal-to-theme',
      status: 'success',
      rows_inserted: mappedCount,
      rows_skipped: skippedCount,
      duration_ms: duration,
      metadata: {
        total_processed: unmappedSignals.length,
        strategies_used: { ticker: 0, signal_type: 0, keyword: 0, fallback: 0 }
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        mapped: mappedCount,
        skipped: skippedCount,
        total: unmappedSignals.length,
        duration_ms: duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in map-signal-to-theme:', error);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Log failure
    await supabaseClient.from('function_status').insert({
      function_name: 'map-signal-to-theme',
      status: 'failure',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Date.now() - startTime
    });
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
