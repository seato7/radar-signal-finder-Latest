// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// POPULATE SIGNAL-THEME-MAP - Intelligent multi-strategy theme mapping
// ============================================================================

// Expanded theme ticker patterns (100+ tickers per theme)
const THEME_TICKERS: Record<string, string[]> = {
  "AI & Semiconductors": [
    "NVDA", "AMD", "INTC", "AVGO", "QCOM", "MU", "TSM", "ASML", "AMAT", "LRCX", 
    "KLAC", "MRVL", "TXN", "ADI", "NXPI", "ON", "MCHP", "SWKS", "QRVO", "ARM", 
    "SMCI", "SNPS", "CDNS", "PLTR", "AI", "PATH", "SNOW", "DDOG", "MDB", "ESTC",
    "U", "RBLX", "CRWD", "ZS", "NET", "S", "MSFT", "GOOGL", "META", "AMZN",
    "SOUN", "BBAI", "AMBA", "CEVA", "WOLF", "AOSL", "POWI", "DIOD", "SLAB", "SITM",
    "FORM", "IPGP", "COHR", "LITE", "IIVI", "VIAV", "FSLR", "ENPH", "SEDG", "MAXN"
  ],
  "Banks & Financials": [
    "JPM", "BAC", "WFC", "C", "GS", "MS", "USB", "PNC", "TFC", "SCHW", 
    "BLK", "AXP", "SPGI", "CME", "ICE", "BK", "STT", "COF", "DFS", "AIG", 
    "MET", "PRU", "ALL", "TRV", "HBAN", "KEY", "CFG", "RF", "FITB", "MTB",
    "ZION", "CMA", "FHN", "ALLY", "WAL", "EWBC", "SIVB", "FRC", "SBNY", "NYCB",
    "FCNCA", "CBSH", "UMBF", "BOKF", "GBCI", "PACW", "COLB", "CADE", "TCBI", "FFIN",
    "BRK.B", "AFL", "PGR", "CB", "MMC", "AON", "WTW", "AJG", "BRO", "RYAN"
  ],
  "Big Tech & Consumer": [
    "AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "CRM", "ADBE", "ORCL", 
    "IBM", "CSCO", "SAP", "NOW", "INTU", "SNOW", "DDOG", "ZS", "CRWD", "UBER", 
    "LYFT", "SHOP", "SQ", "PYPL", "AFRM", "SOFI", "COIN", "HOOD", "NU", "BILL",
    "TOST", "DASH", "ABNB", "RBLX", "U", "SPOT", "ROKU", "TTD", "ZM", "DOCU",
    "WDAY", "SPLK", "VEEV", "CPNG", "SE", "BABA", "JD", "PDD", "MELI", "GLOB",
    "TWLO", "OKTA", "HUBS", "ZEN", "FIVN", "TEAM", "MDB", "DBX", "BOX", "ASAN"
  ],
  "Biotech & Healthcare": [
    "JNJ", "UNH", "PFE", "MRK", "ABBV", "LLY", "TMO", "DHR", "BMY", "AMGN", 
    "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ISRG", "SYK", "MDT", "ABT", "ZTS", 
    "CVS", "CI", "HUM", "ELV", "MCK", "CAH", "ABC", "CNC", "MOH", "ILMN",
    "DXCM", "ALGN", "PODD", "HOLX", "IDXX", "A", "MTD", "WAT", "IQV", "CRL",
    "SGEN", "ALNY", "BMRN", "INCY", "RARE", "SRPT", "EXEL", "IONS", "NBIX", "ARGX",
    "XENE", "PCVX", "KRYS", "INSM", "RCKT", "BEAM", "NTLA", "CRSP", "EDIT", "VERV"
  ],
  "Clean Energy & EVs": [
    "TSLA", "RIVN", "LCID", "NIO", "XPEV", "LI", "ENPH", "SEDG", "FSLR", "PLUG", 
    "BE", "CHPT", "BLNK", "NEE", "AES", "CEG", "VST", "RUN", "NOVA", "STEM", 
    "HYLN", "GOEV", "FSR", "WKHS", "RIDE", "NKLA", "EVGO", "DCFC", "SBE", "ARVL",
    "QS", "MVST", "ENVX", "AMPX", "GEVO", "AMTX", "PTRA", "REE", "LEV", "XL",
    "CSIQ", "JKS", "DQ", "ARRY", "SHLS", "MAXN", "SPWR", "SUNW", "NOVA", "CWEN",
    "ORA", "GEV", "EIX", "PCG", "XEL", "DUK", "SO", "D", "AEP", "SRE"
  ],
  "Cloud & Cybersecurity": [
    "PANW", "CRWD", "ZS", "FTNT", "NET", "OKTA", "S", "CYBR", "TENB", "VRNS", 
    "QLYS", "RPD", "AKAM", "SAIC", "LDOS", "SPLK", "ESTC", "MDB", "DDOG", "SNOW",
    "CFLT", "SUMO", "NEWR", "PATH", "CLDR", "CLOU", "BUG", "HACK", "WCLD", "IGV",
    "SKYY", "FINX", "IPAY", "ARKK", "ARKW", "ARKG", "ROBO", "BOTZ", "IRBO", "AIQ",
    "FEYE", "MNDT", "CSOD", "ZI", "SEMR", "MTTR", "VIEW", "GRWG", "PLBY", "BMBL",
    "CHGG", "UDMY", "COUR", "SKIL", "DUOL", "2U", "LOPE", "STRA", "PRDO", "GHC"
  ],
  "Commodities & Mining": [
    "FCX", "NEM", "GOLD", "BHP", "RIO", "VALE", "NUE", "STLD", "CLF", "AA", 
    "SCCO", "TECK", "WPM", "FNV", "RGLD", "PAAS", "HL", "AG", "GLD", "SLV", 
    "IAU", "GDXJ", "GDX", "SIL", "SILJ", "PPLT", "PALL", "COPX", "LIT", "REMX",
    "URA", "URNM", "CCJ", "UEC", "DNN", "URG", "NXE", "LEU", "SMR", "LTBR",
    "MP", "UUUU", "LAC", "ALB", "SQM", "LTHM", "PLL", "LIVENT", "SGML", "ALTM",
    "GATO", "EGO", "KGC", "AEM", "AGI", "BTG", "MAG", "FSM", "CDE", "SSRM"
  ],
  "Defense & Aerospace": [
    "LMT", "RTX", "NOC", "GD", "BA", "LHX", "TDG", "HII", "LDOS", "SAIC", 
    "KTOS", "PLTR", "AXON", "RKLB", "LUNR", "ASTR", "SPR", "HXL", "CW", "TXT",
    "MRCY", "BWXT", "PSN", "VVX", "AVAV", "MOG.A", "TGI", "DRS", "CACI", "MANT",
    "MAXR", "SPCE", "VACQ", "ASTR", "RDW", "GILT", "ATRO", "AIR", "HEI", "ESLT",
    "ERJ", "AJRD", "SPIR", "ASTS", "GSAT", "VSAT", "GILAT", "ORBK", "SWKS", "QRVO",
    "IRDM", "OSAT", "VIAV", "II-VI", "LITE", "CIEN", "INFN", "CMTL", "JNPR", "CREE"
  ],
  "Energy & Oil": [
    "XOM", "CVX", "COP", "SLB", "EOG", "PXD", "MPC", "VLO", "PSX", "OXY", 
    "HAL", "DVN", "BKR", "FANG", "HES", "OKE", "WMB", "KMI", "ET", "LNG",
    "EPD", "MMP", "PAA", "MPLX", "PSXP", "CEQP", "DCP", "TRGP", "AM", "WES",
    "CTRA", "APA", "MRO", "CLR", "SM", "PR", "OVV", "CHRD", "MTDR", "PDCE",
    "CNX", "RRC", "EQT", "AR", "SWN", "COG", "CDEV", "CPE", "GPOR", "CRK",
    "NOV", "CHX", "HP", "RIG", "VAL", "DO", "NE", "PTEN", "WHD", "OII"
  ],
  "Fintech & Crypto": [
    "V", "MA", "PYPL", "SQ", "COIN", "MSTR", "HOOD", "SOFI", "AFRM", "UPST", 
    "NU", "BILL", "TOST", "GPN", "FIS", "FISV", "ADP", "PAYX", "BTC", "ETH", 
    "SOL", "XRP", "DOGE", "ADA", "DOT", "AVAX", "MATIC", "LINK", "UNI", "ATOM",
    "NEAR", "APT", "ARB", "OP", "ICP", "FIL", "LTC", "BCH", "XLM", "ALGO",
    "HBAR", "VET", "EGLD", "SAND", "MANA", "AXS", "ENJ", "GALA", "IMX", "APE",
    "RIOT", "MARA", "HUT", "BITF", "CLSK", "CORZ", "IREN", "HIVE", "BTBT", "ARBK"
  ],
  "Food & Agriculture": [
    "ADM", "BG", "CTVA", "FMC", "DE", "AGCO", "MOS", "NTR", "CF", "TSN", 
    "HRL", "GIS", "K", "KHC", "MDLZ", "HSY", "CAG", "SJM", "CPB", "KO", 
    "PEP", "MNST", "STZ", "TAP", "BUD", "SAM", "FIZZ", "COKE", "CCEP", "KDP",
    "PM", "MO", "BTI", "IMBBF", "VGFCF", "SWGAF", "UL", "CL", "CLX", "CHD",
    "KMB", "PG", "EL", "COTY", "IPAR", "ELF", "HAIN", "BYND", "TTCF", "OATLY",
    "JBSS", "SAFM", "PPC", "BRFS", "IBA", "CALM", "JJSF", "LNDC", "SENEA", "THS"
  ],
  "Industrial & Infrastructure": [
    "CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "RTX", "MMM", "ETN", 
    "EMR", "ITW", "PH", "ROK", "CMI", "PCAR", "WM", "RSG", "CNI", "NSC", 
    "CSX", "JBHT", "XPO", "ODFL", "SAIA", "KNX", "WERN", "LSTR", "ARCB", "CHRW",
    "GWW", "FAST", "HD", "LOW", "SHW", "PPG", "APD", "LIN", "ECL", "DD",
    "DOW", "LYB", "CE", "EMN", "HUN", "OLN", "AXTA", "RPM", "VMC", "MLM",
    "EXP", "SUM", "USCR", "CX", "JHX", "BCC", "BLDR", "BECN", "GMS", "TILE"
  ],
  "International & Emerging": [
    "EFA", "VEA", "IEFA", "EEM", "VWO", "IEMG", "VXUS", "IXUS", "EWJ", "FXI", 
    "EWZ", "EWT", "EWY", "INDA", "KWEB", "MCHI", "BABA", "JD", "PDD", "SE",
    "GRAB", "CPNG", "BIDU", "TME", "BILI", "VNET", "KC", "YMM", "GDS", "BEKE",
    "NTES", "WB", "IQ", "ZTO", "YUMC", "ATHM", "LI", "NIO", "XPEV", "BZ",
    "NU", "STNE", "PAGS", "MELI", "DESP", "ARCO", "GLOB", "DLO", "VTEX", "ZAMP",
    "TSM", "ASML", "UMC", "SAP", "NVO", "AZN", "GSK", "RHHBY", "SNY", "NVS"
  ],
  "Media & Entertainment": [
    "DIS", "NFLX", "CMCSA", "WBD", "PARA", "FOX", "FOXA", "SPOT", "ROKU", "TTD", 
    "MGNI", "PUBM", "ZD", "TTWO", "EA", "RBLX", "U", "ATVI", "GENI", "PENN",
    "DKNG", "RSI", "CZR", "MGM", "WYNN", "LVS", "BYD", "RRR", "IGT", "EVRI",
    "NWSA", "NYT", "GANNETT", "TRIB", "LEE", "MNI", "SSP", "GCI", "IHRT", "CMG",
    "LYV", "MSGS", "MSGE", "VIAC", "DISC.A", "AMC", "CNK", "IMAX", "FUN", "SIX",
    "MTN", "SKIS", "SNOW", "VAIL", "EPR", "LNW", "CHDN", "PLYA", "VAC", "H"
  ],
  "Real Estate & REITs": [
    "AMT", "PLD", "EQIX", "PSA", "CCI", "DLR", "O", "SPG", "WELL", "AVB", 
    "EQR", "VTR", "ARE", "MAA", "UDR", "ESS", "INVH", "SBAC", "WY", "BXP",
    "KIM", "REG", "FRT", "SLG", "VNO", "HIW", "CUZ", "JBGS", "PGRE", "HPP",
    "ELS", "SUI", "REXR", "FR", "STAG", "TRNO", "WPC", "NNN", "STOR", "SRC",
    "ADC", "EPRT", "FCPT", "NTST", "BNL", "GTY", "GLPI", "VICI", "MGP", "RLJ",
    "HST", "PK", "SHO", "PEB", "XHR", "DRH", "INN", "APLE", "CLDT", "AHT"
  ],
  "Retail & E-commerce": [
    "WMT", "COST", "TGT", "HD", "LOW", "AMZN", "EBAY", "ETSY", "W", "SHOP", 
    "MELI", "JD", "BABA", "PDD", "SE", "DG", "DLTR", "TJX", "ROST", "BBY", 
    "ULTA", "LULU", "NKE", "DECK", "CROX", "SKX", "VFC", "PVH", "RL", "GIII",
    "TPR", "CPRI", "KORS", "KSS", "M", "JWN", "DDS", "BURL", "GPS", "AEO",
    "ANF", "URBN", "EXPR", "TLYS", "CATO", "PLCE", "BOOT", "GCO", "SCVL", "FL",
    "HIBB", "DKS", "ASO", "BGFV", "WSM", "RH", "LOVE", "COOK", "ARHS", "LL"
  ],
  "Travel & Leisure": [
    "MAR", "HLT", "H", "ABNB", "BKNG", "EXPE", "DAL", "UAL", "LUV", "AAL", 
    "ALK", "CCL", "RCL", "NCLH", "DIS", "CMCSA", "LYV", "MTN", "SIX", "FUN", 
    "WYNN", "LVS", "MGM", "CZR", "PENN", "DKNG", "RSI", "BYD", "GDEN", "RRR",
    "TRIP", "TCOM", "MMYT", "SEIC", "PCLN", "HTHT", "ATAT", "EDU", "TAL", "GOTU",
    "HGV", "VAC", "IHG", "WH", "CHH", "PLYA", "STAY", "BLMN", "DRI", "MCD",
    "YUM", "SBUX", "CMG", "WING", "SHAK", "QSR", "WEN", "JACK", "TXRH", "DENN"
  ]
};

// Sector to theme mapping (for assets with sector metadata)
const SECTOR_TO_THEME: Record<string, string> = {
  'Semiconductors': 'AI & Semiconductors',
  'AI & Machine Learning': 'AI & Semiconductors',
  'Technology': 'Big Tech & Consumer',
  'Financial Services': 'Banks & Financials',
  'Healthcare': 'Biotech & Healthcare',
  'Biotechnology': 'Biotech & Healthcare',
  'Energy': 'Energy & Oil',
  'Clean Energy': 'Clean Energy & EVs',
  'Materials': 'Commodities & Mining',
  'Industrials': 'Industrial & Infrastructure',
  'Transportation': 'Industrial & Infrastructure',
  'Consumer Discretionary': 'Retail & E-commerce',
  'Consumer Staples': 'Food & Agriculture',
  'Real Estate': 'Real Estate & REITs',
  'Communication Services': 'Media & Entertainment',
  'Cryptocurrency': 'Fintech & Crypto',
  'Currency': 'International & Emerging',
  'ETF': 'Big Tech & Consumer',
  'Commodities': 'Commodities & Mining'
};

// Comprehensive signal type to theme mapping
const SIGNAL_TYPE_TO_THEMES: Record<string, string[]> = {
  // ETF flows - distribute based on typical ETF sectors
  "flow_pressure_etf": ["Banks & Financials", "Big Tech & Consumer", "AI & Semiconductors", "Industrial & Infrastructure"],
  
  // Technical signals - distribute across all themes
  "technical_stochastic": ["Big Tech & Consumer", "AI & Semiconductors", "Banks & Financials", "Energy & Oil", "Biotech & Healthcare"],
  "technical_ma_crossover": ["AI & Semiconductors", "Banks & Financials", "Energy & Oil", "Industrial & Infrastructure"],
  "technical_rsi": ["Big Tech & Consumer", "Clean Energy & EVs", "Fintech & Crypto", "Retail & E-commerce"],
  "technical_breakout": ["AI & Semiconductors", "Big Tech & Consumer", "Fintech & Crypto"],
  
  // Chart patterns - wide distribution
  "chart_pattern": ["Big Tech & Consumer", "AI & Semiconductors", "Banks & Financials", "Biotech & Healthcare", "Energy & Oil"],
  
  // Dark pool activity - institutional focused
  "dark_pool_activity": ["Banks & Financials", "Big Tech & Consumer", "AI & Semiconductors", "Biotech & Healthcare"],
  "darkpool_block": ["Banks & Financials", "Big Tech & Consumer", "Energy & Oil"],
  
  // Sentiment signals
  "sentiment_extreme": ["Big Tech & Consumer", "Media & Entertainment", "Fintech & Crypto", "Clean Energy & EVs"],
  "sentiment_shift": ["Big Tech & Consumer", "Media & Entertainment", "Retail & E-commerce"],
  
  // Smart money
  "smart_money_flow": ["Banks & Financials", "AI & Semiconductors", "Big Tech & Consumer"],
  
  // Crypto specific
  "crypto_whale_activity": ["Fintech & Crypto"],
  "crypto_exchange_outflow": ["Fintech & Crypto"],
  "onchain_whale": ["Fintech & Crypto"],
  
  // COT reports
  "cot_positioning": ["Commodities & Mining", "Energy & Oil", "Food & Agriculture"],
  
  // Jobs/growth
  "capex_hiring": ["AI & Semiconductors", "Big Tech & Consumer", "Biotech & Healthcare", "Clean Energy & EVs"],
  
  // Policy related
  "policy_approval": ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"],
  "policy_keyword": ["Clean Energy & EVs", "Defense & Aerospace", "Biotech & Healthcare"],
  
  // Economic indicators
  "economic_indicator": ["Banks & Financials", "Industrial & Infrastructure", "International & Emerging"],
  
  // Big money institutional
  "bigmoney_hold_increase": ["Banks & Financials", "Big Tech & Consumer", "AI & Semiconductors"],
  "bigmoney_hold": ["Banks & Financials", "Big Tech & Consumer"],
  "bigmoney_hold_decrease": ["Banks & Financials", "Big Tech & Consumer", "Energy & Oil"],
  "bigmoney_hold_new": ["AI & Semiconductors", "Biotech & Healthcare", "Clean Energy & EVs"],
  
  // Filings
  "filing_13f_new": ["Banks & Financials", "Big Tech & Consumer", "AI & Semiconductors"],
  "filing_13f_increase": ["Banks & Financials", "Big Tech & Consumer"],
  
  // Insider trading
  "insider_buy": ["Big Tech & Consumer", "Banks & Financials", "Biotech & Healthcare"],
  "insider_sell": ["Big Tech & Consumer", "Banks & Financials"],
  
  // Political
  "politician_buy": ["Defense & Aerospace", "Big Tech & Consumer", "Biotech & Healthcare"],
  "politician_sell": ["Defense & Aerospace", "Big Tech & Consumer"],
  
  // Options
  "options_unusual": ["Big Tech & Consumer", "AI & Semiconductors", "Biotech & Healthcare"],
  
  // Short interest
  "short_squeeze": ["Big Tech & Consumer", "AI & Semiconductors", "Clean Energy & EVs"],
  
  // News/social
  "news_mention": ["Big Tech & Consumer", "AI & Semiconductors", "Media & Entertainment"],
  "social_mention": ["Fintech & Crypto", "Media & Entertainment", "Big Tech & Consumer"],
  
  // Earnings
  "earnings_surprise": ["Big Tech & Consumer", "Banks & Financials", "Biotech & Healthcare"],
  
  // Patents
  "patent_filed": ["AI & Semiconductors", "Biotech & Healthcare", "Clean Energy & EVs"],
  
  // Supply chain
  "supply_chain": ["AI & Semiconductors", "Industrial & Infrastructure", "Retail & E-commerce"],
  
  // Forex
  "forex_sentiment": ["International & Emerging", "Banks & Financials"],
};

// Theme distribution weights for fallback (to avoid overloading Big Tech)
const FALLBACK_THEME_WEIGHTS: Record<string, number> = {
  "Big Tech & Consumer": 15,
  "Banks & Financials": 12,
  "AI & Semiconductors": 12,
  "Biotech & Healthcare": 10,
  "Energy & Oil": 8,
  "Industrial & Infrastructure": 8,
  "Retail & E-commerce": 7,
  "Clean Energy & EVs": 6,
  "Media & Entertainment": 5,
  "Real Estate & REITs": 5,
  "Fintech & Crypto": 4,
  "Commodities & Mining": 3,
  "Defense & Aerospace": 2,
  "Food & Agriculture": 2,
  "Travel & Leisure": 1,
  "International & Emerging": 0, // No fallback to this
  "Cloud & Cybersecurity": 0  // Covered by AI & Semiconductors
};

// Weighted random selection for fallback
function selectWeightedTheme(themes: Map<string, string>): string {
  const entries = Object.entries(FALLBACK_THEME_WEIGHTS)
    .filter(([name]) => themes.has(name));
  
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const [name, weight] of entries) {
    random -= weight;
    if (random <= 0) return name;
  }
  
  return "Big Tech & Consumer"; // Final fallback
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

    console.log("[POPULATE-MAP] Starting intelligent signal-theme mapping...");

    // Get all themes
    const { data: themes, error: themesError } = await supabaseClient
      .from('themes')
      .select('id, name');

    if (themesError) throw themesError;
    
    const themeNameToId = new Map(themes?.map(t => [t.name, t.id]) || []);
    console.log(`[POPULATE-MAP] Found ${themes?.length || 0} themes`);

    // Build ticker to theme mapping (reverse lookup)
    const tickerToThemes = new Map<string, string[]>();
    // FIX: Also build a keyword → theme index to avoid O(n × themes × tickers) per signal
    const keywordToTheme = new Map<string, string>();
    for (const [themeName, tickers] of Object.entries(THEME_TICKERS)) {
      for (const ticker of tickers) {
        const key = ticker.toUpperCase();
        if (!tickerToThemes.has(key)) {
          tickerToThemes.set(key, []);
        }
        tickerToThemes.get(key)!.push(themeName);
        // Pre-index keyword → first theme for O(1) keyword lookup
        if (!keywordToTheme.has(ticker.toLowerCase())) {
          keywordToTheme.set(ticker.toLowerCase(), themeName);
        }
      }
    }

    // Fetch all assets with their metadata (including sector)
    const assetDataMap = new Map<string, { ticker: string; sector?: string; assetClass?: string }>();
    let assetOffset = 0;
    while (true) {
      const { data: assets, error } = await supabaseClient
        .from('assets')
        .select('id, ticker, metadata, asset_class')
        .range(assetOffset, assetOffset + 5000);
      
      if (error) throw error;
      if (!assets || assets.length === 0) break;
      
      for (const asset of assets) {
        assetDataMap.set(asset.id, {
          ticker: asset.ticker.toUpperCase(),
          sector: asset.metadata?.sector,
          assetClass: asset.asset_class
        });
      }
      
      assetOffset += assets.length;
      if (assets.length < 5000) break;
    }
    console.log(`[POPULATE-MAP] Built asset map for ${assetDataMap.size} assets`);

    // Clear existing mappings
    const { error: deleteError } = await supabaseClient
      .from('signal_theme_map')
      .delete()
      .gte('created_at', '1970-01-01');
    
    if (deleteError) {
      console.log(`[POPULATE-MAP] Delete warning: ${deleteError.message}`);
    }

    // Track mapping statistics
    const mappingStats = {
      byTicker: 0,
      bySector: 0,
      bySignalType: 0,
      byKeyword: 0,
      byFallback: 0
    };

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
        let relevanceScore = 0.5;

        // Strategy 1: Asset ticker lookup (highest confidence)
        if (!themeName && signal.asset_id && assetDataMap.has(signal.asset_id)) {
          const assetData = assetDataMap.get(signal.asset_id)!;
          const tickerThemes = tickerToThemes.get(assetData.ticker);
          if (tickerThemes && tickerThemes.length > 0) {
            themeName = tickerThemes[0]; // Primary theme
            relevanceScore = 0.9;
            mappingStats.byTicker++;
          }
        }

        // Strategy 2: Asset sector lookup (high confidence)
        if (!themeName && signal.asset_id && assetDataMap.has(signal.asset_id)) {
          const assetData = assetDataMap.get(signal.asset_id)!;
          if (assetData.sector && SECTOR_TO_THEME[assetData.sector]) {
            themeName = SECTOR_TO_THEME[assetData.sector];
            relevanceScore = 0.7;
            mappingStats.bySector++;
          }
        }

        // Strategy 3: Signal type mapping (medium confidence)
        if (!themeName && signal.signal_type) {
          const typeThemes = SIGNAL_TYPE_TO_THEMES[signal.signal_type];
          if (typeThemes && typeThemes.length > 0) {
            // Distribute across available themes for this signal type
            const randomIndex = Math.floor(Math.random() * typeThemes.length);
            themeName = typeThemes[randomIndex];
            relevanceScore = 0.5;
            mappingStats.bySignalType++;
          }
        }

        // Strategy 4: Keyword matching in value_text - O(1) via pre-built index
        if (!themeName && signal.value_text) {
          const textLower = signal.value_text.toLowerCase();
          const words = textLower.split(/\s+/);
          for (const word of words) {
            const cleanWord = word.replace(/[^a-z0-9]/g, '');
            if (cleanWord.length >= 2 && keywordToTheme.has(cleanWord)) {
              themeName = keywordToTheme.get(cleanWord)!;
              relevanceScore = 0.4;
              mappingStats.byKeyword++;
              break;
            }
          }
        }

        // Strategy 5: Weighted fallback (lower confidence)
        if (!themeName) {
          themeName = selectWeightedTheme(themeNameToId);
          relevanceScore = 0.2;
          mappingStats.byFallback++;
        }

        const themeId = themeNameToId.get(themeName);
        if (themeId) {
          mappingsToInsert.push({
            signal_id: signal.id,
            theme_id: themeId,
            relevance_score: relevanceScore
          });
          totalMapped++;
        } else {
          totalSkipped++;
        }

        // Insert in batches of 1000
        if (mappingsToInsert.length >= 1000) {
          const { error: insertError } = await supabaseClient
            .from('signal_theme_map')
            .insert(mappingsToInsert);
          
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
    console.log(`[POPULATE-MAP] Complete in ${duration}ms`);
    console.log(`[POPULATE-MAP] Stats: ticker=${mappingStats.byTicker}, sector=${mappingStats.bySector}, signalType=${mappingStats.bySignalType}, keyword=${mappingStats.byKeyword}, fallback=${mappingStats.byFallback}`);

    await supabaseClient.from('function_status').insert({
      function_name: 'populate-signal-theme-map',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: totalMapped,
      metadata: { 
        total_signals: signalOffset, 
        mapped: totalMapped, 
        skipped: totalSkipped,
        mapping_stats: mappingStats
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        total_signals: signalOffset,
        mapped: totalMapped,
        skipped: totalSkipped,
        duration_ms: duration,
        mapping_stats: mappingStats
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
