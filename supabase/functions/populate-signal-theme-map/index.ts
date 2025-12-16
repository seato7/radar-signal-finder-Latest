import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// POPULATE SIGNAL-THEME-MAP - Maps all signals to themes
// ============================================================================

// Theme ticker patterns for mapping
const THEME_TICKERS: Record<string, string[]> = {
  "AI & Semiconductors": ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "MU", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "MRVL", "TXN", "ADI", "NXPI", "ON", "MCHP", "SWKS", "QRVO", "ARM", "SMCI", "SNPS", "CDNS"],
  "Banks & Financials": ["JPM", "BAC", "WFC", "C", "GS", "MS", "USB", "PNC", "TFC", "SCHW", "BLK", "AXP", "SPGI", "CME", "ICE", "BK", "STT", "COF", "DFS", "AIG", "MET", "PRU", "ALL", "TRV"],
  "Big Tech & Consumer": ["AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "CRM", "ADBE", "ORCL", "IBM", "CSCO", "SAP", "NOW", "INTU", "SNOW", "DDOG", "ZS", "CRWD", "UBER", "LYFT"],
  "Biotech & Healthcare": ["JNJ", "UNH", "PFE", "MRK", "ABBV", "LLY", "TMO", "DHR", "BMY", "AMGN", "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ISRG", "SYK", "MDT", "ABT", "ZTS", "CVS", "CI", "HUM", "ELV"],
  "Clean Energy & EVs": ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI", "ENPH", "SEDG", "FSLR", "PLUG", "BE", "CHPT", "BLNK", "NEE", "AES", "CEG", "VST", "RUN", "NOVA", "STEM", "HYLN"],
  "Cloud & Cybersecurity": ["PANW", "CRWD", "ZS", "FTNT", "NET", "OKTA", "S", "CYBR", "TENB", "VRNS", "QLYS", "RPD", "AKAM", "SAIC", "LDOS", "SPLK", "ESTC", "MDB", "DDOG", "SNOW"],
  "Commodities & Mining": ["FCX", "NEM", "GOLD", "BHP", "RIO", "VALE", "NUE", "STLD", "CLF", "AA", "SCCO", "TECK", "WPM", "FNV", "RGLD", "PAAS", "HL", "AG", "GLD", "SLV", "IAU"],
  "Defense & Aerospace": ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "TDG", "HII", "LDOS", "SAIC", "KTOS", "PLTR", "AXON", "RKLB", "LUNR", "ASTR", "SPR"],
  "Energy & Oil": ["XOM", "CVX", "COP", "SLB", "EOG", "PXD", "MPC", "VLO", "PSX", "OXY", "HAL", "DVN", "BKR", "FANG", "HES", "OKE", "WMB", "KMI", "ET", "LNG"],
  "Fintech & Crypto": ["V", "MA", "PYPL", "SQ", "COIN", "MSTR", "HOOD", "SOFI", "AFRM", "UPST", "NU", "BILL", "TOST", "GPN", "FIS", "FISV", "ADP", "PAYX", "BTC", "ETH", "SOL", "XRP", "DOGE"],
  "Food & Agriculture": ["ADM", "BG", "CTVA", "FMC", "DE", "AGCO", "MOS", "NTR", "CF", "TSN", "HRL", "GIS", "K", "KHC", "MDLZ", "HSY", "CAG", "SJM", "CPB", "KO", "PEP", "MNST"],
  "Industrial & Infrastructure": ["CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "RTX", "MMM", "ETN", "EMR", "ITW", "PH", "ROK", "CMI", "PCAR", "WM", "RSG", "CNI", "NSC", "CSX"],
  "International & Emerging": ["EFA", "VEA", "IEFA", "EEM", "VWO", "IEMG", "VXUS", "IXUS", "EWJ", "FXI", "EWZ", "EWT", "EWY", "INDA", "KWEB", "MCHI", "BABA", "JD", "PDD", "SE"],
  "Media & Entertainment": ["DIS", "NFLX", "CMCSA", "WBD", "PARA", "FOX", "FOXA", "SPOT", "ROKU", "TTD", "MGNI", "PUBM", "ZD", "TTWO", "EA", "RBLX", "U", "ATVI"],
  "Real Estate & REITs": ["AMT", "PLD", "EQIX", "PSA", "CCI", "DLR", "O", "SPG", "WELL", "AVB", "EQR", "VTR", "ARE", "MAA", "UDR", "ESS", "INVH", "SBAC", "WY"],
  "Retail & E-commerce": ["WMT", "COST", "TGT", "HD", "LOW", "AMZN", "EBAY", "ETSY", "W", "SHOP", "MELI", "JD", "BABA", "PDD", "SE", "DG", "DLTR", "TJX", "ROST", "BBY", "ULTA", "LULU"],
  "Travel & Leisure": ["MAR", "HLT", "H", "ABNB", "BKNG", "EXPE", "DAL", "UAL", "LUV", "AAL", "ALK", "CCL", "RCL", "NCLH", "DIS", "CMCSA", "LYV", "MTN", "SIX", "FUN", "WYNN", "LVS", "MGM"]
};

// Signal type to theme mapping
const SIGNAL_TYPE_TO_THEMES: Record<string, string[]> = {
  "flow_pressure_etf": ["Big Tech & Consumer", "Banks & Financials", "AI & Semiconductors"],
  "filing_13f_new": ["Banks & Financials", "Big Tech & Consumer"],
  "filing_13f_increase": ["Banks & Financials", "Big Tech & Consumer"],
  "insider_buy": ["Big Tech & Consumer", "Banks & Financials"],
  "insider_sell": ["Big Tech & Consumer", "Banks & Financials"],
  "politician_buy": ["Defense & Aerospace", "Big Tech & Consumer"],
  "politician_sell": ["Defense & Aerospace", "Big Tech & Consumer"],
  "options_unusual": ["Big Tech & Consumer", "AI & Semiconductors"],
  "darkpool_block": ["Banks & Financials", "Big Tech & Consumer"],
  "short_squeeze": ["Big Tech & Consumer", "AI & Semiconductors"],
  "policy_keyword": ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"],
  "news_mention": ["Big Tech & Consumer", "AI & Semiconductors"],
  "sentiment_shift": ["Big Tech & Consumer", "Media & Entertainment"],
  "social_mention": ["Fintech & Crypto", "Media & Entertainment"],
  "earnings_surprise": ["Big Tech & Consumer", "Banks & Financials"],
  "capex_hiring": ["AI & Semiconductors", "Big Tech & Consumer"],
  "patent_filed": ["AI & Semiconductors", "Biotech & Healthcare"],
  "cot_positioning": ["Commodities & Mining", "Energy & Oil"],
  "onchain_whale": ["Fintech & Crypto"],
  "forex_sentiment": ["Fintech & Crypto", "International & Emerging"],
  "technical_breakout": ["Big Tech & Consumer", "AI & Semiconductors"],
  "supply_chain": ["AI & Semiconductors", "Industrial & Infrastructure"],
  "smart_money_flow": ["Banks & Financials", "Big Tech & Consumer"],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("[POPULATE-MAP] Starting signal-theme-map population...");

    // Get all themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name');

    if (themesError) throw themesError;
    
    const themeNameToId = new Map(themes?.map(t => [t.name, t.id]) || []);
    console.log(`[POPULATE-MAP] Found ${themes?.length || 0} themes`);

    // Build ticker to theme mapping
    const tickerToTheme = new Map<string, string>();
    for (const [themeName, tickers] of Object.entries(THEME_TICKERS)) {
      for (const ticker of tickers) {
        tickerToTheme.set(ticker.toUpperCase(), themeName);
      }
    }

    // Fetch all assets for ticker lookup
    const assetTickerMap = new Map<string, string>();
    let assetOffset = 0;
    while (true) {
      const { data: assets, error } = await supabaseClient
        .from('assets')
        .select('id, ticker')
        .range(assetOffset, assetOffset + 5000);
      
      if (error) throw error;
      if (!assets || assets.length === 0) break;
      
      for (const asset of assets) {
        assetTickerMap.set(asset.id, asset.ticker.toUpperCase());
      }
      
      assetOffset += assets.length;
      if (assets.length < 5000) break;
    }
    console.log(`[POPULATE-MAP] Built ticker map for ${assetTickerMap.size} assets`);

    // Clear existing mappings
    const { error: deleteError } = await supabaseClient
      .from('signal_theme_map')
      .delete()
      .gte('created_at', '1970-01-01');
    
    if (deleteError) {
      console.log(`[POPULATE-MAP] Delete warning: ${deleteError.message}`);
    }

    // Process signals in batches
    let signalOffset = 0;
    let totalMapped = 0;
    let totalSkipped = 0;
    const BATCH_SIZE = 5000;
    const mappingsToInsert: any[] = [];

    while (true) {
      const { data: signals, error } = await supabaseClient
        .from('signals')
        .select('id, signal_type, asset_id, value_text')
        .range(signalOffset, signalOffset + BATCH_SIZE - 1);
      
      if (error) throw error;
      if (!signals || signals.length === 0) break;

      for (const signal of signals) {
        let themeName: string | null = null;

        // 1. Try asset_id → ticker → theme
        if (signal.asset_id && assetTickerMap.has(signal.asset_id)) {
          const ticker = assetTickerMap.get(signal.asset_id)!;
          if (tickerToTheme.has(ticker)) {
            themeName = tickerToTheme.get(ticker)!;
          }
        }

        // 2. Try signal_type → theme
        if (!themeName && signal.signal_type) {
          const typeThemes = SIGNAL_TYPE_TO_THEMES[signal.signal_type];
          if (typeThemes && typeThemes.length > 0) {
            themeName = typeThemes[0]; // Use primary theme
          }
        }

        // 3. Try keyword matching on value_text
        if (!themeName && signal.value_text) {
          const textLower = signal.value_text.toLowerCase();
          for (const [name, tickers] of Object.entries(THEME_TICKERS)) {
            for (const ticker of tickers) {
              if (textLower.includes(ticker.toLowerCase())) {
                themeName = name;
                break;
              }
            }
            if (themeName) break;
          }
        }

        // 4. Default fallback
        if (!themeName) {
          themeName = "Big Tech & Consumer";
        }

        const themeId = themeNameToId.get(themeName);
        if (themeId) {
          mappingsToInsert.push({
            signal_id: signal.id,
            theme_id: themeId,
            relevance_score: 0.5
          });
          totalMapped++;
        } else {
          totalSkipped++;
        }

        // Insert in batches of 1000
        if (mappingsToInsert.length >= 1000) {
          const { error: insertError } = await supabaseClient
            .from('signal_theme_map')
            .insert(mappingsToInsert)
            .select();
          
          if (insertError) {
            console.log(`[POPULATE-MAP] Insert batch error: ${insertError.message}`);
          }
          mappingsToInsert.length = 0;
        }
      }

      signalOffset += signals.length;
      console.log(`[POPULATE-MAP] Processed ${signalOffset} signals, mapped ${totalMapped}...`);
      
      if (signals.length < BATCH_SIZE) break;
    }

    // Insert remaining mappings
    if (mappingsToInsert.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('signal_theme_map')
        .insert(mappingsToInsert);
      
      if (insertError) {
        console.log(`[POPULATE-MAP] Final insert error: ${insertError.message}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[POPULATE-MAP] Complete in ${duration}ms. Mapped ${totalMapped} signals, skipped ${totalSkipped}`);

    await supabaseClient.from('function_status').insert({
      function_name: 'populate-signal-theme-map',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: totalMapped,
      metadata: { total_signals: signalOffset, mapped: totalMapped, skipped: totalSkipped }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        total_signals: signalOffset,
        mapped: totalMapped,
        skipped: totalSkipped,
        duration_ms: duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[POPULATE-MAP] Error:', error);
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
