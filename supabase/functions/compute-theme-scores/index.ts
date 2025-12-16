import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive theme patterns - each theme has multiple matching strategies
const THEME_PATTERNS: Record<string, {
  tickers: string[];
  etfPatterns: RegExp[];
  namePatterns: RegExp[];
  sectorKeywords: string[];
}> = {
  "AI & Semiconductors": {
    tickers: ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "MU", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "MRVL", "TXN", "ADI", "NXPI", "ON", "MCHP", "SWKS", "QRVO", "ARM"],
    etfPatterns: [/semicon/i, /chip/i, /\bai\b/i, /artificial/i, /robot/i, /smh/i, /soxx/i],
    namePatterns: [/semiconductor/i, /artificial intelligence/i, /machine learning/i, /neural/i, /gpu/i, /processor/i, /chip/i],
    sectorKeywords: ["semiconductor", "chips", "artificial intelligence", "machine learning"]
  },
  "Big Tech & Consumer": {
    tickers: ["AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "TSLA", "CRM", "ADBE", "ORCL", "IBM", "CSCO", "SAP", "NOW", "INTU", "SNOW", "DDOG", "ZS", "CRWD"],
    etfPatterns: [/tech/i, /qqq/i, /nasdaq/i, /growth/i, /innovation/i, /xlk/i, /vgt/i, /ftec/i],
    namePatterns: [/technology/i, /software/i, /internet/i, /digital/i, /e-commerce/i, /cloud/i, /saas/i],
    sectorKeywords: ["technology", "software", "internet", "digital", "big tech"]
  },
  "Cloud & Cybersecurity": {
    tickers: ["PANW", "CRWD", "ZS", "FTNT", "NET", "OKTA", "S", "CYBR", "TENB", "VRNS", "QLYS", "RPD", "AKAM", "SAIC", "LDOS"],
    etfPatterns: [/cyber/i, /cloud/i, /security/i, /hack/i, /cibr/i, /bug/i, /wcld/i, /skyy/i],
    namePatterns: [/cybersecurity/i, /cloud computing/i, /network security/i, /firewall/i, /encryption/i, /data protection/i],
    sectorKeywords: ["cybersecurity", "cloud", "security", "network", "data protection"]
  },
  "Biotech & Healthcare": {
    tickers: ["JNJ", "UNH", "PFE", "MRK", "ABBV", "LLY", "TMO", "DHR", "BMY", "AMGN", "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ISRG", "SYK", "MDT", "ABT", "ZTS"],
    etfPatterns: [/health/i, /biotech/i, /pharma/i, /med/i, /xbi/i, /ibb/i, /xlv/i, /vht/i, /fbt/i, /drug/i],
    namePatterns: [/healthcare/i, /biotech/i, /pharmaceutical/i, /medical/i, /therapeutic/i, /clinical/i, /hospital/i, /medicine/i, /vaccine/i, /oncology/i],
    sectorKeywords: ["healthcare", "biotech", "pharmaceutical", "medical", "hospital", "drug"]
  },
  "Clean Energy & EVs": {
    tickers: ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI", "ENPH", "SEDG", "FSLR", "PLUG", "BE", "CHPT", "BLNK", "NEE", "AES", "CEG", "VST", "RUN", "NOVA"],
    etfPatterns: [/clean/i, /solar/i, /wind/i, /renew/i, /green/i, /\bev\b/i, /electric/i, /icln/i, /qcln/i, /tan/i, /fan/i, /lit/i, /driv/i],
    namePatterns: [/clean energy/i, /renewable/i, /solar/i, /wind/i, /electric vehicle/i, /battery/i, /sustainable/i, /green/i, /lithium/i, /hydrogen/i],
    sectorKeywords: ["clean energy", "renewable", "solar", "wind", "electric", "battery", "sustainable"]
  },
  "Defense & Aerospace": {
    tickers: ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "TDG", "HII", "LDOS", "SAIC", "KTOS", "PLTR", "AXON", "RKLB", "LUNR"],
    etfPatterns: [/defense/i, /aerospace/i, /space/i, /military/i, /ita/i, /xar/i, /ppa/i, /dfen/i, /ufo/i],
    namePatterns: [/defense/i, /aerospace/i, /military/i, /weapons/i, /aviation/i, /satellite/i, /rocket/i, /space/i],
    sectorKeywords: ["defense", "aerospace", "military", "weapons", "aviation", "space"]
  },
  "Banks & Financials": {
    tickers: ["JPM", "BAC", "WFC", "C", "GS", "MS", "USB", "PNC", "TFC", "SCHW", "BLK", "AXP", "SPGI", "CME", "ICE", "BK", "STT", "COF", "DFS"],
    etfPatterns: [/bank/i, /financ/i, /xlf/i, /vfh/i, /kbe/i, /kre/i, /iai/i, /kie/i],
    namePatterns: [/bank/i, /financial/i, /capital/i, /investment/i, /credit/i, /lending/i, /insurance/i, /asset management/i],
    sectorKeywords: ["bank", "financial", "investment", "insurance", "credit"]
  },
  "Fintech & Crypto": {
    tickers: ["V", "MA", "PYPL", "SQ", "COIN", "MSTR", "HOOD", "SOFI", "AFRM", "UPST", "NU", "BILL", "TOST", "GPN", "FIS", "FISV", "ADP", "PAYX"],
    etfPatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital asset/i, /arkf/i, /gbtc/i, /bito/i, /blok/i, /bitq/i, /btc/i, /eth/i],
    namePatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital payment/i, /mobile payment/i, /defi/i, /ethereum/i],
    sectorKeywords: ["fintech", "crypto", "blockchain", "digital payment", "cryptocurrency"]
  },
  "Energy & Oil": {
    tickers: ["XOM", "CVX", "COP", "SLB", "EOG", "PXD", "MPC", "VLO", "PSX", "OXY", "HAL", "DVN", "BKR", "FANG", "HES", "OKE", "WMB", "KMI", "ET"],
    etfPatterns: [/oil/i, /gas/i, /energy(?!.*clean)/i, /petro/i, /xle/i, /vde/i, /oih/i, /xop/i, /uso/i, /ung/i, /mlp/i],
    namePatterns: [/oil/i, /gas/i, /petroleum/i, /crude/i, /natural gas/i, /pipeline/i, /drilling/i, /refin/i, /fossil/i],
    sectorKeywords: ["oil", "gas", "petroleum", "energy", "pipeline", "drilling"]
  },
  "Real Estate & REITs": {
    tickers: ["AMT", "PLD", "EQIX", "PSA", "CCI", "DLR", "O", "SPG", "WELL", "AVB", "EQR", "VTR", "ARE", "MAA", "UDR", "ESS", "INVH", "SBAC"],
    etfPatterns: [/reit/i, /real estate/i, /property/i, /xlre/i, /vnq/i, /iyr/i, /schh/i, /usrt/i, /rem/i, /mort/i],
    namePatterns: [/reit/i, /real estate/i, /property/i, /housing/i, /apartment/i, /commercial property/i, /mortgage/i, /residential/i],
    sectorKeywords: ["reit", "real estate", "property", "housing", "mortgage"]
  },
  "Industrial & Infrastructure": {
    tickers: ["CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "RTX", "MMM", "ETN", "EMR", "ITW", "PH", "ROK", "CMI", "PCAR", "WM", "RSG"],
    etfPatterns: [/industrial/i, /infrastr/i, /construct/i, /xli/i, /vir/i, /pave/i, /ifra/i],
    namePatterns: [/industrial/i, /infrastructure/i, /manufacturing/i, /construction/i, /machinery/i, /equipment/i, /engineering/i, /transport/i, /railroad/i, /logistics/i],
    sectorKeywords: ["industrial", "infrastructure", "manufacturing", "construction", "machinery"]
  },
  "Commodities & Mining": {
    tickers: ["FCX", "NEM", "GOLD", "BHP", "RIO", "VALE", "NUE", "STLD", "CLF", "AA", "SCCO", "TECK", "WPM", "FNV", "RGLD", "PAAS", "HL", "AG", "SLV", "GLD", "IAU"],
    etfPatterns: [/gold/i, /silver/i, /metal/i, /mining/i, /commod/i, /gdx/i, /gdxj/i, /slv/i, /gld/i, /iau/i, /dbc/i, /dba/i, /dbo/i, /ung/i, /corn/i, /weat/i, /soyb/i, /cper/i],
    namePatterns: [/gold/i, /silver/i, /mining/i, /metal/i, /commodity/i, /copper/i, /platinum/i, /palladium/i, /iron/i, /steel/i, /aluminum/i, /zinc/i, /nickel/i],
    sectorKeywords: ["gold", "silver", "mining", "metal", "commodity", "steel"]
  },
  "Retail & E-commerce": {
    tickers: ["WMT", "COST", "TGT", "HD", "LOW", "AMZN", "EBAY", "ETSY", "W", "SHOP", "MELI", "JD", "BABA", "PDD", "SE", "DG", "DLTR", "TJX", "ROST", "BBY"],
    etfPatterns: [/retail/i, /consumer/i, /e-?commerce/i, /xrt/i, /xly/i, /ibuy/i, /onln/i],
    namePatterns: [/retail/i, /consumer/i, /e-commerce/i, /shopping/i, /department store/i, /discount/i, /online retail/i, /marketplace/i],
    sectorKeywords: ["retail", "consumer", "e-commerce", "shopping", "department store"]
  },
  "Travel & Leisure": {
    tickers: ["MAR", "HLT", "H", "ABNB", "BKNG", "EXPE", "DAL", "UAL", "LUV", "AAL", "ALK", "CCL", "RCL", "NCLH", "DIS", "CMCSA", "PARA", "WBD", "LYV", "MTN"],
    etfPatterns: [/travel/i, /leisure/i, /hotel/i, /airline/i, /cruise/i, /jets/i, /away/i, /pej/i],
    namePatterns: [/travel/i, /hotel/i, /airline/i, /cruise/i, /resort/i, /vacation/i, /tourism/i, /hospitality/i, /entertainment/i, /casino/i, /gaming/i],
    sectorKeywords: ["travel", "hotel", "airline", "cruise", "resort", "tourism", "leisure"]
  },
  "Media & Entertainment": {
    tickers: ["DIS", "NFLX", "CMCSA", "WBD", "PARA", "FOX", "FOXA", "SPOT", "ROKU", "TTD", "MGNI", "PUBM", "ZD", "TTWO", "EA", "RBLX", "U", "ATVI"],
    etfPatterns: [/media/i, /entertain/i, /stream/i, /gaming/i, /esport/i, /pej/i, /gamr/i, /espo/i],
    namePatterns: [/media/i, /entertainment/i, /streaming/i, /broadcast/i, /content/i, /gaming/i, /video game/i, /esport/i, /movie/i, /film/i, /music/i, /podcast/i],
    sectorKeywords: ["media", "entertainment", "streaming", "broadcast", "gaming", "movie"]
  },
  "Food & Agriculture": {
    tickers: ["ADM", "BG", "CTVA", "FMC", "DE", "AGCO", "MOS", "NTR", "CF", "TSN", "HRL", "GIS", "K", "KHC", "MDLZ", "HSY", "CAG", "SJM", "CPB"],
    etfPatterns: [/agri/i, /food/i, /farm/i, /crop/i, /grain/i, /corn/i, /wheat/i, /soy/i, /dba/i, /cow/i, /vegi/i, /crop/i, /moo/i],
    namePatterns: [/agriculture/i, /food/i, /farm/i, /crop/i, /grain/i, /livestock/i, /fertilizer/i, /seed/i, /meat/i, /dairy/i, /beverage/i, /packaged food/i],
    sectorKeywords: ["agriculture", "food", "farm", "crop", "grain", "fertilizer", "livestock"]
  },
  // NEW BROAD-MARKET THEMES
  "Fixed Income & Bonds": {
    tickers: ["BND", "AGG", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "MUB", "TIP", "VCIT", "VCSH", "GOVT", "SCHZ", "BSV", "BIV", "BLV"],
    etfPatterns: [/bond/i, /treasury/i, /fixed income/i, /corporate/i, /municipal/i, /high yield/i, /investment grade/i, /govt/i, /tip/i, /muni/i, /aggregate/i, /duration/i, /maturity/i, /coupon/i, /intermediate/i, /short.?term/i, /long.?term/i, /floating/i],
    namePatterns: [/bond/i, /treasury/i, /fixed income/i, /debt/i, /corporate bond/i, /municipal/i, /government/i, /yield/i, /coupon/i, /maturity/i, /credit/i, /investment grade/i, /high yield/i, /junk/i],
    sectorKeywords: ["bond", "treasury", "fixed income", "debt", "municipal", "corporate bond"]
  },
  "Growth & Allocation": {
    tickers: ["VTI", "VOO", "IVV", "SPY", "VT", "VXUS", "ACWI", "AOR", "AOM", "AOA", "AOK"],
    etfPatterns: [/allocation/i, /balanced/i, /moderate/i, /aggressive/i, /conservative/i, /60.?40/i, /80.?20/i, /70.?30/i, /multi.?asset/i, /asset allocation/i, /lifecycle/i, /strategy/i, /tactical/i, /dynamic/i, /flexible/i, /hybrid/i],
    namePatterns: [/allocation/i, /balanced/i, /growth/i, /value/i, /blend/i, /moderate/i, /aggressive/i, /conservative/i, /portfolio/i, /multi-asset/i, /strategic/i, /tactical/i],
    sectorKeywords: ["allocation", "balanced", "growth", "value", "blend", "multi-asset", "portfolio"]
  },
  "International & Emerging": {
    tickers: ["EFA", "VEA", "IEFA", "EEM", "VWO", "IEMG", "VXUS", "IXUS", "EWJ", "FXI", "EWZ", "EWT", "EWY", "INDA", "KWEB", "MCHI"],
    etfPatterns: [/international/i, /emerging/i, /global/i, /foreign/i, /msci/i, /ex.?u\.?s/i, /europe/i, /asia/i, /pacific/i, /china/i, /japan/i, /india/i, /brazil/i, /developed/i, /world/i, /frontier/i, /latin/i, /eafe/i, /acwi/i],
    namePatterns: [/international/i, /emerging market/i, /global/i, /foreign/i, /developed market/i, /world/i, /ex-us/i, /europe/i, /asia/i, /pacific/i, /china/i, /japan/i, /india/i, /brazil/i, /latin america/i, /frontier/i],
    sectorKeywords: ["international", "emerging", "global", "foreign", "world", "developed markets"]
  },
  "Index & Passive": {
    tickers: ["SPY", "IVV", "VOO", "VTI", "QQQ", "IWM", "VB", "VTV", "VUG", "VIG", "SCHD", "NOBL", "RSP"],
    etfPatterns: [/s\&?p\s?500/i, /index/i, /total market/i, /broad market/i, /core/i, /passive/i, /tracker/i, /equal weight/i, /cap.?weight/i, /market cap/i, /russell/i, /wilshire/i, /nasdaq.?100/i, /dow jones/i, /mid.?cap/i, /small.?cap/i, /large.?cap/i, /micro.?cap/i, /blend/i],
    namePatterns: [/index/i, /s\&p 500/i, /total stock/i, /total market/i, /broad market/i, /passive/i, /core/i, /tracker/i, /benchmark/i, /russell/i, /nasdaq 100/i, /dow/i, /large cap/i, /mid cap/i, /small cap/i],
    sectorKeywords: ["index", "s&p 500", "total market", "passive", "benchmark", "market cap"]
  },
  "Income & Dividend": {
    tickers: ["SCHD", "VYM", "HDV", "DVY", "SPHD", "SPYD", "VIG", "DGRO", "SDY", "NOBL", "DIVO", "JEPI", "JEPQ", "QYLD", "XYLD", "NUSI"],
    etfPatterns: [/dividend/i, /income/i, /yield/i, /distribution/i, /equity income/i, /high dividend/i, /div/i, /covered call/i, /premium income/i, /monthly income/i, /aristocrat/i, /achiever/i, /grower/i, /quality dividend/i],
    namePatterns: [/dividend/i, /income/i, /yield/i, /distribution/i, /equity income/i, /high yield/i, /covered call/i, /premium/i, /aristocrat/i, /achiever/i, /grower/i, /payer/i],
    sectorKeywords: ["dividend", "income", "yield", "distribution", "equity income", "high dividend"]
  },
  "Retirement & Target Date": {
    tickers: [],
    etfPatterns: [/target/i, /retirement/i, /20[2-6][0-9]/i, /lifetime/i, /freedom/i, /lifecycle/i, /path/i, /journey/i, /glide/i, /date/i, /horizon/i, /through/i, /to\s+20/i, /in\s+retirement/i, /age.?based/i],
    namePatterns: [/target date/i, /target.?20[2-6][0-9]/i, /retirement 20/i, /20[2-6][0-9] fund/i, /lifetime/i, /freedom 20/i, /lifecycle/i, /pathway/i, /journey/i, /glide path/i, /horizon/i, /through 20/i, /to 20[2-6][0-9]/i, /in retirement/i],
    sectorKeywords: ["target date", "retirement", "2025", "2030", "2035", "2040", "2045", "2050", "2055", "2060", "2065", "lifetime", "freedom"]
  }
};

// Signal type to theme fallback mapping
const SIGNAL_TYPE_FALLBACKS: Record<string, string[]> = {
  "flow_pressure_etf": ["Index & Passive", "Growth & Allocation"],
  "dark_pool_activity": ["Banks & Financials", "Big Tech & Consumer"],
  "smart_money_flow": ["Banks & Financials", "Big Tech & Consumer"],
  "insider_buy": ["Big Tech & Consumer", "Banks & Financials"],
  "insider_sell": ["Big Tech & Consumer", "Banks & Financials"],
  "congressional_buy": ["Big Tech & Consumer", "Defense & Aerospace"],
  "congressional_sell": ["Big Tech & Consumer", "Defense & Aerospace"],
  "options_unusual": ["Big Tech & Consumer", "AI & Semiconductors"],
  "sentiment_extreme": ["Big Tech & Consumer", "AI & Semiconductors"],
  "technical_breakout": ["Big Tech & Consumer", "Index & Passive"],
  "technical_breakdown": ["Big Tech & Consumer", "Index & Passive"],
  "crypto_whale_activity": ["Fintech & Crypto"],
  "crypto_exchange_flow": ["Fintech & Crypto"],
  "policy_approval": ["Banks & Financials", "Energy & Oil"],
  "policy_rejection": ["Banks & Financials", "Energy & Oil"],
};

function assignAssetToThemes(
  ticker: string,
  assetName: string,
  assetClass: string | null,
  sector: string | null
): { themes: string[]; weights: number[] } {
  const matchedThemes: { theme: string; weight: number }[] = [];
  const nameLower = (assetName || "").toLowerCase();
  const sectorLower = (sector || "").toLowerCase();
  const tickerUpper = ticker.toUpperCase();

  for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
    let matched = false;
    let weight = 1.0;

    // 1. Direct ticker match (highest priority, full weight)
    if (patterns.tickers.includes(tickerUpper)) {
      matched = true;
      weight = 1.0;
    }

    // 2. ETF pattern match on name
    if (!matched) {
      for (const pattern of patterns.etfPatterns) {
        if (pattern.test(nameLower) || pattern.test(tickerUpper)) {
          matched = true;
          weight = 0.9;
          break;
        }
      }
    }

    // 3. Name pattern match
    if (!matched) {
      for (const pattern of patterns.namePatterns) {
        if (pattern.test(nameLower)) {
          matched = true;
          weight = 0.8;
          break;
        }
      }
    }

    // 4. Sector keyword match
    if (!matched && sectorLower) {
      for (const keyword of patterns.sectorKeywords) {
        if (sectorLower.includes(keyword.toLowerCase())) {
          matched = true;
          weight = 0.7;
          break;
        }
      }
    }

    if (matched) {
      matchedThemes.push({ theme: themeName, weight });
    }
  }

  // Asset class based fallbacks for unmatched assets
  if (matchedThemes.length === 0) {
    if (assetClass === "crypto") {
      matchedThemes.push({ theme: "Fintech & Crypto", weight: 0.6 });
    } else if (assetClass === "forex") {
      matchedThemes.push({ theme: "International & Emerging", weight: 0.5 });
    } else if (assetClass === "commodity") {
      matchedThemes.push({ theme: "Commodities & Mining", weight: 0.6 });
    } else if (assetClass === "etf" || assetClass === "mutual_fund") {
      matchedThemes.push({ theme: "Index & Passive", weight: 0.4 });
    } else if (assetClass === "stock") {
      matchedThemes.push({ theme: "Big Tech & Consumer", weight: 0.3 });
    }
  }

  // Last resort - assign to Growth & Allocation (catches everything)
  if (matchedThemes.length === 0) {
    matchedThemes.push({ theme: "Growth & Allocation", weight: 0.2 });
  }

  const totalWeight = matchedThemes.reduce((sum, m) => sum + m.weight, 0);
  return {
    themes: matchedThemes.map(m => m.theme),
    weights: matchedThemes.map(m => m.weight / totalWeight)
  };
}

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

    console.log("[THEME-SCORING] Starting comprehensive theme computation...");

    // Fetch all themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name');

    if (themesError) throw themesError;
    console.log(`[THEME-SCORING] Found ${themes?.length || 0} themes`);

    const themeNameToId = new Map(themes?.map(t => [t.name, t.id]) || []);

    // Fetch ALL assets with pagination
    const allAssets: any[] = [];
    let assetOffset = 0;
    const ASSET_BATCH = 5000;
    while (true) {
      const { data: batch, error } = await supabaseClient
        .from('assets')
        .select('id, ticker, name, asset_class, metadata')
        .range(assetOffset, assetOffset + ASSET_BATCH - 1);
      
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      allAssets.push(...batch);
      assetOffset += batch.length;
      if (batch.length < ASSET_BATCH) break;
    }
    console.log(`[THEME-SCORING] Loaded ${allAssets.length} assets`);

    // Build asset to themes mapping
    const assetToThemes = new Map<string, { themes: string[]; weights: number[] }>();
    const tickerToAssetId = new Map<string, string>();
    
    for (const asset of allAssets) {
      const sector = asset.metadata?.sector || asset.metadata?.industry || null;
      const mapping = assignAssetToThemes(asset.ticker, asset.name, asset.asset_class, sector);
      assetToThemes.set(asset.id, mapping);
      tickerToAssetId.set(asset.ticker.toUpperCase(), asset.id);
    }

    // Count theme assignments
    const themeAssetCounts: Record<string, number> = {};
    for (const mapping of assetToThemes.values()) {
      for (const theme of mapping.themes) {
        themeAssetCounts[theme] = (themeAssetCounts[theme] || 0) + 1;
      }
    }
    console.log("[THEME-SCORING] Theme asset distribution:", themeAssetCounts);

    // Fetch ALL signals with pagination (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allSignals: any[] = [];
    let signalOffset = 0;
    const SIGNAL_BATCH = 5000;
    while (true) {
      const { data: batch, error } = await supabaseClient
        .from('signals')
        .select('id, signal_type, asset_id, magnitude, direction, observed_at')
        .gte('observed_at', thirtyDaysAgo.toISOString())
        .range(signalOffset, signalOffset + SIGNAL_BATCH - 1)
        .order('observed_at', { ascending: false });
      
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      allSignals.push(...batch);
      signalOffset += batch.length;
      if (batch.length < SIGNAL_BATCH) break;
    }
    console.log(`[THEME-SCORING] Loaded ${allSignals.length} signals from last 30 days`);

    // Process signals and map to themes
    const themeScores: Record<string, {
      signalCount: number;
      totalMagnitude: number;
      positiveSignals: number;
      negativeSignals: number;
      signalIds: string[];
    }> = {};

    for (const theme of themes || []) {
      themeScores[theme.name] = {
        signalCount: 0,
        totalMagnitude: 0,
        positiveSignals: 0,
        negativeSignals: 0,
        signalIds: []
      };
    }

    const signalThemeMappings: { signal_id: string; theme_id: string; weight: number }[] = [];

    for (const signal of allSignals) {
      let signalThemes: string[] = [];
      let weights: number[] = [];

      // Try to map via asset_id
      if (signal.asset_id && assetToThemes.has(signal.asset_id)) {
        const mapping = assetToThemes.get(signal.asset_id)!;
        signalThemes = mapping.themes;
        weights = mapping.weights;
      }

      // Fallback: use signal type to assign to default themes
      if (signalThemes.length === 0 && signal.signal_type) {
        const fallbackThemes = SIGNAL_TYPE_FALLBACKS[signal.signal_type];
        if (fallbackThemes) {
          signalThemes = fallbackThemes;
          weights = fallbackThemes.map(() => 1 / fallbackThemes.length);
        }
      }

      // Last resort: assign to Growth & Allocation
      if (signalThemes.length === 0) {
        signalThemes = ["Growth & Allocation"];
        weights = [1.0];
      }

      // Apply signal to matched themes
      for (let i = 0; i < signalThemes.length; i++) {
        const themeName = signalThemes[i];
        const weight = weights[i];
        
        if (themeScores[themeName]) {
          themeScores[themeName].signalCount++;
          themeScores[themeName].totalMagnitude += (signal.magnitude || 1) * weight;
          
          if (signal.direction === 'up' || signal.direction === 'bullish') {
            themeScores[themeName].positiveSignals++;
          } else if (signal.direction === 'down' || signal.direction === 'bearish') {
            themeScores[themeName].negativeSignals++;
          }
          
          themeScores[themeName].signalIds.push(signal.id);

          const themeId = themeNameToId.get(themeName);
          if (themeId) {
            signalThemeMappings.push({
              signal_id: signal.id,
              theme_id: themeId,
              weight: weight
            });
          }
        }
      }
    }

    console.log(`[THEME-SCORING] Created ${signalThemeMappings.length} signal-theme mappings`);

    // Calculate final scores for each theme
    const results: any[] = [];
    const now = new Date();

    for (const theme of themes || []) {
      const stats = themeScores[theme.name];
      if (!stats) continue;

      let score = 50;
      
      if (stats.signalCount > 0) {
        const signalBoost = Math.min(30, Math.log10(stats.signalCount + 1) * 15);
        const totalDirectional = stats.positiveSignals + stats.negativeSignals;
        let sentimentScore = 0;
        if (totalDirectional > 0) {
          const positiveRatio = stats.positiveSignals / totalDirectional;
          sentimentScore = (positiveRatio - 0.5) * 40;
        }
        const avgMagnitude = stats.totalMagnitude / stats.signalCount;
        const magnitudeBoost = Math.min(10, avgMagnitude * 5);
        
        score = 50 + signalBoost + sentimentScore + magnitudeBoost;
        score = Math.max(0, Math.min(100, score));
      }

      results.push({
        theme_id: theme.id,
        theme_name: theme.name,
        score: Math.round(score * 100) / 100,
        signal_count: stats.signalCount,
        positive_signals: stats.positiveSignals,
        negative_signals: stats.negativeSignals,
        computed_at: now.toISOString()
      });
    }

    results.sort((a, b) => b.score - a.score);

    // Update theme_scores and themes tables
    for (const result of results) {
      await supabaseClient
        .from('theme_scores')
        .upsert({
          theme_id: result.theme_id,
          score: result.score,
          signal_count: result.signal_count,
          component_scores: {
            positive_signals: result.positive_signals,
            negative_signals: result.negative_signals
          },
          positive_components: result.positive_signals > result.negative_signals ? ['bullish_momentum'] : [],
          computed_at: result.computed_at
        }, { onConflict: 'theme_id' });

      await supabaseClient
        .from('themes')
        .update({ score: result.score, updated_at: now.toISOString() })
        .eq('id', result.theme_id);
    }

    // Clear old mappings and insert new
    await supabaseClient.from('signal_theme_map').delete().lt('created_at', thirtyDaysAgo.toISOString());

    const MAPPING_BATCH = 1000;
    let insertedMappings = 0;
    for (let i = 0; i < signalThemeMappings.length; i += MAPPING_BATCH) {
      const batch = signalThemeMappings.slice(i, i + MAPPING_BATCH);
      const { error: mapError } = await supabaseClient
        .from('signal_theme_map')
        .upsert(batch, { onConflict: 'signal_id,theme_id', ignoreDuplicates: true });
      
      if (!mapError) insertedMappings += batch.length;
    }

    const duration = Date.now() - startTime;
    console.log(`[THEME-SCORING] Complete in ${duration}ms. ${results.length} themes, ${allSignals.length} signals, ${insertedMappings} mappings`);

    await supabaseClient.from('function_status').insert({
      function_name: 'compute-theme-scores',
      status: 'success',
      executed_at: now.toISOString(),
      duration_ms: duration,
      rows_inserted: insertedMappings,
      metadata: { themes: results.length, signals: allSignals.length, assets: allAssets.length, distribution: themeAssetCounts }
    });

    return new Response(
      JSON.stringify({ success: true, themes: results.length, signals: allSignals.length, mappings: insertedMappings, duration_ms: duration, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[THEME-SCORING] Error:', error);
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    await supabaseClient.from('function_status').insert({
      function_name: 'compute-theme-scores',
      status: 'error',
      executed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
