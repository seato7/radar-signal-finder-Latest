// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// THEME SCORING ENGINE - ALPHA-CALIBRATED MODEL (v3.0)
// Aligned with compute-asset-scores: Theme score = aggregated expected return
// ============================================================================

// Signal mass threshold for including assets in theme aggregation
const SIGNAL_MASS_THRESHOLD = 0.001;

// Theme patterns for asset-to-theme mapping - ONLY the 17 active themes
const THEME_PATTERNS: Record<string, {
  tickers: string[];
  etfPatterns: RegExp[];
  namePatterns: RegExp[];
  sectorKeywords: string[];
}> = {
  "AI & Semiconductors": {
    tickers: ["NVDA", "AMD", "INTC", "AVGO", "QCOM", "MU", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "MRVL", "TXN", "ADI", "NXPI", "ON", "MCHP", "SWKS", "QRVO", "ARM", "SMCI", "SNPS", "CDNS"],
    etfPatterns: [/semicon/i, /chip/i, /\bai\b/i, /artificial/i, /robot/i, /smh/i, /soxx/i, /soxq/i],
    namePatterns: [/semiconductor/i, /artificial intelligence/i, /machine learning/i, /neural/i, /gpu/i, /processor/i, /chip/i, /foundry/i],
    sectorKeywords: ["semiconductor", "chips", "artificial intelligence", "machine learning", "gpu", "processor"]
  },
  "Banks & Financials": {
    tickers: ["JPM", "BAC", "WFC", "C", "GS", "MS", "USB", "PNC", "TFC", "SCHW", "BLK", "AXP", "SPGI", "CME", "ICE", "BK", "STT", "COF", "DFS", "AIG", "MET", "PRU", "ALL", "TRV"],
    etfPatterns: [/bank/i, /financ/i, /xlf/i, /vfh/i, /kbe/i, /kre/i, /iai/i, /kie/i, /insurance/i],
    namePatterns: [/bank/i, /financial/i, /capital/i, /investment/i, /credit/i, /lending/i, /insurance/i, /asset management/i, /wealth/i],
    sectorKeywords: ["bank", "financial", "investment", "insurance", "credit", "mortgage", "wealth management", "capital markets"]
  },
  "Big Tech & Consumer": {
    tickers: ["AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "CRM", "ADBE", "ORCL", "IBM", "CSCO", "SAP", "NOW", "INTU", "SNOW", "DDOG", "ZS", "CRWD", "UBER", "LYFT"],
    etfPatterns: [/tech/i, /qqq/i, /nasdaq/i, /growth/i, /innovation/i, /xlk/i, /vgt/i, /ftec/i, /igv/i],
    namePatterns: [/technology/i, /software/i, /internet/i, /digital/i, /e-commerce/i, /cloud/i, /saas/i, /platform/i],
    sectorKeywords: ["technology", "software", "internet", "digital", "big tech", "platform", "enterprise"]
  },
  "Biotech & Healthcare": {
    tickers: ["JNJ", "UNH", "PFE", "MRK", "ABBV", "LLY", "TMO", "DHR", "BMY", "AMGN", "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ISRG", "SYK", "MDT", "ABT", "ZTS", "CVS", "CI", "HUM", "ELV"],
    etfPatterns: [/health/i, /biotech/i, /pharma/i, /med/i, /xbi/i, /ibb/i, /xlv/i, /vht/i, /fbt/i, /drug/i, /genomic/i],
    namePatterns: [/healthcare/i, /biotech/i, /pharmaceutical/i, /medical/i, /therapeutic/i, /clinical/i, /hospital/i, /medicine/i, /vaccine/i, /oncology/i, /diagnostic/i],
    sectorKeywords: ["healthcare", "biotech", "pharmaceutical", "medical", "hospital", "drug", "therapeutics", "diagnostics"]
  },
  "Clean Energy & EVs": {
    tickers: ["TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI", "ENPH", "SEDG", "FSLR", "PLUG", "BE", "CHPT", "BLNK", "NEE", "AES", "CEG", "VST", "RUN", "NOVA", "STEM", "HYLN"],
    etfPatterns: [/clean/i, /solar/i, /wind/i, /renew/i, /green/i, /\bev\b/i, /electric/i, /icln/i, /qcln/i, /tan/i, /fan/i, /lit/i, /driv/i, /battery/i],
    namePatterns: [/clean energy/i, /renewable/i, /solar/i, /wind/i, /electric vehicle/i, /battery/i, /sustainable/i, /green/i, /lithium/i, /hydrogen/i, /fuel cell/i],
    sectorKeywords: ["clean energy", "renewable", "solar", "wind", "electric", "battery", "sustainable", "ev", "hydrogen"]
  },
  "Cloud & Cybersecurity": {
    tickers: ["PANW", "CRWD", "ZS", "FTNT", "NET", "OKTA", "S", "CYBR", "TENB", "VRNS", "QLYS", "RPD", "AKAM", "SAIC", "LDOS", "SPLK", "ESTC", "MDB", "DDOG", "SNOW"],
    etfPatterns: [/cyber/i, /cloud/i, /security/i, /hack/i, /cibr/i, /bug/i, /wcld/i, /skyy/i, /clou/i],
    namePatterns: [/cybersecurity/i, /cloud computing/i, /network security/i, /firewall/i, /encryption/i, /data protection/i, /identity/i, /zero trust/i],
    sectorKeywords: ["cybersecurity", "cloud", "security", "network", "data protection", "saas", "infrastructure"]
  },
  "Commodities & Mining": {
    tickers: ["FCX", "NEM", "GOLD", "BHP", "RIO", "VALE", "NUE", "STLD", "CLF", "AA", "SCCO", "TECK", "WPM", "FNV", "RGLD", "PAAS", "HL", "AG"],
    etfPatterns: [/gold/i, /silver/i, /metal/i, /mining/i, /commod/i, /gdx/i, /gdxj/i, /slv/i, /gld/i, /iau/i, /dbc/i, /dba/i, /cper/i, /steel/i],
    namePatterns: [/gold/i, /silver/i, /mining/i, /metal/i, /commodity/i, /copper/i, /platinum/i, /palladium/i, /iron/i, /steel/i, /aluminum/i, /zinc/i, /nickel/i],
    sectorKeywords: ["gold", "silver", "mining", "metal", "commodity", "steel", "copper", "aluminum", "iron ore"]
  },
  "Defense & Aerospace": {
    tickers: ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "TDG", "HII", "LDOS", "SAIC", "KTOS", "PLTR", "AXON", "RKLB", "LUNR", "ASTR", "SPR"],
    etfPatterns: [/defense/i, /aerospace/i, /space/i, /military/i, /ita/i, /xar/i, /ppa/i, /dfen/i, /ufo/i],
    namePatterns: [/defense/i, /aerospace/i, /military/i, /weapons/i, /aviation/i, /satellite/i, /rocket/i, /space/i, /drone/i],
    sectorKeywords: ["defense", "aerospace", "military", "weapons", "aviation", "space", "satellite", "government contractor"]
  },
  "Energy & Oil": {
    tickers: ["XOM", "CVX", "COP", "SLB", "EOG", "PXD", "MPC", "VLO", "PSX", "OXY", "HAL", "DVN", "BKR", "FANG", "HES", "OKE", "WMB", "KMI", "ET", "LNG"],
    etfPatterns: [/oil/i, /gas/i, /energy(?!.*clean)/i, /petro/i, /xle/i, /vde/i, /oih/i, /xop/i, /uso/i, /ung/i, /mlp/i],
    namePatterns: [/oil/i, /gas/i, /petroleum/i, /crude/i, /natural gas/i, /pipeline/i, /drilling/i, /refin/i, /fossil/i, /lng/i],
    sectorKeywords: ["oil", "gas", "petroleum", "energy", "pipeline", "drilling", "refining", "lng"]
  },
  "Fintech & Crypto": {
    tickers: ["V", "MA", "PYPL", "SQ", "COIN", "MSTR", "HOOD", "SOFI", "AFRM", "UPST", "NU", "BILL", "TOST", "GPN", "FIS", "FISV", "ADP", "PAYX", "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "MATIC", "LINK", "UNI", "LTC", "BNB"],
    etfPatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital asset/i, /arkf/i, /gbtc/i, /bito/i, /blok/i, /bitq/i, /btc/i, /eth/i, /payment/i],
    namePatterns: [/fintech/i, /crypto/i, /bitcoin/i, /blockchain/i, /digital payment/i, /mobile payment/i, /defi/i, /ethereum/i, /forex/i, /currency/i],
    sectorKeywords: ["fintech", "crypto", "blockchain", "digital payment", "cryptocurrency", "forex", "currency", "payments"]
  },
  "Food & Agriculture": {
    tickers: ["ADM", "BG", "CTVA", "FMC", "DE", "AGCO", "MOS", "NTR", "CF", "TSN", "HRL", "GIS", "K", "KHC", "MDLZ", "HSY", "CAG", "SJM", "CPB", "KO", "PEP", "MNST"],
    etfPatterns: [/agri/i, /food/i, /farm/i, /crop/i, /grain/i, /corn/i, /wheat/i, /soy/i, /dba/i, /cow/i, /vegi/i, /moo/i],
    namePatterns: [/agriculture/i, /food/i, /farm/i, /crop/i, /grain/i, /livestock/i, /fertilizer/i, /seed/i, /meat/i, /dairy/i, /beverage/i, /packaged food/i, /snack/i],
    sectorKeywords: ["agriculture", "food", "farm", "crop", "grain", "fertilizer", "livestock", "beverage", "packaged food"]
  },
  "Industrial & Infrastructure": {
    tickers: ["CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "RTX", "MMM", "ETN", "EMR", "ITW", "PH", "ROK", "CMI", "PCAR", "WM", "RSG", "CNI", "NSC", "CSX"],
    etfPatterns: [/industrial/i, /infrastr/i, /construct/i, /xli/i, /vir/i, /pave/i, /ifra/i, /transport/i, /railroad/i],
    namePatterns: [/industrial/i, /infrastructure/i, /manufacturing/i, /construction/i, /machinery/i, /equipment/i, /engineering/i, /transport/i, /railroad/i, /logistics/i],
    sectorKeywords: ["industrial", "infrastructure", "manufacturing", "construction", "machinery", "transportation", "logistics"]
  },
  "International & Emerging": {
    tickers: ["EFA", "VEA", "IEFA", "EEM", "VWO", "IEMG", "VXUS", "IXUS", "EWJ", "FXI", "EWZ", "EWT", "EWY", "INDA", "KWEB", "MCHI", "BABA", "JD", "PDD", "SE"],
    etfPatterns: [/international/i, /emerging/i, /global/i, /foreign/i, /ex.?u\.?s/i, /europe/i, /asia/i, /china/i, /japan/i, /india/i, /brazil/i, /eafe/i, /acwi/i],
    namePatterns: [/international/i, /emerging market/i, /global/i, /foreign/i, /developed market/i, /world/i, /ex-us/i, /china/i, /asia/i, /europe/i],
    sectorKeywords: ["international", "emerging", "global", "foreign", "world", "developed markets", "asia", "europe", "china"]
  },
  "Media & Entertainment": {
    tickers: ["DIS", "NFLX", "CMCSA", "WBD", "PARA", "FOX", "FOXA", "SPOT", "ROKU", "TTD", "MGNI", "PUBM", "ZD", "TTWO", "EA", "RBLX", "U", "ATVI", "GOOGL", "META"],
    etfPatterns: [/media/i, /entertain/i, /stream/i, /gaming/i, /esport/i, /pej/i, /gamr/i, /espo/i, /socl/i],
    namePatterns: [/media/i, /entertainment/i, /streaming/i, /broadcast/i, /content/i, /gaming/i, /video game/i, /esport/i, /movie/i, /film/i, /music/i, /podcast/i, /advertising/i],
    sectorKeywords: ["media", "entertainment", "streaming", "broadcast", "gaming", "movie", "music", "advertising"]
  },
  "Real Estate & REITs": {
    tickers: ["AMT", "PLD", "EQIX", "PSA", "CCI", "DLR", "O", "SPG", "WELL", "AVB", "EQR", "VTR", "ARE", "MAA", "UDR", "ESS", "INVH", "SBAC", "WY"],
    etfPatterns: [/reit/i, /real estate/i, /property/i, /xlre/i, /vnq/i, /iyr/i, /schh/i, /usrt/i, /rem/i, /mort/i, /housing/i],
    namePatterns: [/reit/i, /real estate/i, /property/i, /housing/i, /apartment/i, /commercial property/i, /mortgage/i, /residential/i, /data center/i, /warehouse/i],
    sectorKeywords: ["reit", "real estate", "property", "housing", "mortgage", "apartment", "commercial", "industrial property"]
  },
  "Retail & E-commerce": {
    tickers: ["WMT", "COST", "TGT", "HD", "LOW", "AMZN", "EBAY", "ETSY", "W", "SHOP", "MELI", "JD", "BABA", "PDD", "SE", "DG", "DLTR", "TJX", "ROST", "BBY", "ULTA", "LULU"],
    etfPatterns: [/retail/i, /consumer/i, /e-?commerce/i, /xrt/i, /xly/i, /ibuy/i, /onln/i, /shop/i],
    namePatterns: [/retail/i, /consumer/i, /e-commerce/i, /shopping/i, /department store/i, /discount/i, /online retail/i, /marketplace/i, /apparel/i],
    sectorKeywords: ["retail", "consumer", "e-commerce", "shopping", "department store", "discount", "apparel"]
  },
  "Travel & Leisure": {
    tickers: ["MAR", "HLT", "H", "ABNB", "BKNG", "EXPE", "DAL", "UAL", "LUV", "AAL", "ALK", "CCL", "RCL", "NCLH", "DIS", "CMCSA", "LYV", "MTN", "SIX", "FUN", "WYNN", "LVS", "MGM"],
    etfPatterns: [/travel/i, /leisure/i, /hotel/i, /airline/i, /cruise/i, /jets/i, /away/i, /pej/i, /casino/i, /gaming/i],
    namePatterns: [/travel/i, /hotel/i, /airline/i, /cruise/i, /resort/i, /vacation/i, /tourism/i, /hospitality/i, /entertainment/i, /casino/i, /gaming/i, /theme park/i],
    sectorKeywords: ["travel", "hotel", "airline", "cruise", "resort", "tourism", "leisure", "casino", "hospitality"]
  }
};

// Comprehensive SECTOR → THEME mapping (covers all 26k+ enriched assets)
// NOTE: Keys MUST be lowercase for matching
const SECTOR_TO_THEME: Record<string, { themes: string[]; weights: number[] }> = {
  // Core sectors from actual data
  "industrial manufacturing": { themes: ["Industrial & Infrastructure"], weights: [1.0] },
  "financial services": { themes: ["Banks & Financials"], weights: [1.0] },
  "technology": { themes: ["Big Tech & Consumer", "Cloud & Cybersecurity", "AI & Semiconductors"], weights: [0.4, 0.35, 0.25] },
  "mining & metals": { themes: ["Commodities & Mining"], weights: [1.0] },
  "cryptocurrency": { themes: ["Fintech & Crypto"], weights: [1.0] },
  "biotechnology": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "currency": { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] },
  "banks": { themes: ["Banks & Financials"], weights: [1.0] },
  "healthcare": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "media & entertainment": { themes: ["Media & Entertainment"], weights: [1.0] },
  "oil & gas": { themes: ["Energy & Oil"], weights: [1.0] },
  "clean energy": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "insurance": { themes: ["Banks & Financials"], weights: [1.0] },
  "real estate": { themes: ["Real Estate & REITs"], weights: [1.0] },
  "food & beverage": { themes: ["Food & Agriculture"], weights: [1.0] },
  "utilities": { themes: ["Industrial & Infrastructure", "Clean Energy & EVs"], weights: [0.6, 0.4] },
  "ai & machine learning": { themes: ["AI & Semiconductors", "Cloud & Cybersecurity"], weights: [0.7, 0.3] },
  "telecom": { themes: ["Big Tech & Consumer", "Cloud & Cybersecurity"], weights: [0.6, 0.4] },
  "semiconductors": { themes: ["AI & Semiconductors"], weights: [1.0] },
  "construction": { themes: ["Industrial & Infrastructure", "Real Estate & REITs"], weights: [0.6, 0.4] },
  "aerospace & defense": { themes: ["Defense & Aerospace"], weights: [1.0] },
  // Additional common sectors
  "energy": { themes: ["Energy & Oil"], weights: [1.0] },
  "materials": { themes: ["Commodities & Mining", "Industrial & Infrastructure"], weights: [0.6, 0.4] },
  "fintech": { themes: ["Fintech & Crypto", "Banks & Financials"], weights: [0.7, 0.3] },
  "agriculture": { themes: ["Food & Agriculture"], weights: [1.0] },
  "chemicals": { themes: ["Commodities & Mining", "Industrial & Infrastructure"], weights: [0.5, 0.5] },
  "restaurants": { themes: ["Travel & Leisure", "Food & Agriculture"], weights: [0.7, 0.3] },
  "consumer discretionary": { themes: ["Retail & E-commerce", "Travel & Leisure"], weights: [0.6, 0.4] },
  "communication services": { themes: ["Media & Entertainment", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "industrials": { themes: ["Industrial & Infrastructure"], weights: [1.0] },
  "consumer staples": { themes: ["Food & Agriculture", "Retail & E-commerce"], weights: [0.6, 0.4] },
  "software": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "internet": { themes: ["Big Tech & Consumer", "Media & Entertainment"], weights: [0.7, 0.3] },
  "e-commerce": { themes: ["Retail & E-commerce", "Big Tech & Consumer"], weights: [0.7, 0.3] },
  "gaming": { themes: ["Media & Entertainment", "Travel & Leisure"], weights: [0.7, 0.3] },
  "travel": { themes: ["Travel & Leisure"], weights: [1.0] },
  "hotels": { themes: ["Travel & Leisure", "Real Estate & REITs"], weights: [0.8, 0.2] },
  "airlines": { themes: ["Travel & Leisure"], weights: [1.0] },
  "cruise": { themes: ["Travel & Leisure"], weights: [1.0] },
  "casino": { themes: ["Travel & Leisure", "Media & Entertainment"], weights: [0.7, 0.3] },
  "hospitality": { themes: ["Travel & Leisure"], weights: [1.0] },
  "tourism": { themes: ["Travel & Leisure"], weights: [1.0] },
  "cybersecurity": { themes: ["Cloud & Cybersecurity"], weights: [1.0] },
  "cloud": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.7, 0.3] },
  "cloud computing": { themes: ["Cloud & Cybersecurity"], weights: [1.0] },
  "saas": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "enterprise software": { themes: ["Cloud & Cybersecurity", "Big Tech & Consumer"], weights: [0.6, 0.4] },
  "ev": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "electric vehicles": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "solar": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "renewable": { themes: ["Clean Energy & EVs"], weights: [1.0] },
  "gold": { themes: ["Commodities & Mining"], weights: [1.0] },
  "silver": { themes: ["Commodities & Mining"], weights: [1.0] },
  "pharma": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "pharmaceutical": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "reit": { themes: ["Real Estate & REITs"], weights: [1.0] },
  "medical devices": { themes: ["Biotech & Healthcare"], weights: [1.0] },
  "retail": { themes: ["Retail & E-commerce"], weights: [1.0] },
  "consumer goods": { themes: ["Retail & E-commerce"], weights: [1.0] },
  "etf": { themes: ["Big Tech & Consumer", "Banks & Financials"], weights: [0.5, 0.5] },
  "transportation": { themes: ["Travel & Leisure", "Industrial & Infrastructure"], weights: [0.7, 0.3] },
};

// Default mapping for unmapped assets
const DEFAULT_MAPPING = { themes: ["Big Tech & Consumer"], weights: [1.0] };

/**
 * Extract signal mass from score_explanation JSONB array
 */
function extractSignalMass(scoreExplanation: unknown): number {
  if (!scoreExplanation || !Array.isArray(scoreExplanation)) return 0;
  const massEntry = scoreExplanation.find((e: { k?: string }) => e.k === 'signal_mass');
  if (!massEntry) return 0;
  const val = (massEntry as { v?: unknown }).v;
  return typeof val === 'number' ? val : parseFloat(String(val)) || 0;
}

/**
 * Assign asset to themes based on sector, ticker, name patterns
 */
function assignAssetToThemes(
  ticker: string,
  assetName: string,
  assetClass: string | null,
  sector: string | null
): { themes: string[]; weights: number[] } {
  const nameLower = (assetName || "").toLowerCase();
  const sectorLower = (sector || "").toLowerCase().trim();
  const tickerUpper = ticker.toUpperCase();

  // PRIORITY 1: Direct sector mapping
  if (sectorLower && SECTOR_TO_THEME[sectorLower]) {
    return SECTOR_TO_THEME[sectorLower];
  }

  // PRIORITY 2: Partial sector keyword match
  if (sectorLower) {
    for (const [sectorKey, mapping] of Object.entries(SECTOR_TO_THEME)) {
      if (sectorLower.includes(sectorKey) || sectorKey.includes(sectorLower)) {
        return { themes: mapping.themes, weights: mapping.weights.map(w => w * 0.9) };
      }
    }
  }

  // PRIORITY 3: Explicit ticker list from THEME_PATTERNS
  for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
    if (patterns.tickers.includes(tickerUpper)) {
      return { themes: [themeName], weights: [1.0] };
    }
  }

  // PRIORITY 4: ETF/name pattern matching
  for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
    for (const pattern of patterns.etfPatterns) {
      if (pattern.test(nameLower) || pattern.test(tickerUpper)) {
        return { themes: [themeName], weights: [0.9] };
      }
    }
  }

  // PRIORITY 5: Name pattern matching
  for (const [themeName, patterns] of Object.entries(THEME_PATTERNS)) {
    for (const pattern of patterns.namePatterns) {
      if (pattern.test(nameLower)) {
        return { themes: [themeName], weights: [0.8] };
      }
    }
  }

  // PRIORITY 6: Asset class fallback
  if (assetClass === 'crypto') {
    return { themes: ["Fintech & Crypto"], weights: [1.0] };
  } else if (assetClass === 'forex') {
    return { themes: ["Fintech & Crypto", "International & Emerging"], weights: [0.6, 0.4] };
  } else if (assetClass === 'commodity') {
    return { themes: ["Commodities & Mining"], weights: [1.0] };
  }

  return DEFAULT_MAPPING;
}

/**
 * THEME SCORE CALCULATION - ALIGNED WITH ASSET MODEL (v4.0)
 * 
 * Themes now use the EXACT same scoring formula as individual assets:
 * 1. Calculate weighted average expected_return for the theme
 * 2. Apply the same scoreFromExpected formula used by compute-asset-scores
 * 
 * This ensures themes and assets are on the same scale (15-85 range).
 */
function calculateThemeScore(
  assets: Array<{ expected_return: number; signal_mass: number; weight: number; confidence_score: number }>,
  globalP95Scale: number,
  globalMeanExpectedReturn: number
): { 
  score: number; 
  avgExpectedReturn: number; 
  avgExpectedReturnCentered: number;
  avgConfidenceScore: number;
  bullishMass: number; 
  bearishMass: number;
  totalWeight: number;
} {
  if (assets.length === 0) {
    return { 
      score: 50, 
      avgExpectedReturn: 0, 
      avgExpectedReturnCentered: 0,
      avgConfidenceScore: 0,
      bullishMass: 0, 
      bearishMass: 0,
      totalWeight: 0
    };
  }

  // Calculate weighted average expected_return (same as asset model)
  // Weight = signal_mass × mapping_weight
  let sumWeightedReturn = 0;
  let sumWeightedConfidence = 0;
  let totalWeight = 0;
  let bullishMass = 0;
  let bearishMass = 0;

  for (const asset of assets) {
    const w = asset.signal_mass * asset.weight;
    sumWeightedReturn += asset.expected_return * w;
    sumWeightedConfidence += asset.confidence_score * w;
    totalWeight += w;
    
    if (asset.expected_return > 0) {
      bullishMass += w;
    } else if (asset.expected_return < 0) {
      bearishMass += w;
    }
  }

  if (totalWeight === 0) {
    return { 
      score: 50, 
      avgExpectedReturn: 0, 
      avgExpectedReturnCentered: 0,
      avgConfidenceScore: 0,
      bullishMass: 0, 
      bearishMass: 0,
      totalWeight: 0
    };
  }

  // Weighted average expected return
  const avgExpectedReturn = sumWeightedReturn / totalWeight;
  const avgConfidenceScore = sumWeightedConfidence / totalWeight;
  
  // Center around global mean (same as asset recentering)
  const avgExpectedReturnCentered = avgExpectedReturn - globalMeanExpectedReturn;

  // ═══════════════════════════════════════════════════════════════════════
  // EXACT scoreFromExpected formula from compute-asset-scores
  // ═══════════════════════════════════════════════════════════════════════
  const base = 50;
  const clamp = Math.max(0.005, 2 * globalP95Scale);
  const profitability = Math.max(-clamp, Math.min(clamp, avgExpectedReturnCentered));
  const profitPoints = (profitability / clamp) * 25;
  
  // Confidence contribution (scaled to ±10 points)
  const confPoints = Math.max(-10, Math.min(10, avgConfidenceScore * 5));
  
  const score = Math.max(15, Math.min(85, Math.round((base + profitPoints + confPoints) * 100) / 100));

  return {
    score,
    avgExpectedReturn: Math.round(avgExpectedReturn * 10000) / 10000,
    avgExpectedReturnCentered: Math.round(avgExpectedReturnCentered * 10000) / 10000,
    avgConfidenceScore: Math.round(avgConfidenceScore * 100) / 100,
    bullishMass: Math.round(bullishMass * 10000) / 10000,
    bearishMass: Math.round(bearishMass * 10000) / 10000,
    totalWeight: Math.round(totalWeight * 10000) / 10000
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // FIX: startTime must be inside the handler, not module-level (module-level is shared across concurrent requests)
  const startTime = Date.now();

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[THEME-SCORING-V3] Starting alpha-calibrated theme scoring...');

    // Fetch all themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name');

    if (themesError) throw themesError;
    if (!themes || themes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No themes found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[THEME-SCORING-V3] Found ${themes.length} themes`);

    // Fetch all scored assets with expected_return and signal mass
    // Only include assets with meaningful signal mass (same filter as Asset Radar)
    const { data: allAssets, error: assetsError } = await supabaseClient
      .from('assets')
      .select('id, ticker, name, asset_class, expected_return, confidence_score, computed_score, score_explanation, metadata')
      .not('expected_return', 'is', null)
      .not('computed_score', 'is', null);

    if (assetsError) throw assetsError;
    if (!allAssets || allAssets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No scored assets found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[THEME-SCORING-V3] Found ${allAssets.length} scored assets`);

    // Filter to assets with sufficient signal mass
    const scoredAssets = allAssets.filter(asset => {
      const signalMass = extractSignalMass(asset.score_explanation);
      return signalMass >= SIGNAL_MASS_THRESHOLD;
    });

    console.log(`[THEME-SCORING-V3] ${scoredAssets.length} assets have signal mass >= ${SIGNAL_MASS_THRESHOLD}`);

    // Build theme → assets mapping
    const themeAssets: Map<string, Array<{
      ticker: string;
      expected_return: number;
      confidence_score: number;
      signal_mass: number;
      weight: number;
    }>> = new Map();

    // Initialize all themes from database
    const dbThemeNames = new Set<string>();
    for (const theme of themes) {
      themeAssets.set(theme.name, []);
      dbThemeNames.add(theme.name);
    }
    console.log(`[THEME-SCORING-V3] DB theme names: ${Array.from(dbThemeNames).slice(0, 10).join(', ')}...`);

    // Map each asset to themes
    let mappedCount = 0;
    let unmappedCount = 0;
    const unmappedSectors = new Set<string>();

    for (const asset of scoredAssets) {
      const sector = asset.metadata?.sector || null;
      const mapping = assignAssetToThemes(
        asset.ticker,
        asset.name,
        asset.asset_class,
        sector
      );

      const signalMass = extractSignalMass(asset.score_explanation);

      let wasMapped = false;
      for (let i = 0; i < mapping.themes.length; i++) {
        const themeName = mapping.themes[i];
        const weight = mapping.weights[i];
        
        if (themeAssets.has(themeName)) {
          themeAssets.get(themeName)!.push({
            ticker: asset.ticker,
            expected_return: asset.expected_return || 0,
            confidence_score: asset.confidence_score || 0,
            signal_mass: signalMass,
            weight: weight,
          });
          wasMapped = true;
        }
      }

      if (wasMapped) {
        mappedCount++;
      } else {
        unmappedCount++;
        if (sector) unmappedSectors.add(sector);
      }
    }

    console.log(`[THEME-SCORING-V3] Mapping: ${mappedCount} assets mapped, ${unmappedCount} unmapped`);
    if (unmappedSectors.size > 0) {
      console.log(`[THEME-SCORING-V3] Unmapped sectors: ${Array.from(unmappedSectors).slice(0, 10).join(', ')}`);
    }

    // Log theme asset counts
    for (const [themeName, assets] of themeAssets.entries()) {
      if (assets.length > 0) {
        console.log(`[THEME-SCORING-V3] Theme "${themeName}": ${assets.length} assets`);
      }
    }

    // Calculate GLOBAL P95 scale from all scored assets (same as asset scoring)
    const allAbsReturns = scoredAssets
      .map(a => Math.abs(a.expected_return || 0))
      .filter(r => r > 0)
      .sort((a, b) => a - b);
    const globalP95Index = Math.floor(allAbsReturns.length * 0.95);
    const globalP95Scale = allAbsReturns[globalP95Index] || 0.01;

    // Calculate global mean expected return for recentering (same as assets)
    const allReturns = scoredAssets.map(a => a.expected_return || 0);
    const globalMeanExpectedReturn = allReturns.length > 0 
      ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length 
      : 0;

    console.log(`[THEME-SCORING-V4] Global P95 scale: ${(globalP95Scale * 100).toFixed(4)}%, Global mean: ${(globalMeanExpectedReturn * 100).toFixed(4)}%`);

    // Calculate theme scores using weighted-average approach (same as assets)
    const results: Array<{
      theme_id: string;
      theme_name: string;
      score: number;
      expected_return: number;
      expected_return_centered: number;
      confidence_score: number;
      asset_count: number;
      total_signal_mass: number;
      bullish_mass: number;
      bearish_mass: number;
      top_assets: string[];
      computed_at: string;
    }> = [];

    const now = new Date();

    for (const theme of themes) {
      const assets = themeAssets.get(theme.name) || [];
      
      if (assets.length === 0) {
        // Theme has no mapped assets with signal mass - give neutral score
        results.push({
          theme_id: theme.id,
          theme_name: theme.name,
          score: 50,
          expected_return: 0,
          expected_return_centered: 0,
          confidence_score: 0,
          asset_count: 0,
          total_signal_mass: 0,
          bullish_mass: 0,
          bearish_mass: 0,
          top_assets: [],
          computed_at: now.toISOString(),
        });
        continue;
      }

      // Calculate theme score using weighted-average approach (aligned with assets)
      const { 
        score, 
        avgExpectedReturn, 
        avgExpectedReturnCentered,
        avgConfidenceScore,
        bullishMass, 
        bearishMass 
      } = calculateThemeScore(assets, globalP95Scale, globalMeanExpectedReturn);

      // Calculate total signal mass for display
      let totalSignalMass = 0;
      for (const asset of assets) {
        totalSignalMass += asset.signal_mass;
      }

      // Get top 5 contributing assets by absolute weighted contribution
      const topAssets = [...assets]
        .sort((a, b) => Math.abs(b.expected_return * b.signal_mass) - Math.abs(a.expected_return * a.signal_mass))
        .slice(0, 5)
        .map(a => a.ticker);

      results.push({
        theme_id: theme.id,
        theme_name: theme.name,
        score,
        expected_return: avgExpectedReturn,
        expected_return_centered: avgExpectedReturnCentered,
        confidence_score: avgConfidenceScore,
        asset_count: assets.length,
        total_signal_mass: Math.round(totalSignalMass * 1000) / 1000,
        bullish_mass: bullishMass,
        bearish_mass: bearishMass,
        top_assets: topAssets,
        computed_at: now.toISOString(),
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Log theme distribution with new metrics
    console.log("[THEME-SCORING-V4] Theme scores (weighted-average model):");
    for (const r of results.slice(0, 20)) {
      console.log(`  ${r.theme_name}: score=${r.score.toFixed(1)}, avgReturn=${(r.expected_return*100).toFixed(4)}%, centered=${(r.expected_return_centered*100).toFixed(4)}%, conf=${r.confidence_score.toFixed(2)}, assets=${r.asset_count}`);
    }

    // Update database
    for (const result of results) {
      // Update theme_scores table
      await supabaseClient
        .from('theme_scores')
        .upsert({
          theme_id: result.theme_id,
          score: result.score,
          signal_count: result.asset_count,
          component_scores: {
            expected_return: result.expected_return,
            expected_return_centered: result.expected_return_centered,
            bullish_mass: result.bullish_mass,
            bearish_mass: result.bearish_mass,
            confidence_score: result.confidence_score,
            asset_count: result.asset_count,
            total_signal_mass: result.total_signal_mass,
            top_assets: result.top_assets,
            model_version: 'v4_weighted_avg',
          },
          positive_components: result.top_assets,
          computed_at: result.computed_at,
        }, { onConflict: 'theme_id' });

      // Update themes table
      await supabaseClient
        .from('themes')
        .update({ 
          score: result.score,
          alpha: result.expected_return_centered,
          updated_at: now.toISOString(),
          metadata: {
            expected_return: result.expected_return,
            expected_return_centered: result.expected_return_centered,
            bullish_mass: result.bullish_mass,
            bearish_mass: result.bearish_mass,
            confidence_score: result.confidence_score,
            asset_count: result.asset_count,
            total_signal_mass: result.total_signal_mass,
            top_assets: result.top_assets,
            model_version: 'v4_weighted_avg',
          }
        })
        .eq('id', result.theme_id);
    }

    const duration = Date.now() - startTime;
    console.log(`[THEME-SCORING-V4] Complete in ${duration}ms. ${results.length} themes scored from ${scoredAssets.length} assets`);

    // Log function status
    await supabaseClient.from('function_status').insert({
      function_name: 'compute-theme-scores',
      status: 'success',
      executed_at: now.toISOString(),
      duration_ms: duration,
      rows_inserted: results.length,
      metadata: { 
        themes: results.length,
        total_assets: allAssets.length,
        scored_assets: scoredAssets.length,
        model_version: 'v4_weighted_avg',
        global_p95_scale: globalP95Scale,
        global_mean: globalMeanExpectedReturn,
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        themes: results.length,
        scored_assets: scoredAssets.length,
        duration_ms: duration,
        model_version: 'v4_weighted_avg',
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[THEME-SCORING-V3] Error:', error);
    
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
